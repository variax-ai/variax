import type { Layer, VideoDocument } from '@variax-ai/video-schema'

/**
 * Indexes every layer that declared an `id`, wherever it sits — inside a group,
 * a repeater, or a compositeMask's source or mask.
 *
 * A duplicate id keeps the first layer found, in document order. The schema
 * asks for ids to be unique and cannot enforce it, and picking one deterministic
 * winner beats having the answer depend on traversal order.
 */
export function indexLayersById(doc: VideoDocument): Record<string, Layer> {
  const index: Record<string, Layer> = {}

  function visit(layer: Layer): void {
    if (layer.id && !(layer.id in index)) index[layer.id] = layer

    if (layer.type === 'group') {
      for (const child of layer.children) visit(child)
    } else if (layer.type === 'repeater') {
      visit(layer.child)
    } else if (layer.type === 'compositeMask') {
      visit(layer.mask)
      if (typeof layer.source === 'object' && layer.source !== null) visit(layer.source)
    }
  }

  for (const scene of doc.scenes) {
    for (const layer of scene.layers) visit(layer)
  }
  return index
}
