# @variax-ai/video-schema

## 0.1.0

### Minor Changes

- bfafeac: Add `visibleIf`, a predicate on `vars` deciding whether a layer is drawn

  Every layer was unconditionally present, so a document whose shape depended on a
  runtime fact had to be rebuilt by the host — `vars` parameterised values but not
  the layer tree. `visibleIf` takes either a var reference, held when the value is
  truthy, or `{ var, equals | in, not }` for a comparison, and a layer that fails
  its condition is skipped entirely. Layout is unchanged: nothing moves to fill
  the gap, so an author supplies both variants and conditions each.

- 1da2ba3: Add `defs` and `$def:` references, so a document can name a value and reuse it

  JSON has no references, so anything a document reuses was written out verbatim —
  in the reported case a 225-keyframe path serialised four times, half the
  document's bytes, for an expression that has to stay one expression or the
  layers sampling it drift apart. `defs` names a value once and `$def:name` refers
  to it; a def may hold an animated value, a layer, or an array of layers, and a
  `use` layer substitutes a layer def in place. References resolve once when the
  document is loaded, so four references become four pointers to one value rather
  than four copies of it.

- e0076ea: Document that `FontAsset.src` is advisory and add `requiredFonts(doc)`

  The renderer never loads a typeface, and an unloaded family fails silently — the
  canvas falls through the stack and paints in the wrong face with no error. The
  schema now says so on `FontAsset`, the README documents the host's obligation,
  and `requiredFonts(doc)` lists every declared face with the family, weight and
  CSS stack the renderer will ask for, so a host can preload without duplicating
  that logic.

- 487735b: Publish `json/v1.json` so hosts can validate untrusted documents

  The canonical schema was not in the package — consumers got TypeScript types and
  nothing checkable at runtime, leaving them to vendor a copy that drifts. `json/`
  is now in `files`, with a `@variax-ai/video-schema/json/v1.json` subpath export,
  so a host can point its own validator at the same file the types were generated
  from. No runtime dependency is added; the schema is plain draft-07.

- 7d201fe: Add `sizeTo`, so a shape can size itself to the text it backs

  A shape's `size` was a fixed `[w, h]`, so a card backing user-supplied text had
  to be built by the host at render time: only the renderer knows how the text
  wraps, and the host was duplicating that measurement to size a rectangle.
  `sizeTo` names a text layer by `id` and takes its laid-out extent plus padding,
  with optional minimums. Layers may now declare an `id`, and the renderer lays
  text out through one shared path used by both drawing and measuring, so a card
  and its message cannot disagree about how many lines there are.

## 0.0.2

### Patch Changes

- 06b074b: Add the primitives needed to describe scratch-reveal and path-following motion declaratively, plus host-enforced floors on image sharpness.

  **Per-axis animated points.** `AnimatedPoint` accepts `{ x, y }`, where each axis carries its own keyframes or generator. Previously a generator on a point broadcast one scalar to both axes, so x and y could not move independently.

  **Generator time origin.** Every generator now accepts a `startMs` param, evaluating at `tMs - startMs`. This lets a document phase a curve to a scene or layer without the renderer growing per-generator time-base rules, and makes a cosine expressible as a quarter-period shift. `pulse` now uses a Euclidean modulo so it stays inside `[from, to)` for times before its origin, instead of ramping negative.

  **New `trail` layer.** Samples an `AnimatedPoint` at past times and unions a circle per sample, radius shrinking with age (`windowMs`, `samples`, `take`, `radius`, `falloff`, `fill`, `stroke`). It emits vector geometry only, which is what makes it usable as a `compositeMask` mask. Samples older than the layer's `startMs` are dropped rather than clamped, and samples a clamp-holding source repeats are skipped.

  **`compositeMask.source` accepts a `Layer`.** The masked re-draw then goes through the normal layer pipeline and picks up `frame` and `downscaleBlur`, so a mask can reveal an image at a different blur tier. The existing images-key string form is unchanged. `maskEffect` applies to the string form only; a `Layer` source carries its own `effects`.

  **Font fallback stacks.** `FontAsset` accepts `fallback: string[]`, and the renderer emits the full CSS stack instead of the hardcoded `'<family>', sans-serif`. Named families are quoted and escaped, CSS generics are not, and a generic always terminates the stack. Assets without `fallback` produce a byte-identical font string to before.

  **Renderer-enforced blur floors.** `RendererOptions.constraints` takes `minDownscaleBlurPx` and `minDownscaleShrink`. They clamp rather than warn, and clamping is applied after per-frame evaluation, so an animated radius cannot dip under the floor mid-clip. Setting `minDownscaleBlurPx` forces every `image` layer and every images-key `compositeMask` source through the downscale path — including layers that declare no blur, declare `radius: 0`, or omit `frame` — because omission was otherwise the easy way around a floor. Non-positive and non-finite declared values fall back to the floor rather than disabling it.

  Scope worth being precise about: the floors cover the layers the renderer draws itself. They do **not** cover `components` or `dataVizRenderers`, which are host code handed the raw canvas context — a host that registers a drawer is responsible for what it paints. Constraints also apply uniformly to every image layer, so a document mixing a protected image with an unprotected one is not yet expressible; a host-supplied `constraints.exemptAssets` is the natural follow-up.

  Two other consequences. A `downscaleBlur` used as `compositeMask.maskEffect` was previously dropped silently and now takes effect. And an unframed image whose intrinsic size cannot be determined is not drawn at all when a host floor is configured — failing closed rather than rendering sharp; with no floor configured it renders as it always did.
