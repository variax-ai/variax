# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A monorepo for the Variax platform — tools for declarative motion-graphics content. Currently focused on the **video** domain (a declarative JSON format for motion-graphics videos, inspired by Lottie), with future plans for text, image, and other content types.

Organization: **variax-ai** on GitHub. Repo: `variax`.

## Monorepo structure

```
variax/
├── video/
│   ├── schema/          # @variax-ai/video-schema — canonical JSON Schema + generated TS/Go types
│   ├── renderer/        # @variax-ai/video-renderer — Canvas2D renderer (browser + Node.js)
│   └── extractor/       # @variax-ai/video-extractor — video → schema inference (scaffold)
├── demo/                # @variax-ai/demo — static GitHub Pages demo site (private)
├── package.json         # npm workspaces root
├── tsconfig.base.json   # shared TypeScript config
└── Makefile             # delegates generate/validate/check to video/schema/
```

Uses **npm workspaces** (`"workspaces": ["video/*", "demo"]`).

## Packages

### `@variax-ai/video-schema` (`video/schema/`)

The **single source of truth** for the video format. The canonical format is JSON Schema (`json/v1.json`), with generated type definitions for TypeScript and Go.

- TypeScript types are generated and committed — don't hand-edit `src/v1.ts`. Modify `json/v1.json` and run `make generate`.
- Go types are generated and committed — don't hand-edit `go/v1.go`.

### `@variax-ai/video-renderer` (`video/renderer/`)

Framework-agnostic Canvas2D renderer that interprets a `VideoDocument` JSON and renders frame-by-frame. Zero runtime dependencies (only depends on `@variax-ai/video-schema`).

- Works in browser and Node.js (Node.js requires a canvas polyfill like `@napi-rs/canvas`)
- Built with tsup (ESM + CJS)
- Tests use vitest with jsdom

### `@variax-ai/video-extractor` (`video/extractor/`)

Video-to-schema inference — takes a video and extracts a `VideoDocument`. Currently a scaffold (stub only).

### `@variax-ai/demo` (`demo/`)

Static demo site (Vite), deployed to GitHub Pages. Shows the renderer in action and has a placeholder for the extractor.

## Video schema design

### Schema hierarchy

```
VideoDocument
├── version, width, height, fps, durationMs
├── vars        — runtime data bindings ("$var:name" refs)
├── assets      — images, fonts (keyed by id)
├── tokens      — named color/style constants ("$token:name" refs)
└── scenes[]    — ordered timeline segments
    ├── id, startMs, endMs, background?
    └── layers[]  — composited bottom-to-top
```

### Layer types

| Type | Purpose |
|------|---------|
| `shape` | rect, ellipse, path, line with fill/stroke |
| `text` | single/multiline, auto-shrink, wrap, data-bound content |
| `image` | asset ref with frame rect and clip |
| `group` | children[] with own transform |
| `ref` | reusable component reference (`#id`) |
| `repeater` | N copies with phaseOffsetMs |
| `captionSequence` | timed text entries with entrance/exit transitions |
| `compositeMask` | re-draw source through different effect pipeline, clipped to mask |
| `dataViz` | data-driven visualization (tree, etc.) |
| `statBeat` | animated counter(s) with labels |

### Key design principles

- **DATA not CODE**: no arbitrary expressions, purely declarative
- **Time in milliseconds**, not frames
- **Colors as hex strings** (`"#6c4df6"`)
- **Full property names** (`position`, `opacity`), not Lottie shorthand
- **Generators are a closed registry**: unknown names are validation errors
- **Scenes are first-class**: named segments with their own layer stacks

### Ref strings

- `"$var:name"` — resolves against `vars` map at bind time
- `"$token:name"` — resolves against `tokens` map
- `"#componentId"` — reusable component reference
- `"$computed:name"` — renderer-calculated value

## Build commands

```sh
# Root commands
npm install              # install all workspace dependencies
npm run build            # build all packages (schema first, then others)
npm test                 # run tests across all packages
npm run typecheck        # type-check all packages
npm run generate         # regenerate TS + Go types from json/v1.json

# Schema-specific
make generate            # regenerate TS + Go types
make validate            # validate tmp/examples/*.json against the schema
make check               # validate + verify generated types are up to date

# Demo
npm run dev -w @variax-ai/demo    # start demo dev server
npm run build -w @variax-ai/demo  # build demo for deployment
```

## Conventions

- Schema version field: integer (`"version": 1`), bump on breaking changes.
- TypeScript and Go types in `video/schema/` are generated — modify `json/v1.json` and run `make generate`.
- Example documents live in `video/schema/tmp/examples/` (gitignored).
- New domain folders (text, image, etc.) are added as siblings to `video/` and included in the root `package.json` workspaces array.
