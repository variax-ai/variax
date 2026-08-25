/**
 * Loading the TrustMark ONNX models.
 *
 * ONNX Runtime is a peer dependency, and a heavy one, so it is imported
 * dynamically and only when a session is actually created — `onnxruntime-node`
 * under Node, `onnxruntime-web` in a browser. Hosts that already manage their
 * own runtime (a shared WASM build, a WebGPU session, a worker) can bypass all
 * of this by supplying `runtime`.
 *
 * The models themselves are not redistributed here. They are fetched from
 * Adobe's host on first use and, under Node, cached to disk.
 */

export type Variant = 'Q' | 'P'

export interface VariantConfig {
  /** Input size of the encoder, always 256. */
  encodeSize: number
  /**
   * Input size of the decoder.
   *
   * Note the references disagree: the Python package uses 245 for Q, but that
   * applies to its PyTorch checkpoints. Both ONNX consumers — Adobe's Rust
   * crate and their browser decoder — use 256, and these are the ONNX models.
   */
  decodeSize: number
  /** Extra embedding strength applied for this variant. */
  strengthMultiplier: number
}

export const VARIANTS: Record<Variant, VariantConfig> = {
  Q: { encodeSize: 256, decodeSize: 256, strengthMultiplier: 1.0 },
  P: { encodeSize: 256, decodeSize: 224, strengthMultiplier: 1.25 },
}

export const DEFAULT_VARIANT: Variant = 'Q'

export const DEFAULT_MODELS_URL =
  'https://cai-watermark.adobe.net/watermarking/trustmark-models/'

/** Input and output names baked into the exported graphs. */
export const ENCODER_IMAGE_INPUT = 'onnx::Concat_0'
export const ENCODER_BITS_INPUT = 'onnx::Gemm_1'
export const ENCODER_OUTPUT = 'image'
export const DECODER_INPUT = 'image'
export const DECODER_OUTPUT = 'output'

export interface TensorLike {
  data: Float32Array
  dims: readonly number[]
}

export interface Session {
  run(feeds: Record<string, TensorLike>): Promise<Record<string, TensorLike>>
}

export interface Runtime {
  createSession(model: Uint8Array): Promise<Session>
}

export interface ModelOptions {
  variant?: Variant
  /** Base URL for the ONNX files. Must end with a slash. */
  modelsUrl?: string
  /** Node only: directory to cache downloaded models in. */
  cacheDir?: string
  /** Supply your own ONNX Runtime instead of the dynamically imported default. */
  runtime?: Runtime
  /** Pre-fetched model bytes, bypassing the network entirely. */
  models?: { encoder?: Uint8Array; decoder?: Uint8Array }
}

function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  )
}

/** The slice of the `onnxruntime-*` API this package uses. */
export interface OrtModule {
  InferenceSession: {
    create(model: Uint8Array, options?: unknown): Promise<unknown>
  }
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: readonly number[],
  ) => unknown
}

/**
 * Adapt an `onnxruntime-*` module to the narrow `Runtime` shape above, so the
 * rest of the package never touches the ort API directly.
 *
 * Exported because hosts often have an ort instance already — a shared WASM
 * build, a WebGPU session, one living in a worker — and configuring it is their
 * business, not this package's. Pass the module here rather than reimplementing
 * the wrapper:
 *
 * ```ts
 * import * as ort from 'onnxruntime-web'
 * ort.env.wasm.numThreads = 1
 * const wm = await Watermarker.create({ runtime: createRuntime(ort) })
 * ```
 *
 * @param sessionOptions passed straight through to `InferenceSession.create`,
 *        for things like `executionProviders`.
 */
export function createRuntime(
  ort: OrtModule,
  sessionOptions?: unknown,
): Runtime {
  return {
    async createSession(model: Uint8Array): Promise<Session> {
      const session = (await ort.InferenceSession.create(
        model,
        sessionOptions,
      )) as {
        run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>
      }
      return {
        async run(feeds) {
          const wrapped: Record<string, unknown> = {}
          for (const [name, tensor] of Object.entries(feeds)) {
            wrapped[name] = new ort.Tensor('float32', tensor.data, tensor.dims)
          }
          return session.run(wrapped)
        },
      }
    },
  }
}

let defaultRuntime: Promise<Runtime> | undefined

/** Dynamically import whichever ONNX Runtime build fits the current platform. */
export function getDefaultRuntime(): Promise<Runtime> {
  defaultRuntime ??= (async () => {
    const moduleName = isNode() ? 'onnxruntime-node' : 'onnxruntime-web'
    try {
      // Indirection keeps bundlers from trying to resolve both builds eagerly.
      const imported = await import(/* @vite-ignore */ moduleName)
      return createRuntime(imported.default ?? imported)
    } catch (cause) {
      throw new Error(
        `${moduleName} is required to run the watermark models. Install it, ` +
          `or pass your own \`runtime\` in the options.`,
        { cause },
      )
    }
  })().catch((error: unknown) => {
    // Only successes are worth memoising. Caching the rejection would make a
    // missing dependency permanent for the life of the process, even once it
    // has been installed.
    defaultRuntime = undefined
    throw error
  })
  return defaultRuntime
}

