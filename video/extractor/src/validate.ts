import type { VideoDocument, Scene, Layer } from '@variax-ai/video-schema'

// Must mirror the Layer union in video/schema/json/v1.json — validateLayers
// drops anything not listed here silently, so a missing entry makes a valid
// layer disappear with no diagnostic.
const VALID_LAYER_TYPES = new Set([
  'shape', 'text', 'image', 'group',
  'ref', 'repeater', 'captionSequence', 'compositeMask', 'trail', 'dataViz', 'statBeat',
])

export function validateDocument(doc: unknown): VideoDocument {
  if (typeof doc !== 'object' || doc === null) {
    throw new Error('Document must be a non-null object')
  }

  const d = doc as Record<string, unknown>

  const result: VideoDocument = {
    version: 1,
    width: requirePositiveInt(d, 'width'),
    height: requirePositiveInt(d, 'height'),
    fps: requirePositiveNumber(d, 'fps'),
    durationMs: requirePositiveNumber(d, 'durationMs'),
    scenes: validateScenes(d.scenes),
  }

  if (d.tokens && typeof d.tokens === 'object') {
    result.tokens = d.tokens as VideoDocument['tokens']
  }
  if (d.assets && typeof d.assets === 'object') {
    result.assets = d.assets as VideoDocument['assets']
  }
  if (d.vars && typeof d.vars === 'object') {
    result.vars = d.vars as VideoDocument['vars']
  }

  return result
}

function validateScenes(raw: unknown): VideoDocument['scenes'] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Document must have at least one scene')
  }
  return raw.map(validateScene) as [Scene, ...Scene[]]
}

function validateScene(raw: unknown, index: number): Scene {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Scene at index ${index} must be a non-null object`)
  }
  const s = raw as Record<string, unknown>

  const scene: Scene = {
    id: typeof s.id === 'string' ? s.id : `scene-${index}`,
    startMs: requireNonNegativeNumber(s, 'startMs', `scene ${index}`),
    endMs: requirePositiveNumber(s, 'endMs', `scene ${index}`),
    layers: validateLayers(s.layers, index),
  }

  if (s.background !== undefined) {
    scene.background = s.background as Scene['background']
  }

  return scene
}

function validateLayers(raw: unknown, sceneIndex: number): Layer[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Scene ${sceneIndex} layers must be an array`)
  }
  return raw.filter((l): l is Layer => {
    if (typeof l !== 'object' || l === null) return false
    const layer = l as Record<string, unknown>
    return typeof layer.type === 'string' && VALID_LAYER_TYPES.has(layer.type)
  })
}

function requirePositiveInt(
  obj: Record<string, unknown>,
  field: string,
  context = 'document',
): number {
  const val = obj[field]
  if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) {
    throw new Error(`${context} ${field} must be a positive integer`)
  }
  return val
}

function requirePositiveNumber(
  obj: Record<string, unknown>,
  field: string,
  context = 'document',
): number {
  const val = obj[field]
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    throw new Error(`${context} ${field} must be a positive number`)
  }
  return val
}

function requireNonNegativeNumber(
  obj: Record<string, unknown>,
  field: string,
  context = 'document',
): number {
  const val = obj[field]
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
    throw new Error(`${context} ${field} must be a non-negative number`)
  }
  return val
}
