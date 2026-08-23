# @variax-ai/video-renderer

Framework-agnostic Canvas2D renderer for the Variax video format. Give it a
`VideoDocument` and it hands back a function that draws any frame:

```ts
drawer(ctx, tMs)
```

That is the whole model. There is no clock, no playback loop and no output
format — the renderer draws one frame at a time into a 2D context you own, so
the same code serves a `requestAnimationFrame` preview in a browser and an
offline encode in Node.

Zero runtime dependencies beyond `@variax-ai/video-schema` (types only). Built
with tsup, published as ESM + CJS.

## Install

```sh
npm install @variax-ai/video-renderer
```

## Usage

```ts
import { createDocumentDrawer } from '@variax-ai/video-renderer'

const drawer = createDocumentDrawer(doc, { vars: { name: 'Ada' }, images: {} })

const canvas = document.querySelector('canvas')!
canvas.width = doc.width
canvas.height = doc.height
const ctx = canvas.getContext('2d')!

function frame(now: number) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawer(ctx, now % doc.durationMs)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

`createDocumentDrawer` does the per-document work once — resolving `defs`,
building the font registry, indexing layers by `id` — so the returned drawer is
cheap enough to call at frame rate. Rebuild it when the document changes, not
when the time does.

## Options

```ts
interface RendererOptions {
  vars: Record<string, string | number | boolean>
  images: Record<string, CanvasImageSource>
  components?: Record<string, ComponentDrawer>
  dataVizRenderers?: Record<string, DataVizDrawer>
  createCanvas?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas
  constraints?: RendererConstraints
}
```

- **`vars`** back every `"$var:name"` reference, and decide which `visibleIf`
  layers exist in the frame.
- **`images`** are already-decoded sources keyed by asset id — the renderer
  never fetches. Decode with `createImageBitmap`, an `<img>`, or
  `@napi-rs/canvas`'s `loadImage`, and pass the result in.
- **`components`** back `ref` layers and **`dataVizRenderers`** back `dataViz`
  layers. Both are host code handed the raw context, so what they paint is
  yours to get right — `constraints` cannot reach inside them.
- **`createCanvas`** supplies the offscreen surface that `compositeMask` and
  downscale blur need. Optional in a browser, which has `OffscreenCanvas`;
  required in Node, where the renderer throws without it.
- **`constraints`** (`minDownscaleBlurPx`, `minDownscaleShrink`) are host-side
  floors on how sharply an image may ever be drawn. They clamp rather than warn,
  and setting `minDownscaleBlurPx` forces every `image` layer through the
  downscale-blur path even when the document declares no blur.

## Node.js

Node has no canvas, so supply one:

```ts
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createDocumentDrawer } from '@variax-ai/video-renderer'

const canvas = createCanvas(doc.width, doc.height)
const ctx = canvas.getContext('2d')

const drawer = createDocumentDrawer(doc, {
  vars: {},
  images: { hero: await loadImage('hero.png') },
  createCanvas: (w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement,
})

for (let f = 0; f < (doc.durationMs / 1000) * doc.fps; f++) {
  ctx.clearRect(0, 0, doc.width, doc.height)
  drawer(ctx, (f / doc.fps) * 1000)
  // canvas.toBuffer('image/png') → your encoder
}
```

Frames are drawn on demand from a time value, so seeking is free and encodes
parallelise: nothing carries state between frames.

## Fonts

**The renderer never loads a typeface.** A font asset's `src` is *advisory* — it
records where the face can be obtained, and nothing fetches it. Every declared
family must already be loaded before the first frame is drawn.

This failure is silent: an unloaded family falls through the asset's `fallback`
to a generic, and the text renders in the wrong face at the wrong metrics with
no error. Preload from `requiredFonts(doc)`, which lists what the document
declares along with the weight and CSS stack the renderer will ask for:

```ts
import { requiredFonts } from '@variax-ai/video-renderer'

await Promise.all(
  requiredFonts(doc).map(async (font) => {
    const face = new FontFace(font.family, `url(${font.src})`, { weight: String(font.weight) })
    document.fonts.add(await face.load())
  }),
)
```

Give each font asset a `fallback` naming a face you know is present, so a miss
degrades to something chosen rather than to bare `sans-serif`.

## Defs

`resolveDocumentDefs(doc)` is what `createDocumentDrawer` calls internally, and
it is exported because a host that inspects or diffs documents wants the same
resolved form. It substitutes every `"$def:name"` once, so all references share
one value rather than a copy of it — which is what keeps a `trail` and the layer
casting it in step. A cycle throws `CyclicDefError`; a name that does not exist
is left alone, and evaluates to zero (or draws nothing, for a `use`).

## What it draws

Every layer type in the schema: `shape`, `text`, `image`, `group`, `ref`,
`repeater`, `captionSequence`, `compositeMask`, `trail`, `dataViz` and
`statBeat` — plus `use`, which is substituted away at load rather than drawn.
Effects are `gaussianBlur`, `dropShadow` and `downscaleBlur`; generators are the
closed set `sine`, `sineStrokes`, `sineOscillation`, `pulse`, `countUp`.

The renderer is **defensive per layer**: a layer it cannot draw is skipped, not
thrown on, so one bad layer costs one layer rather than the frame. That is
damage control, not validation — reject malformed documents up front with
`@variax-ai/video-schema`'s JSON Schema.

## Testing

```sh
npm test          # vitest, jsdom
npm run test:watch
```

Rendering is covered by snapshot and regression suites in `src/`, including
acceptance tests that draw whole documents.

## Licence

[MIT](../../LICENSE)
