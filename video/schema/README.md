# @variax-ai/video-schema

The canonical definition of the Variax video format: a declarative JSON document
describing a motion-graphics video, inspired by [Lottie](https://airbnb.io/lottie/)
but without the After Effects baggage.

**JSON Schema is the source of truth.** `json/v1.json` is draft-07, and the
TypeScript and Go types are generated from it and committed. Don't hand-edit
`src/v1.ts` or `go/v1.go` — change `json/v1.json` and run `make generate`.

## Install

```sh
npm install @variax-ai/video-schema
```

```typescript
import type { VideoDocument } from '@variax-ai/video-schema'
```

Go:

```sh
go get github.com/variax-ai/variax/video/schema/go
```

```go
import schema "github.com/variax-ai/variax/video/schema/go"
```

## The schema ships with the package

Types are a compile-time check, and they only hold while the document is built
by the same codebase that renders it. A document that arrives as JSON — from a
server, a database, a file — is untrusted, and the renderer has no
document-level answer for a malformed one: it is defensive per layer, which is
damage control, not rejection.

So validate, against the same file the types were generated from rather than a
vendored copy that will drift:

```typescript
import Ajv from 'ajv'
import schema from '@variax-ai/video-schema/json/v1.json' with { type: 'json' }
import type { VideoDocument } from '@variax-ai/video-schema'

const ajv = new Ajv()
const validate = ajv.compile<VideoDocument>(schema)
if (!validate(untrusted)) throw new Error(ajv.errorsText(validate.errors))
// `untrusted` is a VideoDocument from here on.
```

Ajv is the consumer's choice, not a dependency of this package. The schema is
plain draft-07 and any validator will do. `test/package.test.mjs` asserts the
`json/v1.json` subpath stays exported and resolvable, because a schema that
ships but cannot be reached is the failure mode that goes unnoticed.

## Document shape

```
VideoDocument
├── version, width, height, fps, durationMs
├── vars        — runtime data bindings ("$var:name" refs)
├── assets      — images, fonts (keyed by id)
├── tokens      — named colour/style constants ("$token:name" refs)
├── defs        — reusable values/layers ("$def:name" refs, resolved at load)
└── scenes[]    — ordered timeline segments
    ├── id, startMs, endMs, background?
    └── layers[]  — composited bottom-to-top
```

```json
{
  "$schema": "https://variax.dev/schemas/video/v1.json",
  "version": 1,
  "width": 1080, "height": 1920, "fps": 30, "durationMs": 10000,
  "tokens": { "brand": "#6c4df6" },
  "scenes": [{
    "id": "intro", "startMs": 0, "endMs": 5000,
    "layers": [
      { "type": "text", "content": "Hello Variax", "font": { "size": 64 },
        "color": "$token:brand", "position": [540, 960] }
    ]
  }]
}
```

## Layer types

| Type | Purpose |
|------|---------|
| `shape` | rect, roundedRect, ellipse, path, line with fill/stroke; `sizeTo` grows the box to a text layer |
| `text` | single/multiline, auto-shrink, wrap, data-bound content |
| `image` | asset ref with frame rect and clip |
| `group` | `children[]` with its own transform |
| `ref` | reusable component reference (`#id`), drawn by host code |
| `repeater` | N copies with `phaseOffsetMs` |
| `captionSequence` | timed text entries with entrance/exit transitions |
| `compositeMask` | re-draw a source through a different effect pipeline, clipped to a mask |
| `trail` | motion history: circles sampled along an animated point's own past path |
| `dataViz` | data-driven visualization, drawn by a host-registered renderer |
| `statBeat` | animated counter(s) with labels |
| `use` | substitutes a layer (or layer array) from `defs` |

Every layer accepts `transform`, `effects`, `startMs`/`endMs`, `persist`,
`visibleIf`, and `id`.

## Ref strings

| Form | Resolves against |
|---|---|
| `"$var:name"` | the `vars` supplied at render time |
| `"$token:name"` | the document's `tokens` map |
| `"$def:name"` | the document's `defs`, once, at load |
| `"#componentId"` | a host-registered component |
| `"$computed:name"` | a renderer-calculated value |

## Design principles

- **DATA not CODE** — no arbitrary expressions; everything is declarative.
- **Time in milliseconds**, never frames.
- **Colours as hex strings** (`"#6c4df6"`).
- **Full property names** (`position`, `opacity`), not Lottie's shorthand.
- **Generators are a closed registry** — an unknown name is a validation error,
  not an extension point.
- **Scenes are first-class** — named segments with their own layer stacks.
- **Version is an integer**, bumped on breaking changes.

## Development

```sh
make generate     # regenerate TS + Go types from json/v1.json
make validate     # validate tmp/examples/*.json against the schema
make check        # validate, and fail if the generated types are stale
npm test          # package-shape tests
```

`make check` runs in CI, so a schema change that skips `make generate` fails the
build rather than shipping types that disagree with the schema.

## Licence

[MIT](../../LICENSE)
