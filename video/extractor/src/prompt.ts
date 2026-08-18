import type { VideoMetadata } from './types'

export function buildPrompt(metadata: VideoMetadata): string {
  const { width, height, durationMs, fps } = metadata
  return `You are analyzing video frames to produce a VideoDocument JSON.

## Video metadata
- Dimensions: ${width}x${height} pixels
- Duration: ${durationMs}ms
- FPS: ${fps ?? 30}

## Output format

Return a single JSON object conforming to this schema:

\`\`\`
{
  "version": 1,
  "width": ${width},
  "height": ${height},
  "fps": ${fps ?? 30},
  "durationMs": ${durationMs},
  "tokens": { "<name>": "<hex color>", ... },
  "scenes": [
    {
      "id": "<unique-id>",
      "startMs": <number>,
      "endMs": <number>,
      "background": "<hex color>" | { "type": "linearGradient"|"radialGradient", "stops": ["<hex>", ...], "angle": <degrees> },
      "layers": [ <Layer>, ... ]
    }
  ]
}
\`\`\`

## Layer types

### ShapeLayer
\`\`\`
{
  "type": "shape",
  "shape": "rect" | "roundedRect" | "ellipse" | "path" | "line",
  "position": [x, y],
  "size": [width, height],
  "radius": <number>,
  "fill": "<hex color>",
  "stroke": { "color": "<hex>", "width": <number> },
  "transform": { ... },
  "startMs": <number>,
  "endMs": <number>
}
\`\`\`

### TextLayer
\`\`\`
{
  "type": "text",
  "content": "<string>" | { "template": "<string with {key} placeholders>", "bindings": { "<key>": "<value>" } },
  "position": [x, y],
  "font": { "family": "<name>", "size": <number>, "weight": <number> },
  "color": "<hex color>",
  "align": "left" | "center" | "right",
  "maxWidth": <number>,
  "shrinkToFit": <boolean>,
  "transform": { ... },
  "startMs": <number>,
  "endMs": <number>
}
\`\`\`

### ImageLayer
\`\`\`
{
  "type": "image",
  "asset": "<asset-id>",
  "frame": { "x": <number>, "y": <number>, "w": <number>, "h": <number> },
  "transform": { ... },
  "startMs": <number>,
  "endMs": <number>
}
\`\`\`
When you detect an image, add a corresponding entry to a top-level "assets" map:
\`\`\`
"assets": { "<asset-id>": { "type": "image", "src": "<describe what the image depicts>" } }
\`\`\`

### GroupLayer
\`\`\`
{
  "type": "group",
  "children": [ <Layer>, ... ],
  "position": [x, y],
  "transform": { ... },
  "startMs": <number>,
  "endMs": <number>
}
\`\`\`

## Transform (optional on any layer)
\`\`\`
{
  "position": [x, y] | { "keyframes": [{ "t": <ms>, "value": [x, y], "easing": "<name>" }, ...] },
  "scale": <number> | [sx, sy] | { "keyframes": [...] },
  "rotation": <degrees> | { "keyframes": [{ "t": <ms>, "value": <degrees>, "easing": "<name>" }, ...] },
  "opacity": <0-1> | { "keyframes": [{ "t": <ms>, "value": <0-1>, "easing": "<name>" }, ...] }
}
\`\`\`

Easing names: "linear", "easeOutCubic", "easeInCubic", "easeInOut", "easeOutBack"

## Conventions
- All times are in milliseconds
- Colors are hex strings (e.g. "#6c4df6")
- Positions are [x, y] tuples in pixels, origin at top-left
- Layers are composited bottom-to-top (first layer in array is drawn first)
- Use tokens for repeated colors: reference as "$token:name"

## Instructions

1. Identify distinct scenes (visual transitions) and their timing boundaries
2. For each scene, identify the background color or gradient
3. For each scene, identify visible layers: shapes, text, images, and groups of elements
4. Detect any motion or animation across frames and express as keyframes
5. Extract exact text content where visible
6. Use descriptive scene IDs (e.g. "intro", "main", "outro")
7. Return ONLY the JSON object, no other text`
}
