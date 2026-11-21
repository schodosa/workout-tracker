// Random IDs for user records.
//
// crypto.randomUUID() only exists in "secure contexts" (HTTPS or localhost), so it would crash
// when testing over the LAN at http://192.168.x.x. crypto.getRandomValues() works everywhere,
// so we build a version-4 UUID from it ourselves.
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
