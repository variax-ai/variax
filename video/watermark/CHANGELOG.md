# @variax-ai/video-watermark

## 0.2.0

### Minor Changes

- dfee226: Load the decoder only when something extracts

  `Watermarker.create` downloaded both ONNX models before it would embed a single
  frame, but embedding never runs the decoder — 47.4MB of a 64.7MB download for a
  model that was never executed. The decoder now loads on first extract, memoised
  so concurrent extractions share one download and a failed load stays retryable.

  Embedding costs 17.3MB. This matters most in the browser, where there is no
  `cacheDir` and the download sits on a user-facing path: a share or export flow no
  longer waits on the decoder to watermark a frame.

  `LoadedModels.decoder` is now `() => Promise<Session>` rather than a `Session`,
  which is breaking for anyone hand-building the object and passing it to
  `new Watermarker(...)`. Callers going through `Watermarker.create` are unaffected.

- a1e5dfc: Carry one `contentId` instead of `templateId` + `renderId`

  The payload described how a frame was produced — which template, which render of
  it. That is the wrong identity for a forensic mark: the interesting question
  about a recovered frame is _what content is this_, and the associations around
  it (which experiment used it, which variation produced it, where it was
  published) belong in a catalogue where they can change, or be added later,
  without re-marking a single frame.

  So the payload is now one opaque identifier spanning the whole capacity:

  ```ts
  await wm.embedFrame(frame, { contentId: 481927351 });
  // extract → { valid: true, payload: { contentId: 481927351n }, … }
  ```

  Breaking for every caller: `{ templateId, renderId }` becomes `{ contentId }`,
  and `extract` returns `contentId` as a **`bigint`**. It has to — `BCH_5` carries
  61 bits and a `number` only holds 53 exactly, so the old pinned-32-bit split was
  the only reason the fields fit in doubles at all. `embedFrame` still accepts a
  plain `number` for small ids, and rejects one too large to be exact rather than
  silently rounding it.

  `TEMPLATE_ID_BITS`, `layoutFor`, `PayloadLayout` and `maxValue` are gone from the
  public API; `maxContentId(schema)` replaces them, and `PayloadInput` is the new
  input type (also re-exported from `/node`).

  Nothing about the encoding, the models or the robustness changes, so marks made
  by 0.1.x still decode — the same bits, now read as a single integer. To recover
  the old pair from a `BCH_5` mark: `templateId = contentId >> 29n`, and
  `renderId = contentId & ((1n << 29n) - 1n)`.

## 0.1.2

## 0.1.1

### Patch Changes

- f619d84: Add `@variax-ai/video-watermark`: a hidden mark carrying the template id

  An exported video carried nothing identifying the template it came from, and a
  visible mark is both removable and unwanted on finished work. This package
  embeds an identifier in the pixels instead, recoverable after the video has been
  encoded, rescaled and re-encoded on its way through a platform.

  It works on frames rather than documents, and depends on neither the schema nor
  the renderer, so it applies equally to video that never came from a
  `VideoDocument` — `watermarkFile` takes any MP4 and returns a marked one.

  Built on adobe/trustmark's ONNX models. Their published JavaScript decodes only,
  so the encoder is implemented here: the BCH data layer is ported from their
  Python and checked against vectors it generated, and the resampler is pinned to
  PIL's bilinear, which area-averages on downscale — a plain bilinear sampler
  feeds the model something it was not trained on and the mark is lost without any
  visible failure.

  The payload is an identifier, not a metadata container: 100 bits total, 61 of
  them payload under the default schema. Resolve metadata from the template id.

  Measured on a real 1080p render — flat brand background, large type, the hard
  case for this style of watermark — the payload survives CRF 18/23/28, downscales
  to 720p and 640px, a 10% centre crop, and a double re-encode, at 100% raw bit
  accuracy and 48.1 dB PSNR, while unwatermarked footage reads at chance.
