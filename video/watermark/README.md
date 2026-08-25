# @variax-ai/video-watermark

Hidden (forensic) watermarking for video. Embeds an identifier into the pixels of
a frame so it survives export, re-encoding and rescaling, and can be recovered
from the delivered video.

Built on [adobe/trustmark](https://github.com/adobe/trustmark) (MIT), whose
published JavaScript can only *decode*. The encoder here is a TypeScript
implementation of their pipeline against the same ONNX models.

This package works on **pixels, not documents**. It has no dependency on
`@variax-ai/video-schema` or the renderer, so it works equally well on video that
never came from a `VideoDocument`.

## Install

```sh
npm install @variax-ai/video-watermark onnxruntime-node
```

`onnxruntime-node` (Node) or `onnxruntime-web` (browser) is an optional peer
dependency — install whichever you need. The file helpers additionally require
`ffmpeg` and `ffprobe` on `PATH`.

Models are not bundled. They are fetched from Adobe's host on first use and
cached when `cacheDir` is set. The two are loaded separately, because embedding
never runs the decoder: watermarking costs the 17.3MB encoder, and the 47.4MB
decoder arrives only when something extracts.

## Usage

Frames:

```ts
import { Watermarker } from '@variax-ai/video-watermark'

const wm = await Watermarker.create({ cacheDir: '.models' })

const marked = await wm.embedFrame(frame, { contentId: 481927351 })
const found = await wm.extract([marked])
// { valid: true, payload: { contentId: 481927351n }, ... }
```

Whole files, from `@variax-ai/video-watermark/node`:

```ts
import { extractFile, watermarkFile } from '@variax-ai/video-watermark/node'

await watermarkFile(wm, 'in.mp4', 'out.mp4', { contentId: 481927351 })
const found = await extractFile(wm, 'out.mp4')
```

## Browser support

The main entry runs in a browser: install `onnxruntime-web` instead of
`onnxruntime-node` and it works unchanged. `src/browser.test.ts` bundles the
entry for a browser target on every test run, so this stays true rather than
being a claim in a README.

If you already have an ort instance — a shared WASM build, WebGPU, one in a
worker — adapt it rather than letting the package import its own:

```ts
import * as ort from 'onnxruntime-web'
import { Watermarker, createRuntime } from '@variax-ai/video-watermark'

ort.env.wasm.numThreads = 1
const wm = await Watermarker.create({ runtime: createRuntime(ort) })
```

Measured in Chrome on the WASM backend, 1280x720, single-threaded:

| | |
|---|---|
| Model load, both | ~2.5s from a local host |
| — the encoder, which is all embedding needs | 17.3MB from Adobe's |
| — the decoder, on first extract | 47.4MB from Adobe's |
| First frame (includes one inference) | ~0.8–1.3s |
| Subsequent frames in a shot | **~74ms/frame** |
| Extract from one frame | ~0.3s |

The per-frame figure is low for the same reason it is in Node: `sharedResidual`
runs the encoder once per shot, and the rest is plain arithmetic. A 30s 30fps
clip is roughly a minute of embedding.

Three things to know:

- **There is no video-in, video-out path in the browser.** This package
  watermarks *frames*. Under Node, `watermarkFile` wires ffmpeg up for you; in a
  browser you supply decode and encode yourself — `<video>`+canvas or
  `WebCodecs.VideoDecoder` in, `VideoEncoder` plus a muxer (or `MediaRecorder`)
  out — and put `embedFrames` in the middle. It accepts any `ImageData`.
- **`cacheDir` is Node-only.** In a browser the models are refetched unless you
  pass `models` yourself or supply your own `runtime`. Adobe's host sends
  `access-control-allow-origin: *`, so fetching from a page works.
- **Re-encoding is where the mark is at risk**, not the browser. Whatever
  encoder you pick has to preserve the residual; the measured robustness table
  below assumes something in the quality range of x264 at CRF 23 or better.

## The payload is an identifier, not metadata

The watermark carries 100 bits: payload, error correction, and a 4-bit schema
tag. Usable payload depends on the schema:

| Schema | Payload bits | Correctable flips |
|---|---|---|
| `BCH_SUPER` | 40 | 8 |
| `BCH_5` (default) | 61 | 5 |
| `BCH_4` | 68 | 4 |
| `BCH_3` | 75 | 3 |

The payload is one field, `contentId`, spanning all of it: an opaque, stable id
for the piece of content. Under 10 bytes total — resolve real metadata from
`contentId` against your own catalogue rather than trying to embed it. Because
the id is just a big-endian integer filling the payload, it reads back the same
whichever schema carried it; a roomier schema only adds leading zeros.

`contentId` identifies *content*, not how the content was made. Which template,
experiment or variation produced a render belongs in your catalogue, where those
associations can change — or be added years later — without re-marking a frame.
It is also not the distribution platform's id: a YouTube video id describes one
platform's copy, while `contentId` stays the same across every copy of the same
content.

Ids are `bigint`. The default schema carries 61 bits, past the 53 a `number`
holds exactly, so extraction always returns a `bigint`; `embedFrame` also takes
a plain `number` and rejects one too large to be exact rather than silently
rounding it. A `BCH_5` mark holds any id up to 2^61 - 1, so a full UUID does not
fit — allocate compact ids rather than widening the packet.

## Embedding strategies

`embedFrames` defaults to `sharedResidual`: one residual is computed and reused
until the picture changes materially. Beyond being much cheaper, it keeps the
residual temporally stable, which both looks better and compresses better — a
residual that flickers frame to frame is noise the video encoder has to spend
bits on. Use `strategy: 'perFrame'` when frames within a shot differ enough that
a shared residual stops matching.

## Measured robustness

From `npm run bench`, on a real 1920x1080 Variax render — flat brand background,
large type, hard-edged shapes, no photographic texture, which is the hard case
for this style of watermark:

| Condition | Raw bit accuracy | Payload recovered |
|---|---|---|
| H.264 CRF 18, native | 100% | yes |
| H.264 CRF 23, native | 100% | yes |
| H.264 CRF 28, native | 100% | yes |
| Downscaled to 720p | 100% | yes |
| Downscaled to 640px | 100% | yes |
| 10% centre crop | 100% | yes |
| Re-encoded twice | 100% | yes |
| *Control: unwatermarked* | *58%* | *no* |

Mean PSNR 48.1 dB, at 31.5ms per 1080p frame with the default strategy.

The control row is the important one — it lands near the 50% chance level, which
is what shows the table above is measuring a real signal.

## Verification

`npm test` runs offline in milliseconds. It includes cross-implementation
vectors generated by Adobe's own Python `datalayer.py`, asserting our packets are
bit-identical to theirs, and PIL-generated vectors pinning the resampler — the
resize matters because TrustMark's reference downscales with PIL, which
area-averages, and a naive bilinear sampler silently destroys the mark.

End-to-end tests against the real models are gated behind an env var, since they
download ~64MB:

```sh
VARIAX_WATERMARK_E2E=1 npm test
```

Browser support is covered at three levels, because each catches something the
others cannot:

| Check | Catches | Automated |
|---|---|---|
| `browser.test.ts` | Node builtins reaching the browser entry | yes |
| `runtime-web.test.ts` | the ort adapter diverging from `onnxruntime-web` | yes (gated) |
| `npm run check:browser` | anything only a real browser engine shows | no — reports PASS/FAIL for a human |

`check:browser` serves a page that embeds and extracts through the real
`createRuntime` path. It reuses the cached models, so run the gated tests once
first to populate them.

## Licence

MIT. The BCH implementation and watermarking pipeline are ported from
[adobe/trustmark](https://github.com/adobe/trustmark), also MIT.
