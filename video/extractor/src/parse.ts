export function parseResponse(text: string): unknown {
  const stripped = text.trim()

  const fenceMatch = stripped.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]) as unknown
  }

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return JSON.parse(stripped.slice(start, end + 1)) as unknown
  }

  throw new Error('No JSON object found in response')
}
