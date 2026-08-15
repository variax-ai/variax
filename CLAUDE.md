# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A declarative JSON format for motion-graphics videos, inspired by the Lottie schema. It keeps Lottie's keyframe model (time + value + easing) but drops the After Effects baggage (shorthand property names, frame-based time, float color arrays, 3D, cameras, expressions), and adds data bindings, scenes, tokens, and procedural generators.

This repo is the **single source of truth** for the schema. It is language-agnostic (the canonical format is JSON), with generated type definitions for TypeScript and Go that downstream renderers and services consume.

Organization: **Variax** on GitHub. Repo: `schema`.

## Architecture

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

### Animation system (three tiers)

1. **Static** — plain value (`"opacity": 1`)
2. **Keyframes** — `{ "keyframes": [{ "t": ms, "value": T, "easing"?: EasingName }] }`
3. **Generators** — `{ "generator": { "fn": "sine", "params": {...}, "id"?: "handPath" } }` — named procedural functions, closed registry, never eval

### Ref strings

- `"$var:name"` — resolves against `vars` map at bind time
- `"$token:name"` — resolves against `tokens` map
- `"#componentId"` — reusable component reference
- `"$computed:name"` — renderer-calculated value

## Key design principles

- **DATA not CODE**: no arbitrary expressions, no Turing-complete logic, no conditional layers. The format is purely declarative; renderers interpret it.
- **Time in milliseconds**, not frames — portable across frame rates.
- **Colors as hex strings** (`"#6c4df6"`), not Lottie's float arrays.
- **Full property names** (`position`, `opacity`, `blur`), not Lottie shorthand (`p`, `o`, `ty`).
- **Generators are a closed registry**: unknown generator names are validation errors, not runtime failures.
- **Scenes are first-class**: named segments with their own layer stacks, not flat in/out points.

## Repo structure (planned)

```
schema/
├── json/              # canonical JSON Schema (v1.json)
├── typescript/        # generated TypeScript types
├── go/                # generated Go types
├── examples/          # example video documents (taunt, lineage templates)
└── CLAUDE.md
```

## Conventions

- Schema version field: integer (`"version": 1`), bump on breaking changes.
- Template names in examples use kebab-case file names matching the template id (e.g., `taunt.json`, `lineage.json`).
- Type generation should be automated from the canonical JSON Schema — don't hand-maintain types in multiple languages.
