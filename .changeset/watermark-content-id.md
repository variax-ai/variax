---
'@variax-ai/video-watermark': minor
---

Carry one `contentId` instead of `templateId` + `renderId`

The payload described how a frame was produced — which template, which render of
it. That is the wrong identity for a forensic mark: the interesting question
about a recovered frame is *what content is this*, and the associations around
it (which experiment used it, which variation produced it, where it was
published) belong in a catalogue where they can change, or be added later,
without re-marking a single frame.

So the payload is now one opaque identifier spanning the whole capacity:

```ts
await wm.embedFrame(frame, { contentId: 481927351 })
// extract → { valid: true, payload: { contentId: 481927351n }, … }
```

Breaking for every caller: `{ templateId, renderId }` becomes `{ contentId }`,
and `extract` returns `contentId` as a **`bigint`**. It has to — `BCH_5` carries
61 bits and a `number` only holds 53 exactly, so the old pinned-32-bit split was
the only reason the fields fit in doubles at all. `embedFrame` still accepts a
plain `number` for small ids, and rejects one too large to be exact rather than
silently rounding it.

`TEMPLATE_ID_BITS`, `layoutFor`, `PayloadLayout` and `maxValue` are gone from the
public API; `maxContentId(schema)` replaces them, and `PayloadInput` is the new
input type (also re-exported from `/node`).

Nothing about the encoding, the models or the robustness changes, so marks made
by 0.1.x still decode — the same bits, now read as a single integer. To recover
the old pair from a `BCH_5` mark: `templateId = contentId >> 29n`, and
`renderId = contentId & ((1n << 29n) - 1n)`.
