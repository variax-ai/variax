# @variax-ai/video-extractor

Turns a video into a `VideoDocument`: samples frames, asks a vision model what
it is looking at, and returns a document the renderer can play.

The package **does not talk to any model provider**. It samples the frames,
builds the prompt, and parses and validates what comes back — you supply an
`infer` function that gets the frames to whichever model you use. That keeps API
keys, retries, cost control and provider choice on your side of the boundary,
and makes the pipeline testable without a network.

> Extraction is inference, not decoding. The result is a plausible
> reconstruction, not the original timeline — expect to review and edit it.

## Install

```sh
npm install @variax-ai/video-extractor
```

## Usage

```ts
import { extractDocument, parseResponse } from '@variax-ai/video-extractor'
import type { VideoDocument } from '@variax-ai/video-schema'

const doc = await extractDocument({
  source: videoElement,          // an HTMLVideoElement, or your own FrameSource
  infer: async ({ frames, prompt, width, height, durationMs, fps }) => {
    // frames[i].data is a PNG (Uint8Array); frames[i].timeMs is its timestamp
    const text = await callYourVisionModel(prompt, frames)
    return parseResponse(text) as VideoDocument
  },
})
```

`extractDocument` runs the whole pipeline:

1. Reads `width`, `height`, `durationMs` and `fps` from the source (your options
   override any of them).
2. Picks timestamps — one per second by default, capped at 20 — spaced evenly,
   each centred in its slice rather than sitting on the boundary.
3. Samples those frames.
4. Builds the prompt with `buildPrompt`.
5. Calls your `infer`.
6. Runs the result through `validateDocument` before returning it.

The source is disposed whether or not any of that throws.

### Options

| Option | Meaning |
|---|---|
| `source` | An `HTMLVideoElement` or a `FrameSource` |
| `infer` | Your model call. Required |
| `width`, `height` | Override the document's dimensions |
| `fps` | Override the frame rate (default: the source's, else 30) |
| `sampleCount` | How many frames to sample (default: one per second, max 20) |

## Frame sources

In a browser, pass an `HTMLVideoElement` and `createBrowserFrameSource` seeks and
grabs each frame through a canvas.

Anywhere else, implement the interface — three methods, no dependency on the DOM:

```ts
interface FrameSource {
  metadata(): Promise<VideoMetadata>            // width, height, durationMs, fps?
  sample(timestamps: number[]): Promise<Frame[]> // PNG bytes + timeMs
  dispose?(): void
}
```

An ffmpeg-backed source in Node is a handful of lines, and a source that reads
pre-extracted PNGs off disk makes the pipeline fully offline for tests.

## The pieces, separately

Each stage is exported, because the useful thing is rarely the whole pipeline:

```ts
import {
  buildPrompt,       // metadata → the prompt string
  parseResponse,     // model text → unknown (unwraps ``` fences, finds the object)
  validateDocument,  // unknown → VideoDocument, or throws
  createBrowserFrameSource,
} from '@variax-ai/video-extractor'
```

`parseResponse` exists because models wrap JSON in prose and code fences; it
takes the fenced block if there is one, otherwise the outermost `{…}`.

`validateDocument` is a **structural** check, not a schema check. It enforces
what must hold for the document to be renderable at all — positive dimensions,
at least one scene, sane times — and drops layers whose `type` it does not
recognise rather than throwing. For real validation, run the result against
`@variax-ai/video-schema`'s `json/v1.json` with a JSON Schema validator.

## Licence

[MIT](../../LICENSE)
