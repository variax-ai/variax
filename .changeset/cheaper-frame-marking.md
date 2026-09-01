---
'@variax-ai/video-watermark': minor
---

Mark a frame with one add per channel, and let the caller skip the copy

Applying the residual was the per-frame cost of embedding, and most of what it
did per pixel was travel between byte space and the reference's [-1, 1] space:
a divide, a multiply, a clip and a scale, three times over. The conversion is
linear, so it can happen once per residual instead — `upscaleResidual` now folds
`strength` and the 127.5 in while it resamples, and the per-frame loop is an add
whose clamping and rounding `Uint8ClampedArray` was already doing. Whole-frame
regions, which is everything under 2:1, walk both arrays contiguously.

Same bytes out, measured against the reference formula in `pixels.test.ts`, at
6.6ms per 1080p frame rather than 22.2ms on the machine this was written on.

`EmbedOptions.inPlace` marks the frames it is given instead of copying each one
first, for callers that own their frames and have no use for the unmarked
originals — 8MB of garbage per 1080p frame, which on a phone costs more in
collection than in memcpy. `watermarkFile` now takes it, since the frames it
marks come from its own ffmpeg reader and nothing else can see them.

`npm run bench:sparse` answers the question this came out of: whether a clip can
be marked on a fraction of its frames, given that every frame carries the same
id and a decoder can scan until it finds one. It compares marking every frame
against runs and isolated frames, with and without forcing a keyframe where each
run begins, and reports which frames a scanning decoder actually recovers the id
from after re-encoding and cropping.
