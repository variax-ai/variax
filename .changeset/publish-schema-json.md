---
"@variax-ai/video-schema": minor
---

Publish `json/v1.json` so hosts can validate untrusted documents

The canonical schema was not in the package — consumers got TypeScript types and
nothing checkable at runtime, leaving them to vendor a copy that drifts. `json/`
is now in `files`, with a `@variax-ai/video-schema/json/v1.json` subpath export,
so a host can point its own validator at the same file the types were generated
from. No runtime dependency is added; the schema is plain draft-07.
