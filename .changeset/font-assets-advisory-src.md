---
"@variax-ai/video-schema": minor
"@variax-ai/video-renderer": minor
---

Document that `FontAsset.src` is advisory and add `requiredFonts(doc)`

The renderer never loads a typeface, and an unloaded family fails silently — the
canvas falls through the stack and paints in the wrong face with no error. The
schema now says so on `FontAsset`, the README documents the host's obligation,
and `requiredFonts(doc)` lists every declared face with the family, weight and
CSS stack the renderer will ask for, so a host can preload without duplicating
that logic.
