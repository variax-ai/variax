import type { VideoDocument } from '@variax-ai/video-schema'

const DEF_PREFIX = '$def:'

/** Strips the `$def:` prefix if present; a bare name is accepted too. */
function defName(ref: string): string {
  return ref.startsWith(DEF_PREFIX) ? ref.slice(DEF_PREFIX.length) : ref
}

function isDefRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(DEF_PREFIX)
}

function isUseLayer(value: unknown): value is { type: 'use'; def: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'use' &&
    typeof (value as { def?: unknown }).def === 'string'
  )
}

/**
 * Thrown when a def refers to itself, directly or through others. There is no
 * value such a document could resolve to, and expanding it would not terminate.
 */
export class CyclicDefError extends Error {
  readonly cycle: string[]

  constructor(cycle: string[]) {
    super(`Cyclic $def reference: ${cycle.join(' → ')}`)
    this.name = 'CyclicDefError'
    this.cycle = cycle
  }
}

/**
 * Replaces every `$def:` reference and `use` layer with the value it names.
 *
 * JSON has no references, so anything a document reuses is written out
 * verbatim — for a path shared by four layers, that is four copies on the wire
 * of an expression that has to stay one expression, since the layers sampling
 * it desynchronise the moment they drift apart. `defs` names the value once;
 * this resolves the names once, when the document is loaded, so the four
 * references end up as four pointers to one array rather than four arrays.
 *
 * A reference to a name that does not exist is left as it stands: an
 * unresolvable animated value evaluates to zero and an unresolvable `use` draws
 * nothing, which is how the renderer treats every other malformed layer. A
 * cycle throws, because it has no rendering at all.
 */
export function resolveDocumentDefs(doc: VideoDocument): VideoDocument {
  const defs = doc.defs
  if (!defs || Object.keys(defs).length === 0) return doc

  const resolved = new Map<string, unknown>()
  const inProgress: string[] = []

  function resolveDef(name: string): unknown {
    if (resolved.has(name)) return resolved.get(name)
    if (!(name in defs!)) return undefined

    const cycleAt = inProgress.indexOf(name)
    if (cycleAt !== -1) throw new CyclicDefError([...inProgress.slice(cycleAt), name])

    inProgress.push(name)
    // A def may reference another def, so its own body is resolved too.
    const value = walk(defs![name] as unknown)
    inProgress.pop()

    resolved.set(name, value)
    return value
  }

  function walk(node: unknown): unknown {
    if (isDefRef(node)) {
      const value = resolveDef(defName(node))
      // An unknown name stays a string; nothing downstream will match it.
      return value === undefined ? node : value
    }

    if (Array.isArray(node)) {
      let changed = false
      const out: unknown[] = []
      for (const item of node) {
        if (isUseLayer(item)) {
          const value = resolveDef(defName(item.def))
          if (value === undefined) {
            // Keep the `use` in place; drawLayer no-ops on it.
            out.push(item)
          } else if (Array.isArray(value)) {
            // A def holding several layers splices in, keeping the order of
            // the layers around it.
            out.push(...value)
          } else {
            out.push(value)
          }
          changed = true
          continue
        }
        const next = walk(item)
        if (next !== item) changed = true
        out.push(next)
      }
      return changed ? out : node
    }

    if (typeof node === 'object' && node !== null) {
      let changed = false
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const next = walk(value)
        if (next !== value) changed = true
        out[key] = next
      }
      return changed ? out : node
    }

    return node
  }

  // `defs` itself is resolved through the references that reach it, so the map
  // is not walked here — an unused def costs nothing.
  const out: VideoDocument = { ...doc, scenes: walk(doc.scenes) as VideoDocument['scenes'] }
  return out
}
