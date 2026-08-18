import type { VideoDocument } from '@variax-ai/video-schema'

export function parseResponse(text: string): VideoDocument {
  const stripped = text.trim()

  const fenceMatch = stripped.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]) as VideoDocument
  }

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return JSON.parse(stripped.slice(start, end + 1)) as VideoDocument
  }

  throw new Error('No JSON object found in response')
}
