# Variax

A monorepo for the Variax platform — tools for declarative motion-graphics content.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| [`@variax-ai/video-schema`](video/schema/) | `video/schema/` | Canonical JSON Schema + generated TypeScript and Go types |
| [`@variax-ai/video-renderer`](video/renderer/) | `video/renderer/` | Canvas2D renderer for VideoDocument (browser + Node.js) |
| [`@variax-ai/video-extractor`](video/extractor/) | `video/extractor/` | Video → schema inference (scaffold) |
| `@variax-ai/demo` | `demo/` | [Demo site](https://variax-ai.github.io/variax/) (GitHub Pages) |

## Quick start

```sh
npm install
npm run build
npm test
```

## Video schema

A declarative JSON format for motion-graphics videos, inspired by [Lottie](https://airbnb.io/lottie/). Keeps Lottie's keyframe model, drops the After Effects baggage, adds data bindings, scenes, tokens, and procedural generators.

```json
{
  "$schema": "https://variax.dev/schemas/video/v1.json",
  "version": 1,
  "width": 1080, "height": 1920,
  "fps": 30, "durationMs": 10000,
  "tokens": { "brand": "#6c4df6" },
  "scenes": [{
    "id": "intro", "startMs": 0, "endMs": 5000,
    "layers": [{
      "type": "text",
      "content": "Hello Variax",
      "font": { "size": 64 },
      "color": "$token:brand",
      "position": [540, 960]
    }]
  }]
}
```

### Conditional layers

`vars` parameterise values; `visibleIf` parameterises which layers exist. A
layer whose condition does not hold is skipped entirely — the case that
otherwise forces the host to build the document at render time:

```json
{ "type": "image", "asset": "thumbnail", "visibleIf": "$var:hasImage" }
{ "type": "text",  "content": "No photo", "visibleIf": { "var": "hasImage", "not": true } }
{ "type": "shape", "shape": "rect", "visibleIf": { "var": "tier", "in": ["gold", "platinum"] } }
```

The string form is truthiness — `false`, `0`, `NaN`, `""`, the strings
`"false"` and `"0"`, and an unset var are all false. The object form compares
instead, as strings, so a var that arrives as `"3"` still matches `3`.

Nothing moves to fill the gap: a hidden layer leaves a hole, and layout stays
the author's job. A document with an optional layer positions the layers around
it for both cases, usually by giving each variant its own `visibleIf`.

### Reusing a value

JSON has no references, so anything a document reuses is written out verbatim —
and some values must be reused rather than repeated: three trails sampling a
path and the hand casting it have to be the *same* expression, or they drift
apart. `defs` names a value once; `$def:name` refers to it:

```json
{
  "defs": {
    "fingertip": { "keyframes": [{ "t": 0, "value": [130, 450] }, "…"] }
  },
  "scenes": [{
    "id": "smudge", "startMs": 0, "endMs": 6200,
    "layers": [
      { "type": "trail", "source": "$def:fingertip", "windowMs": 500, "samples": 10, "radius": 78 },
      { "type": "group", "transform": { "position": "$def:fingertip" }, "children": ["…"] }
    ]
  }]
}
```

A def can hold an animated value, a layer, or an array of layers. A layer def is
drawn with a `use` layer, which is pure substitution — anywhere a layer is
accepted, including a `compositeMask`'s source and a `repeater`'s child. In a
layer list, a def holding several layers splices in, keeping the order of the
layers around it; in a single-layer slot, which has nothing to splice into, it
draws nothing:

```json
{ "type": "use", "def": "$def:cardChrome" }
```

A `use` carries nothing of its own — no transform, no time window, no
`visibleIf` — because it is replaced by what it names. Put a `group` around it
when the copy needs any of those:

```json
{ "type": "group", "visibleIf": "$var:showCard", "children": [{ "type": "use", "def": "$def:card" }] }
```

References resolve once, when the document is loaded, so every reference to one
def ends up pointing at one value rather than at a copy of it. A def may
reference another; a cycle throws. A reference to a name that does not exist is
left alone — an unresolvable animated value evaluates to zero, and an
unresolvable `use` draws nothing.

Baked keyframes are the usual reason a document is large, and precision is wire
cost: `{"t":3427.6785714285716,"value":461.9458212263177}` is 49 bytes, and
rounding to whole milliseconds and one decimal place costs nothing visible.

### Sizing a shape to its text

A card whose height comes from user-supplied text used to be unbuildable ahead
of time: only the renderer knows how the text wraps, so the host had to measure
it and pass the number in — duplicating the renderer's own wrapping, with its
own copy of the font string, to size a rectangle. `sizeTo` moves that back into
the document:

```json
{
  "type": "shape", "shape": "roundedRect", "radius": 40, "fill": "$token:card",
  "position": [540, 900],
  "sizeTo": { "layer": "message", "padding": [130, 80], "minHeight": 260 }
},
{
  "type": "text", "id": "message", "content": "$var:message",
  "font": { "asset": "body", "size": 108 },
  "wrap": true, "maxWidth": 820, "lineHeight": 128,
  "position": [540, 900]
}
```

The shape's box becomes the text's laid-out extent plus `padding` on each side,
centred on the shape's own origin — give the text the same `position` and they
line up. `minWidth` and `minHeight` keep a card from collapsing around a short
message. The target is named by `id`, which any layer may now declare, and it
need not be a sibling.

A shape whose `sizeTo` cannot be measured — no such id, not a text layer, or
text that resolves to nothing — falls back to its own `size`.

### Using the types

**TypeScript:**
```sh
npm install @variax-ai/video-schema
```
```typescript
import type { VideoDocument } from "@variax-ai/video-schema";
```

**Go:**
```sh
go get github.com/variax-ai/variax/video/schema/go
```
```go
import schema "github.com/variax-ai/variax/video/schema/go"
```

### Validating a document

The types are the check only while documents are built by the same codebase that
renders them. A document that arrives as JSON — from a server, a database, a
file — is untrusted, and the renderer has no document-level answer for a
malformed one: it is defensive per layer, which is damage control, not
rejection.

The canonical schema ships with the package, so validate against the same file
the types were generated from rather than a vendored copy that will drift:

```sh
npm install @variax-ai/video-schema ajv
```
```typescript
import Ajv from "ajv";
import schema from "@variax-ai/video-schema/json/v1.json" with { type: "json" };
import type { VideoDocument } from "@variax-ai/video-schema";

const ajv = new Ajv();
const validate = ajv.compile<VideoDocument>(schema);

if (!validate(untrusted)) throw new Error(ajv.errorsText(validate.errors));
// `untrusted` is a VideoDocument from here on.
```

Ajv is the consumer's choice, not a dependency of this package — the schema is
plain draft-07 and any validator will do.

### Rendering

```sh
npm install @variax-ai/video-renderer
```
```typescript
import { createDocumentDrawer } from "@variax-ai/video-renderer";

const drawer = createDocumentDrawer(doc, { vars: {}, images: {} });
drawer(canvasCtx, timeMs);
```

#### Fonts

The renderer never loads a typeface. A font asset's `src` is **advisory** — it
records where the face can be obtained, and nothing fetches it. The host must
have every declared family loaded before it draws the first frame.

This failure is silent: an unloaded family falls through the asset's `fallback`
to a generic, and the text renders in the wrong face at the wrong metrics with
no error. Preload from `requiredFonts(doc)`, which lists what a document
declares along with the weight and CSS stack the renderer will ask for:

```typescript
import { requiredFonts } from "@variax-ai/video-renderer";

await Promise.all(
  requiredFonts(doc).map(async (font) => {
    const face = new FontFace(font.family, `url(${font.src})`, { weight: String(font.weight) });
    document.fonts.add(await face.load());
  }),
);
```

Give each font asset a `fallback` naming a face you know is present, so a miss
degrades to something chosen rather than to bare `sans-serif`.

## Development

```sh
npm run build            # build all packages
npm test                 # test all packages
npm run typecheck        # type-check all packages
make generate            # regenerate TS + Go types from JSON Schema
npm run dev -w @variax-ai/demo   # start demo dev server
```

## License

[MIT](LICENSE)
