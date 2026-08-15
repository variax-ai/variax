# Variax Video Schema

A declarative JSON format for motion-graphics videos, inspired by the [Lottie](https://airbnb.io/lottie/) schema. Keeps Lottie's keyframe model, drops the After Effects baggage, adds data bindings, scenes, tokens, and procedural generators.

## Overview

A video document defines a canvas, runtime variables, shared assets, design tokens, and an ordered list of scenes — each containing a stack of typed layers composited bottom-to-top.

```json
{
  "$schema": "https://variax.dev/schemas/video/v1.json",
  "version": 1,
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationMs": 10000,
  "vars": {
    "message": { "type": "string", "required": true }
  },
  "tokens": {
    "brand": "#6c4df6"
  },
  "scenes": [
    {
      "id": "intro",
      "startMs": 0,
      "endMs": 5000,
      "layers": [
        {
          "type": "shape",
          "shape": "roundedRect",
          "size": [800, 200],
          "radius": 32,
          "fill": "$token:brand"
        },
        {
          "type": "text",
          "content": "$var:message",
          "font": { "size": 64 },
          "color": "#ffffff",
          "align": "center",
          "position": [540, 960]
        }
      ]
    }
  ]
}
```

## Schema hierarchy

```
VideoDocument
├── version, width, height, fps, durationMs
├── vars        — runtime data bindings ($var:name)
├── assets      — images, fonts (keyed by id)
├── tokens      — named color/style constants ($token:name)
└── scenes[]    — ordered timeline segments
    ├── id, startMs, endMs, background?
    └── layers[]  — composited bottom-to-top
```

## Layer types

| Type | Origin | Purpose |
|------|--------|---------|
| `shape` | Lottie | rect, ellipse, path, line with fill/stroke |
| `text` | Lottie | single/multiline, auto-shrink, wrap, data-bound content |
| `image` | Lottie | asset ref with frame rect and clip |
| `group` | Lottie | children[] with own transform |
| `ref` | New | reusable component reference (`#id`) |
| `repeater` | Lottie | N copies with phaseOffsetMs |
| `captionSequence` | New | timed text entries with entrance/exit transitions |
| `compositeMask` | New | re-draw source through different effect pipeline, clipped to mask |
| `dataViz` | New | data-driven visualization (tree, etc.) |
| `statBeat` | New | animated counter(s) with labels |

## Animation system

Every animatable property accepts one of three forms:

**Static** — a plain value:
```json
"opacity": 1
```

**Keyframes** — time-based interpolation (Lottie's model):
```json
"opacity": {
  "keyframes": [
    { "t": 0, "value": 0, "easing": "easeOutCubic" },
    { "t": 500, "value": 1 }
  ]
}
```

**Generators** — named procedural functions from a closed registry:
```json
"scale": {
  "generator": {
    "fn": "pulse",
    "params": { "from": 1.0, "to": 1.1, "periodMs": 800 }
  }
}
```

Built-in generators: `sine`, `sineStrokes`, `sineOscillation`, `pulse`, `countUp`.

## Ref strings

- `"$var:name"` — resolves against the `vars` map at bind time
- `"$token:name"` — resolves against the `tokens` map
- `"#componentId"` — reusable component reference
- `"$computed:name"` — renderer-calculated value

## Using the types

### TypeScript

```sh
npm install @variax-ai/schema
```

```typescript
import type { VideoDocument, Layer, Scene } from "@variax-ai/schema";
```

### Go

```sh
go get github.com/variax-ai/schema/go
```

```go
import schema "github.com/variax-ai/schema/go"
```

## Development

```sh
# Generate TypeScript and Go types from the JSON Schema
make generate

# Validate example documents against the schema
make validate

# Check that generated types are up to date
make check
```

## Design principles

- **DATA not CODE** — no expressions, no conditionals, no Turing-complete logic. Purely declarative.
- **Time in milliseconds** — portable across frame rates.
- **Colors as hex strings** — readable, CSS-native.
- **Full property names** — `position`, `opacity`, `blur`, not Lottie's `p`, `o`, `ty`.
- **Generators are a closed registry** — unknown names are validation errors, not runtime failures.
- **Scenes are first-class** — named segments with their own layer stacks.

## License

[MIT](LICENSE)
