---
"@variax-ai/video-watermark": patch
---

Fuse RGBA→model-tensor resize to skip the full-frame planar copy (~24 MB saved
at 1080p). Reuse encode/decode tensor, residual, and signature buffers inside
`Watermarker` to cut per-scene-change allocations by ~5 MB.

Add a "Phone performance" section to the README covering WebGPU, sparse
marking, in-place marking, and scanning-decoder guidance.

Add a VP9 720p @ 1.5 Mbps condition to `bench:sparse` (matching the
robustness harness's YouTube-like ladder) and skip conditions when ffmpeg
lacks the required encoder. Sparse marking survives the bitrate cap in every
tested layout, but unmarked frames decode more wrong-id packets as density
drops — a scanning decoder must require 2+ agreeing frames before trusting an
id.