/**
 * Built at runtime so bundlers cannot see it.
 *
 * The on-disk cache below is Node-only and guarded by `isNode()`, but a static
 * `import('node:fs/promises')` is resolved by bundlers at *build* time, not run
 * time — so a browser build fails on a branch it would never execute. tsup also
 * strips the `node:` prefix, turning it into a bare `"fs/promises"` specifier
 * that looks like a missing npm package. Composing the specifier keeps this
 * entry point genuinely browser-safe.
 */
const NODE_PREFIX = 'node:'

async function cachePathFor(
  cacheDir: string,
  filename: string,
): Promise<string> {
  const path = await import(/* @vite-ignore */ `${NODE_PREFIX}path`)
  return path.join(cacheDir, filename)
}

/** Fetch a model, using the on-disk cache under Node when one is configured. */
export async function loadModelBytes(
  filename: string,
  options: ModelOptions = {},
): Promise<Uint8Array> {
  const { cacheDir, modelsUrl = DEFAULT_MODELS_URL } = options

  if (cacheDir && isNode()) {
    const fs = await import(/* @vite-ignore */ `${NODE_PREFIX}fs/promises`)
    const target = await cachePathFor(cacheDir, filename)
    try {
      return new Uint8Array(await fs.readFile(target))
    } catch {
      // Not cached yet — fall through and download.
    }

    const bytes = await download(modelsUrl + filename)
    await fs.mkdir(cacheDir, { recursive: true })

    // Publish the cache entry atomically. Writing straight to `target` leaves a
    // truncated model behind if the process dies mid-write, and every later run
    // would load that corpse and fail deep inside ONNX Runtime instead.
    const staging = `${target}.${process.pid}.${Date.now()}.tmp`
    try {
      await fs.writeFile(staging, bytes)
      await fs.rename(staging, target)
    } catch (error) {
      await fs.rm(staging, { force: true }).catch(() => {})
      throw error
    }
    return bytes
  }

  return download(modelsUrl + filename)
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

export interface LoadedModels {
  variant: Variant
  config: VariantConfig
  encoder: Session
  /**
   * The decoder, loaded on first call and memoised after.
   *
   * Embedding never runs the decoder, and it is by far the larger of the two
   * files — so a host that only watermarks frames never pays for it.
   */
  decoder(): Promise<Session>
}

/**
 * Load the models. Sessions are expensive to build — create this once and
 * reuse it across every frame and every video.
 *
 * Only the encoder is built here. The decoder is fetched the first time
 * something extracts, because embedding never touches it.
 */
export async function loadModels(
  options: ModelOptions = {},
): Promise<LoadedModels> {
  const variant = options.variant ?? DEFAULT_VARIANT
  const runtime = options.runtime ?? (await getDefaultRuntime())

  const encoderBytes =
    options.models?.encoder ?? (await loadModelBytes(`encoder_${variant}.onnx`, options))
  const encoder = await runtime.createSession(encoderBytes)

  // Snapshot just the fields the deferred load needs, rather than closing over
  // `options` itself. Capturing the whole object would keep `options.models`
  // reachable for the lifetime of the returned object — including the encoder
  // bytes, which are spent the moment the session above is built, and which a
  // browser host is told to supply exactly so it can free them. It also pins
  // `modelsUrl` and `cacheDir` here, next to `variant`, so a caller mutating
  // the options object afterwards cannot pair one model with another's host.
  const fetchOptions: ModelOptions = {
    variant,
    modelsUrl: options.modelsUrl,
    cacheDir: options.cacheDir,
  }
  let suppliedDecoder = options.models?.decoder

  // The promise, not the session, so two concurrent extracts share one
  // download rather than racing two of them.
  let decoder: Promise<Session> | undefined

  return {
    variant,
    config: VARIANTS[variant],
    encoder,
    decoder(): Promise<Session> {
      decoder ??= (async () => {
        const bytes =
          suppliedDecoder ??
          (await loadModelBytes(`decoder_${variant}.onnx`, fetchOptions))
        const session = await runtime.createSession(bytes)
        // Released only once the session owns the weights: dropping it any
        // earlier would send a retry to the network for bytes the caller had
        // already handed us.
        suppliedDecoder = undefined
        return session
      })().catch((error: unknown) => {
        // Only successes are worth memoising, for the same reason as
        // `getDefaultRuntime` above: a transient network failure should not
        // make extraction permanently impossible for this instance.
        decoder = undefined
        throw error
      })
      return decoder
    },
  }
}
