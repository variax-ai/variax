# @variax-ai/video-watermark

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
