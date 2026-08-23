# @variax-ai/demo

The demo site behind [variax-ai.github.io/variax](https://variax-ai.github.io/variax/).
Private, not published to npm — it exists to show the packages working in a real
browser, and to be the first thing that breaks when one of them regresses.

Three tabs, one per package:

- **Renderer** — a `VideoDocument` in an editable textarea, drawn live by
  `@variax-ai/video-renderer`. Edit the JSON and the preview rebuilds; the vars
  panel is generated from the document's own `vars` block, so `visibleIf` and
  `$var:` bindings can be exercised without touching the JSON.
- **Extractor** — the real `@variax-ai/video-extractor` pipeline over a video you
  pick, minus the model call. It samples frames in the browser and shows the
  prompt it would send; paste a model's reply back and it parses, validates and
  loads the result into the renderer tab.
- **Watermark** — `@variax-ai/video-watermark` running in the browser on
  `onnxruntime-web`: embeds a payload into the current rendered frame and
  recovers it, reporting PSNR and timings, then decodes the *unmarked* frame as a
  control. The ~64MB of ONNX models are fetched from Adobe's host on demand, so
  this tab costs nothing until you press the button.

  ort loads its WASM at runtime rather than through the import graph, so the
  binary is imported as a URL (`?url`) and handed to `env.wasm.wasmPaths`. That
  keeps it versioned with the package and rewritten for the `/variax/` base,
  rather than pinned to a CDN URL someone has to remember to bump — at the cost
  of a ~13MB asset in `dist/`, which is only fetched when the tab is used.

## Running it

```sh
npm install
npm run build                    # the workspace packages the demo imports
npm run dev -w @variax-ai/demo
```

`npm run build -w @variax-ai/demo` produces `demo/dist/`. Any truthy `CI` in the
environment — which GitHub Actions always sets — switches Vite's `base` to
`/variax/` for Pages; locally it stays `/`.

Deployment is `.github/workflows/deploy-demo.yml`, on every push to `main`.
