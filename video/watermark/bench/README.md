# Bench and fixtures

## Robustness harness

```sh
npm run bench -w @variax-ai/video-watermark
```

Renders a real `VideoDocument`, watermarks it, pushes it through the transforms a
video meets between export and playback, and reports how much of the mark
survives. Exits non-zero if any condition fails to recover the payload, or if the
negative control decodes something — a control that reads well above chance means
the harness is broken, not that the watermark is good.

Requires `ffmpeg` on `PATH`. Models are cached in `node_modules/.cache`, or
wherever `VARIAX_WATERMARK_MODELS` points.

## Regenerating the test fixtures

Both fixtures come from the reference implementations rather than from this
package, which is the point — they fail if our port drifts.

### `src/__fixtures__/trustmark-datalayer-vectors.json`

Packets produced by Adobe's own data layer. `datalayer.py` imports numpy but only
uses it to wrap lists, so a small shim avoids installing it:

```sh
mkdir -p tm && touch tm/__init__.py
curl -o tm/datalayer.py https://raw.githubusercontent.com/adobe/trustmark/main/python/trustmark/datalayer.py
curl -o tm/bchecc.py   https://raw.githubusercontent.com/adobe/trustmark/main/python/trustmark/bchecc.py
```

Write a `numpy.py` shim exposing `float32` and an `array()` returning a list
subclass with a `.shape` property, then for each of the four encoding modes call
`DataLayer(100, False, mode).process_encode(bitstring)` and record the mode,
schema name, data/ECC bit counts, input bitstring and resulting 100-bit packet.

### `src/__fixtures__/pil-resize-vectors.json`

PIL bilinear resize outputs. The source image is generated from a formula the
test reproduces exactly, so only the expected output needs storing — and only a
sample of it plus whole-image statistics, which keeps the fixture small while
still catching any resampler error.

```sh
python3 -m venv venv && ./venv/bin/pip install pillow numpy
```

Generate with the formula in `resize.test.ts`'s `source()`:
`(x*7 + y*13 + c*29 + ((x*y) % 17) * 15) % 256`, resize with
`Image.BILINEAR` across a spread of scale factors — including a large downscale
(1920x1080 to 256x256, the real case) and an upscale — and record the mean, min,
max, and 256 deterministically chosen sample indices with their values.
