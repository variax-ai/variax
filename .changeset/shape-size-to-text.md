---
"@variax-ai/video-schema": minor
"@variax-ai/video-renderer": minor
---

Add `sizeTo`, so a shape can size itself to the text it backs

A shape's `size` was a fixed `[w, h]`, so a card backing user-supplied text had
to be built by the host at render time: only the renderer knows how the text
wraps, and the host was duplicating that measurement to size a rectangle.
`sizeTo` names a text layer by `id` and takes its laid-out extent plus padding,
with optional minimums. Layers may now declare an `id`, and the renderer lays
text out through one shared path used by both drawing and measuring, so a card
and its message cannot disagree about how many lines there are.
