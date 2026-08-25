---
'@variax-ai/video-watermark': minor
---

Load the decoder only when something extracts

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
