---
"@variax-ai/video-renderer": minor
---

Confine `compositeMask` to the mask's bounding box

`compositeMask` allocated two document-sized canvases per layer per frame and
composited across the whole document however small the mask was. It now derives
the mask's extent and crops the allocation and all three composites to it,
falling back to the full document when the extent is not derivable. On the
issue's scenario — two `trail`-masked layers on a 1080×1920 document — that is
26.5ms/frame down to 4.9ms/frame, ~4s off a 186-frame beat.

Antialiasing of the mask's own outline can shift by a fraction of a step on its
one-pixel rim, because a path's antialiasing is not invariant under a shift of
the surface it is drawn into. Geometry, coverage and interior pixels are
unchanged.
