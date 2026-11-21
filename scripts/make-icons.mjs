// Generates the PWA icons (PNG) with no dependencies, using Node's built-in zlib.
// Run with: npm run icons   (only needed if you change the design)
//
// A PNG is a signature plus "chunks": IHDR (size/format), IDAT (zlib-compressed pixel rows),
// and IEND. Each chunk carries a CRC32 checksum.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x0f, 0x11, 0x15]
const FG = [0x4a, 0xde, 0x80]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Dumbbell made of rectangles, in units of a 100x100 grid. Kept inside the central
// 80% so Android "maskable" cropping doesn't clip it.
const shapes = [
  [20, 30, 8, 40], // left outer plate
  [29, 22, 9, 56], // left inner plate
  [38, 46, 24, 8], // bar
  [62, 22, 9, 56], // right inner plate
  [72, 30, 8, 40], // right outer plate
]
function isForeground(x, y, size) {
  const u = (x / size) * 100
  const v = (y / size) * 100
  return shapes.some(([sx, sy, w, h]) => u >= sx && u < sx + w && v >= sy && v < sy + h)
}

function png(size) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3) // first byte = filter type 0 (none)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isForeground(x, y, size) ? FG : BG
      row[1 + x * 3] = r
      row[2 + x * 3] = g
      row[3 + x * 3] = b
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const rects = shapes
  .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`)
  .join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#0f1115"/><g fill="#4ade80">${rects}</g></svg>\n`

writeFileSync('public/icon-192.png', png(192))
writeFileSync('public/icon-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
writeFileSync('public/favicon.svg', svg)
console.log('Icons written to public/')
