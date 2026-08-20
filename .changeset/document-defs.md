---
"@variax-ai/video-schema": minor
"@variax-ai/video-renderer": minor
---

Add `defs` and `$def:` references, so a document can name a value and reuse it

JSON has no references, so anything a document reuses was written out verbatim —
in the reported case a 225-keyframe path serialised four times, half the
document's bytes, for an expression that has to stay one expression or the
layers sampling it drift apart. `defs` names a value once and `$def:name` refers
to it; a def may hold an animated value, a layer, or an array of layers, and a
`use` layer substitutes a layer def in place. References resolve once when the
document is loaded, so four references become four pointers to one value rather
than four copies of it.
