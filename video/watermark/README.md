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
`contentId` against your own catalogue rather than trying to embed it. The id is
a big-endian integer filling the payload, so a decode under the schema that
carried it returns exactly what went in, and a roomier schema only adds leading
zeros.

`contentId` identifies *content*, not how the content was made. Which template,
experiment or variation produced a render belongs in your catalogue, where those
associations can change — or be added years later — without re-marking a frame.
It is also not the distribution platform's id: a YouTube video id describes one
platform's copy, while `contentId` stays the same across every copy of the same
content.

### Sizing an id

`maxContentId(schema)` is the ceiling, and it is worth allocating against rather
than discovering: the id occupies the schema's whole payload, so how big an id
may be depends on which schema carried it. An id under `maxContentId('BCH_SUPER')`
— 2^40 - 1 — is embeddable under every schema; a 2^61 id is fine by default and
throws if a clip is later marked with `BCH_SUPER` for robustness. A full UUID
fits nothing here: allocate compact ids from a sequence or a snowflake-style
scheme rather than widening the packet.

The flip side of one field spanning the payload is that the id is right-aligned
to the schema's width, so it degrades less gracefully than a fixed-width field
would. When the schema tag itself is corrupted, `DataLayer.decode` falls back
through the other schemas and reads the data bits at a different width — and an
id read at the wrong width is a different number, not a truncated one. This is
rare (the fallback still has to satisfy BCH), but it is the one case where a
`valid: true` result can carry a wrong id.

### Ids are `bigint`

The default schema carries 61 bits, past the 53 a `number` holds exactly, so
extraction always returns a `bigint`. `embedFrame` also takes a plain `number`,
rejecting one too large to be exact rather than silently rounding it, and
rejecting anything that is neither — `BigInt('')` is `0n`, and a mark is the
wrong place to discover that.

Two consequences worth knowing before you build on it:

```ts
found.payload.contentId === 481927351   // false — bigint vs number
JSON.stringify(found.payload)           // throws: cannot serialize a BigInt
```

Compare against a `bigint` (`481927351n`, or `BigInt(id)`), and render the id
with `String(contentId)` before it reaches JSON, a log line, or a database
driver.

### Marks made before 1.0

Nothing about the encoding changed when `templateId` + `renderId` became
`contentId`, so marks made by 0.1.x still decode — the same bits are now read as
one integer. To recover the old pair from a `BCH_5` mark:

```ts
const templateId = contentId >> 29n              // 61 - 32 payload bits
const renderId = contentId & ((1n << 29n) - 1n)
```

## Embedding strategies

`embedFrames` defaults to `sharedResidual`: one residual is computed and reused
until the picture changes materially. Beyond being much cheaper, it keeps the
residual temporally stable, which both looks better and compresses better — a
residual that flickers frame to frame is noise the video encoder has to spend
bits on. Use `strategy: 'perFrame'` when frames within a shot differ enough that
a shared residual stops matching.

### Making it cheaper

Marking is a full-resolution pass per frame, and on a phone that is most of what
an export costs. Three levers, in the order they are worth reaching for:

- **`inPlace: true`** marks the frames it is given instead of copying each one
  first — 8MB of garbage per 1080p frame, which costs more in collection than in
  memcpy. For callers that own their frames and have no use for the unmarked
  originals. `watermarkFile` already does this.
- **`sceneChangeThreshold: Infinity`** pins one residual to the whole sequence,
  so the encoder runs exactly once. Worth it when recomputes are what cost;
  the residual then comes from the first frame whatever follows it.
- **Marking a fraction of the frames.** Every frame carries the same id, so the
  frames in between can be left alone and a decoder can scan until it finds one.

`npm run bench:sparse` measures the last one, because the intuition cuts both
ways: a residual that appears for a single frame and vanishes is the kind of
faint, isolated difference an encoder drops in favour of a skip block. Measured
against the bench document at 30fps, through CRF 23 and a 10% centre crop, it
does not:

| Layout | Frames marked | Embedding | Every marked frame gives up the id |
|---|---|---|---|
| every frame | 120/120 | 18.2ms per delivered frame | yes |
| 10 consecutive per second | 40/120 | 6.3ms | yes |
| 3 consecutive per second | 12/120 | 3.5ms | yes |
| 1 isolated per second | 4/120 | 3.1ms | yes |

Forcing a keyframe where each run begins made no difference to recovery at these
qualities. Two things the same run shows, which matter more than the timings:

- **Unmarked frames do not stay at chance.** They read around 60% raw bit
  accuracy next to a marked run, against the control row's ~53% for footage that
  was never marked at all, so a shared residual bleeds through the codec's
  prediction.
- **Some of them decode a valid packet carrying the wrong id.** The data layer
  falls back through the other schemas when the tag is damaged, and a partial
  mark gives it enough to satisfy BCH. A scanner that stops at the first frame
  that decodes will eventually report an id that was never embedded — require
  the same id from more than one frame before believing it.

And do not hand a sparsely marked clip to `extract`: it sums logits across every
frame it is given, so a handful of marked frames end up buried under the noise
of the rest. Scan with `decodeFrame` instead, and aggregate only across frames
that agree.

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
| *Control: unwatermarked* | *53%* | *no* |

Mean PSNR 48.4 dB, at 17.4ms per 1080p frame with the default strategy.

The control row is the important one — it lands near the 50% chance level, which
is what shows the table above is measuring a real signal.

### Platform conditions

Those are transforms at a constant quality, where the encoder spends whatever
bits the picture needs. A platform does not: it transcodes to a bitrate ladder
with a hard cap, in a codec nobody here chose, sometimes at a frame rate or an
aspect ratio nobody here chose either. The second table in `npm run bench`
approximates that — from published ladder bitrates rather than from a capture of
any real pipeline, and deliberately on the harsh side:

| Condition | Raw bit accuracy | Payload recovered |
|---|---|---|
| VP9 at 720p, 1.5Mbps | 100% | yes |
| AV1 at 720p, CRF 35 | 100% | yes |
| H.264 720p capped at 2Mbps | 100% | yes |
| H.264 480p capped at 800kbps | 100% | yes |
| 30fps conformed to 25fps | 100% | yes |
| **Reframed 16:9 to 9:16** | **56%** | **no** |
| Trimmed to two seconds | 100% | yes |

Codecs and bitrate caps turn out not to be the threat. **Reframing is.** A 10%
centre crop is survivable and a vertical reframe is not: it throws away two
thirds of the width, and the decoder resamples whatever it is handed into
256x256, so what reaches the model is a different picture at a different scale
from the one the mark was embedded into. 56% is the chance level — the mark is
gone, not merely weakened.

What follows from that is a delivery rule, not a decoding trick: **mark each
aspect ratio you ship**. Render the vertical cut, then watermark it, rather than
watermarking a 16:9 master and letting something downstream crop it. Recovering
a mark from a reframed clip would mean the decoder searching candidate windows,
which this package does not do.

These rows do not gate the bench's exit code, since a limit that is measured and
written down is not a regression. The summary line names any that failed.

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

`npm run bench:sparse` is a second harness on the same models, covering how
little of a clip can carry the mark; see [Making it cheaper](#making-it-cheaper).

`check:browser` serves a page that embeds and extracts through the real
`createRuntime` path. It reuses the cached models, so run the gated tests once
first to populate them.

## Licence

MIT. The BCH implementation and watermarking pipeline are ported from
[adobe/trustmark](https://github.com/adobe/trustmark), also MIT.
