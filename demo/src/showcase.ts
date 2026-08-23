import type { VideoDocument } from '@variax-ai/video-schema'

/**
 * The document the renderer tab opens with.
 *
 * Deliberately verbose: it is the demo's one chance to show what the format can
 * express, so it uses scenes, tokens, vars, defs, conditions, generators,
 * sizeTo, persist, and most of the layer types — rather than a rectangle and a
 * word of text, which shows only that the renderer runs.
 */
export const showcaseDocument: VideoDocument = {
  version: 1,
  width: 540,
  height: 960,
  fps: 30,
  durationMs: 14000,

  // Declared vars drive the controls beside the preview. Nothing here is baked
  // into the layers: the same document renders for every value of these.
  vars: {
    name: { type: 'string', default: 'Ada' },
    message: {
      type: 'string',
      default:
        'A document is data, so one template renders for everyone — only the vars change.',
    },
    tier: { type: 'string', default: 'gold' },
    showStamp: { type: 'boolean', default: true },
    followers: { type: 'number', default: 1284 },
  },

  tokens: {
    brand: '#6c4df6',
    brandSoft: '#8b74ff',
    brandLift: '#9d86ff',
    brandSheen: '#c9baff',
    accent: '#f6c44d',
    ink: '#f5f5f5',
    muted: '#a3a3a3',
    card: '#241e4d',
    edge: '#3d3676',
    bg: '#141029',
  },

  defs: {
    // One expression, referenced by the trail, the composite mask and the dot
    // that casts it. Written out three times they would drift apart.
    fingertip: {
      keyframes: [
        { t: 10800, value: [110, 760], easing: 'easeInOut' },
        { t: 11500, value: [430, 620], easing: 'easeInOut' },
        { t: 12200, value: [120, 470], easing: 'easeInOut' },
        { t: 12900, value: [420, 330], easing: 'easeInOut' },
        { t: 13600, value: [270, 250], easing: 'easeInOut' },
        { t: 14000, value: [270, 250] },
      ],
    },

    // A def holding several layers splices in wherever a `use` names it.
    cardChrome: [
      {
        type: 'shape',
        shape: 'roundedRect',
        size: [460, 600],
        radius: 32,
        position: [270, 470],
        fill: '#1c1740',
        stroke: { color: '$token:edge', width: 2 },
      },
      {
        type: 'shape',
        shape: 'roundedRect',
        size: [72, 6],
        radius: 3,
        position: [270, 210],
        fill: '$token:brand',
      },
    ],
  },

  scenes: [
    // ── 1. Keyframes, generators, a repeater, effects ──────────────────────
    {
      id: 'intro',
      startMs: 0,
      endMs: 3600,
      background: {
        type: 'linearGradient',
        stops: ['#241d4d', '#141029'],
        angle: 120,
      },
      layers: [
        // Six copies of one child, each running 320ms behind the last. The
        // child animates, so the copies land in different places.
        {
          type: 'repeater',
          count: 6,
          phaseOffsetMs: 320,
          child: {
            type: 'shape',
            shape: 'ellipse',
            size: [16, 16],
            fill: '$token:brandLift',
            transform: {
              position: {
                x: { generator: { fn: 'sine', params: { from: 90, to: 450, periodMs: 5200 } } },
                y: { generator: { fn: 'pulse', params: { from: 1020, to: -40, periodMs: 2000 } } },
              },
              opacity: 0.65,
            },
          },
        },
        // The mark is a group so the face and the sheen on top of it pop in
        // as one object. Shape fills are flat colours, so the lit look is
        // built the declarative way — a bright shape over a lighter face —
        // rather than asking for a gradient the format does not carry.
        {
          type: 'group',
          children: [
            {
              type: 'shape',
              shape: 'roundedRect',
              size: [200, 200],
              radius: 44,
              position: [0, 0],
              fill: '$token:brandLift',
              stroke: { color: '$token:brandSheen', width: 2 },
              effects: [
                { type: 'dropShadow', color: '#9d86ffcc', blur: 52, offsetY: 14 },
              ],
            },
            // Blurred, so it reads as light falling on the face rather than
            // as a second rounded rect sitting on it. Kept well inside the
            // 200x200 face: the blur spreads, and the corner radius means a
            // wider sheen would haze out past the mark's own edge.
            {
              type: 'shape',
              shape: 'roundedRect',
              size: [124, 52],
              radius: 26,
              position: [0, -46],
              fill: '$token:brandSheen',
              effects: [{ type: 'gaussianBlur', radius: 14 }],
              transform: { opacity: 0.5 },
            },
          ],
          transform: {
            position: [270, 380],
            rotation: {
              keyframes: [
                { t: 0, value: -30, easing: 'easeOutBack' },
                { t: 1400, value: 0 },
              ],
            },
            scale: {
              keyframes: [
                { t: 0, value: 0.4, easing: 'easeOutBack' },
                { t: 1200, value: 1 },
              ],
            },
            opacity: {
              keyframes: [
                { t: 0, value: 0, easing: 'easeOutCubic' },
                { t: 400, value: 1 },
              ],
            },
          },
        },
        {
          type: 'text',
          content: { template: 'Hi, {name}', bindings: { name: '$var:name' } },
          font: { size: 52, weight: 700 },
          color: '$token:ink',
          align: 'center',
          position: [270, 620],
          transform: {
            opacity: {
              keyframes: [
                { t: 500, value: 0, easing: 'easeOutCubic' },
                { t: 1200, value: 1 },
              ],
            },
          },
        },
        {
          type: 'text',
          content: 'A declarative video format',
          font: { size: 20 },
          color: '$token:muted',
          align: 'center',
          position: [270, 668],
          transform: {
            opacity: {
              keyframes: [
                { t: 800, value: 0, easing: 'easeOutCubic' },
                { t: 1500, value: 1 },
              ],
            },
          },
        },
        // `persist` keeps this drawn over every later scene — one declaration,
        // not a copy per scene.
        {
          type: 'text',
          persist: true,
          content: 'variax',
          font: { size: 14, weight: 600 },
          color: '$token:muted',
          align: 'center',
          position: [270, 920],
          transform: {
            opacity: {
              keyframes: [
                { t: 2000, value: 0, easing: 'easeOutCubic' },
                { t: 2600, value: 0.55 },
              ],
            },
          },
        },
      ],
    },

    // ── 2. defs + use, sizeTo, visibleIf ──────────────────────────────────
    {
      id: 'card',
      startMs: 3600,
      endMs: 7200,
      background: '$token:bg',
      layers: [
        { type: 'use', def: '$def:cardChrome' },
        {
          type: 'text',
          content: { template: "{name}'s card", bindings: { name: '$var:name' } },
          font: { size: 24, weight: 600 },
          color: '$token:muted',
          align: 'center',
          position: [270, 268],
        },
        // The card's box comes from the text inside it — edit `message` and the
        // rectangle grows, with no measuring on the host's side.
        {
          type: 'shape',
          shape: 'roundedRect',
          radius: 24,
          fill: '$token:card',
          stroke: { color: '$token:edge', width: 2 },
          position: [270, 470],
          sizeTo: { layer: 'message', padding: [44, 40], minWidth: 320, minHeight: 150 },
        },
        {
          type: 'text',
          id: 'message',
          content: '$var:message',
          font: { size: 22 },
          color: '$token:ink',
          align: 'center',
          wrap: true,
          maxWidth: 330,
          lineHeight: 30,
          position: [270, 470],
        },
        // Two spellings of the same condition. Exactly one is drawn, and
        // nothing moves to fill the gap the other leaves.
        {
          type: 'group',
          visibleIf: { var: 'tier', in: ['gold', 'platinum'] },
          children: [
            {
              type: 'shape',
              shape: 'roundedRect',
              size: [168, 44],
              radius: 22,
              position: [270, 640],
              fill: '$token:accent',
            },
            {
              type: 'text',
              content: { template: '{tier} member', bindings: { tier: '$var:tier' } },
              font: { size: 15, weight: 700 },
              color: '#2a1f00',
              align: 'center',
              // Text is drawn from its middle, so this matches the pill's own
              // centre — the two have to be the same number to sit concentric.
              position: [270, 640],
            },
          ],
        },
        {
          type: 'text',
          visibleIf: { var: 'tier', in: ['gold', 'platinum'], not: true },
          content: 'standard member',
          font: { size: 15, weight: 600 },
          color: '$token:muted',
          align: 'center',
          position: [270, 640],
        },
        {
          type: 'shape',
          shape: 'ellipse',
          size: [64, 64],
          position: [420, 300],
          fill: '$token:brand',
          visibleIf: '$var:showStamp',
          transform: {
            rotation: { generator: { fn: 'sineOscillation', params: { from: -8, to: 8, periodMs: 2400 } } },
            opacity: 0.9,
          },
        },
      ],
    },

    // ── 3. statBeat, captionSequence, a countUp binding ────────────────────
    {
      id: 'stats',
      startMs: 7200,
      endMs: 10800,
      background: {
        type: 'radialGradient',
        stops: ['#272052', '#141029'],
      },
      layers: [
        {
          type: 'statBeat',
          entrance: 'slamIn',
          valueFont: { size: 64, weight: 700 },
          valueColor: '$token:ink',
          labelFont: { size: 16 },
          labelColor: '$token:muted',
          beats: [
            {
              value: '$var:followers',
              label: 'followers',
              position: [270, 330],
              offsetMs: 200,
              countUpMs: 1100,
            },
            { value: 42, label: 'templates', position: [150, 540], offsetMs: 700, countUpMs: 800 },
            { value: 98, label: '% recovered', position: [390, 540], offsetMs: 1000, countUpMs: 800 },
          ],
        },
        // A counter inside a sentence, rather than on its own.
        {
          type: 'text',
          content: {
            template: '{n} frames rendered from one file',
            bindings: { n: { type: 'countUp', target: 420, durationMs: 1400 } },
          },
          font: { size: 18 },
          color: '$token:muted',
          align: 'center',
          position: [270, 660],
          startMs: 7900,
        },
        {
          type: 'captionSequence',
          position: [270, 800],
          font: { size: 26, weight: 600 },
          color: '$token:brandSoft',
          maxWidth: 440,
          shrinkToFit: true,
          entrance: { type: 'rise', risePx: 24, durationMs: 280 },
          exit: { type: 'fade', durationMs: 220 },
          captions: [
            { t: 7400, text: 'Scenes are first-class' },
            { t: 8600, text: 'Counters are declarative' },
            { t: 9800, text: 'Data, never code' },
          ],
        },
      ],
    },

    // ── 4. trail + compositeMask sharing one def ──────────────────────────
    {
      id: 'trail',
      startMs: 10800,
      endMs: 14000,
      background: '$token:bg',
      layers: [
        // The mark is a stripe field seen only through the trail's alpha.
        {
          type: 'compositeMask',
          source: {
            type: 'group',
            children: [
              { type: 'shape', shape: 'rect', size: [540, 320], position: [270, 200], fill: '$token:brand' },
              { type: 'shape', shape: 'rect', size: [540, 320], position: [270, 500], fill: '$token:accent' },
              { type: 'shape', shape: 'rect', size: [540, 320], position: [270, 800], fill: '$token:brandSoft' },
            ],
          },
          mask: {
            type: 'trail',
            source: '$def:fingertip',
            windowMs: 900,
            samples: 22,
            radius: 44,
            falloff: 0.85,
          },
        },
        // The same expression again — the dot stays exactly on the trail's head
        // because both read one def, not two copies of one path.
        {
          type: 'group',
          transform: { position: '$def:fingertip' },
          children: [
            {
              type: 'shape',
              shape: 'ellipse',
              size: [30, 30],
              position: [0, 0],
              fill: '$token:ink',
            },
            {
              type: 'shape',
              shape: 'ellipse',
              size: [54, 54],
              position: [0, 0],
              stroke: { color: '$token:brandSoft', width: 2 },
            },
          ],
        },
        {
          type: 'text',
          content: 'one $def, three readers',
          font: { size: 18 },
          color: '$token:muted',
          align: 'center',
          position: [270, 880],
        },
      ],
    },
  ],
}
