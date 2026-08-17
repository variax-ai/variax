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

### Rendering

```sh
npm install @variax-ai/video-renderer
```
```typescript
import { createDocumentDrawer } from "@variax-ai/video-renderer";

const drawer = createDocumentDrawer(doc, { vars: {}, images: {} });
drawer(canvasCtx, timeMs);
```

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
