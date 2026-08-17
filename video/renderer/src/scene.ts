import type { VideoDocument, Scene } from '@variax-ai/video-schema'
import type { RenderContext, PersistedLayer } from './types'
import { drawBackground } from './background'
import { drawLayer } from './layers/index'

function findActiveScene(doc: VideoDocument, tMs: number): Scene | undefined {
  for (const scene of doc.scenes) {
    if (tMs >= scene.startMs && tMs < scene.endMs) return scene
  }
  return doc.scenes[doc.scenes.length - 1]
}

function collectPersistedLayers(doc: VideoDocument, currentScene: Scene): PersistedLayer[] {
  const persisted: PersistedLayer[] = []
  for (const scene of doc.scenes) {
    if (scene === currentScene) break
    if (scene.endMs > currentScene.startMs) continue
    for (const layer of scene.layers) {
      if ('persist' in layer && layer.persist) {
        persisted.push({ layer, sceneEndMs: scene.endMs })
      }
    }
  }
  return persisted
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  tMs: number,
  doc: VideoDocument,
  rctx: RenderContext,
): void {
  const scene = findActiveScene(doc, tMs)
  if (!scene) return

  rctx.sceneStartMs = scene.startMs

  drawBackground(ctx, scene.background, rctx.width, rctx.height, rctx.resolve)

  const persisted = collectPersistedLayers(doc, scene)
  for (const p of persisted) {
    drawLayer(ctx, p.layer, tMs, rctx)
  }

  for (const layer of scene.layers) {
    drawLayer(ctx, layer, tMs, rctx)
  }
}
