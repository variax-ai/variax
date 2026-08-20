---
"@variax-ai/video-schema": minor
"@variax-ai/video-renderer": minor
---

Add `visibleIf`, a predicate on `vars` deciding whether a layer is drawn

Every layer was unconditionally present, so a document whose shape depended on a
runtime fact had to be rebuilt by the host — `vars` parameterised values but not
the layer tree. `visibleIf` takes either a var reference, held when the value is
truthy, or `{ var, equals | in, not }` for a comparison, and a layer that fails
its condition is skipped entirely. Layout is unchanged: nothing moves to fill
the gap, so an author supplies both variants and conditions each.
