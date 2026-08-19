---
'@variax-ai/video-schema': minor
'@variax-ai/video-renderer': minor
---

Add the primitives needed to describe scratch-reveal and path-following motion declaratively, plus a host-enforced floor on image sharpness.

**Per-axis animated points.** `AnimatedPoint` accepts `{ x, y }`, where each axis carries its own keyframes or generator. Previously a generator on a point broadcast one scalar to both axes, so x and y could not move independently.

**Generator time origin.** Every generator now accepts a `startMs` param, evaluating at `tMs - startMs`. This lets a document phase a curve to a scene or layer without the renderer growing per-generator time-base rules, and makes a cosine expressible as a quarter-period shift.

**New `trail` layer.** Samples an `AnimatedPoint` at past times and unions a circle per sample, radius shrinking with age (`windowMs`, `samples`, `take`, `radius`, `falloff`, `fill`, `stroke`). It emits vector geometry only, which is what makes it usable as a `compositeMask` mask. Samples older than the layer's `startMs` are dropped rather than clamped.

**`compositeMask.source` accepts a `Layer`.** The masked re-draw then goes through the normal layer pipeline and picks up `frame` and `downscaleBlur`, so a mask can reveal an image at a different blur tier. The existing images-key string form is unchanged. `maskEffect` applies to the string form only; a `Layer` source carries its own `effects`.

**Font fallback stacks.** `FontAsset` accepts `fallback: string[]`, and the renderer emits the full CSS stack instead of the hardcoded `'<family>', sans-serif`. Named families are quoted, CSS generics are not, and a generic always terminates the stack. Assets without `fallback` produce a byte-identical font string to before.

**Renderer-enforced blur constraints.** `RendererOptions.constraints` takes `minDownscaleBlurPx` and `minDownscaleShrink`. These are a safety boundary, not a hint: they clamp rather than warn, and a document cannot opt out. Setting `minDownscaleBlurPx` forces *every* image draw through the downscale path — including layers that declare no blur, declare `radius: 0`, or omit `frame` — because omission was otherwise the easy way around a floor. An unframed image whose intrinsic size cannot be determined is not drawn at all rather than drawn sharp.

Two consequences worth noting. A `downscaleBlur` used as `compositeMask.maskEffect` was previously dropped silently and now takes effect. And constraints apply to every image layer, so a document mixing a protected image with an unprotected one is not yet expressible — a host-supplied `constraints.exemptAssets` is the natural follow-up. `options.components` and `options.dataVizRenderers` are host code and draw outside this guarantee.
