/**
 * The pixel type this package works in.
 *
 * Structurally compatible with the DOM's `ImageData`, so a canvas frame can be
 * passed straight in, but declared here so the package works in Node without a
 * canvas polyfill. Video decoded by ffmpeg arrives as raw RGBA too.
 */
export interface Frame {
  width: number
  height: number
  /** RGBA, four bytes per pixel, row-major, top-left origin. */
  data: Uint8ClampedArray
}

/** A planar float image: `channels` separate `width * height` planes. */
export interface Planar {
  width: number
  height: number
  channels: number
  data: Float32Array
}

export function createFrame(width: number, height: number): Frame {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function assertFrame(frame: Frame, label = 'frame'): void {
  const expected = frame.width * frame.height * 4
  if (frame.width <= 0 || frame.height <= 0) {
    throw new Error(`${label} has non-positive dimensions`)
  }
  if (frame.data.length !== expected) {
    throw new Error(
      `${label} is ${frame.width}x${frame.height} so needs ${expected} bytes, got ${frame.data.length}`,
    )
  }
}

export function sameSize(a: Frame, b: Frame): boolean {
  return a.width === b.width && a.height === b.height
}
