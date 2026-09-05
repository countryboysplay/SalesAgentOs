/**
 * SalesTrack — app icon generator.
 *
 * Rasterises the SalesTrack mark (public/favicon.svg) to the PNGs the web app
 * manifest needs. Written against Node's built-in `zlib` and nothing else:
 * adding `sharp` or a headless browser to a project whose entire premise is
 * "no dependencies you do not need" was not worth 40MB of native binaries for
 * three static files.
 *
 *   node scripts/generate-icons.mjs
 *
 * Output:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png   (mark inset to the 80% safe zone)
 *
 * The mark: a blue rounded square carrying three ascending bars — a ledger
 * that is going up. It stays legible at 16px because it is three shapes and
 * one colour.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

/** Accent blue, matching --accent in src/styles/tokens.css. */
const ACCENT = [0x1d, 0x5b, 0xff]
const WHITE = [0xff, 0xff, 0xff]

/** 4x4 supersampling — enough to make the rounded corners read as smooth. */
const SS = 4

/* ------------------------------------------------------------------ geometry
   All shapes are described in the same 0–64 space as favicon.svg, then scaled
   to the target size, so the PNG and the SVG are the same picture. */

const BARS = [
  { x: 14, y: 34, w: 8, h: 16, r: 3, alpha: 0.55 },
  { x: 28, y: 26, w: 8, h: 24, r: 3, alpha: 0.78 },
  { x: 42, y: 14, w: 8, h: 36, r: 3, alpha: 1 },
]

const PLATE = { x: 0, y: 0, w: 64, h: 64, r: 15 }

/** Is (px, py) inside a rounded rectangle? */
function insideRoundRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  const radius = Math.min(r, w / 2, h / 2)
  // Nearest point on the inner (corner-free) rectangle.
  const cx = Math.min(Math.max(px, x + radius), x + w - radius)
  const cy = Math.min(Math.max(py, y + radius), y + h - radius)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= radius * radius
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] + (over[0] - base[0]) * alpha),
    Math.round(base[1] + (over[1] - base[1]) * alpha),
    Math.round(base[2] + (over[2] - base[2]) * alpha),
  ]
}

/**
 * Renders the mark into a raw RGBA buffer.
 * `inset` shrinks the artwork toward the centre — used for the maskable icon,
 * where a launcher may crop up to 20% off every edge.
 */
function renderIcon(size, { inset = 0, transparentOutside = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 64
  const shrink = 1 - inset * 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          // Sample at the sub-pixel centre, then convert into design space.
          const dxDevice = x + (sx + 0.5) / SS
          const dyDevice = y + (sy + 0.5) / SS
          const dx = (dxDevice / scale - 32) / shrink + 32
          const dy = (dyDevice / scale - 32) / shrink + 32

          let color
          let alpha
          if (insideRoundRect(dx, dy, PLATE)) {
            color = ACCENT
            alpha = 1
            for (const bar of BARS) {
              if (insideRoundRect(dx, dy, bar)) {
                color = blend(ACCENT, WHITE, bar.alpha)
                break
              }
            }
          } else if (transparentOutside) {
            color = [0, 0, 0]
            alpha = 0
          } else {
            // Maskable icons must bleed to the edge — no transparent margin,
            // or a circular mask reveals the launcher background behind it.
            color = ACCENT
            alpha = 1
          }

          r += color[0] * alpha
          g += color[1] * alpha
          b += color[2] * alpha
          a += alpha
        }
      }

      const samples = SS * SS
      const coverage = a / samples
      const i = (y * size + x) * 4
      if (coverage > 0) {
        // Un-premultiply so the edge pixels keep their true colour.
        pixels[i] = Math.round(r / a)
        pixels[i + 1] = Math.round(g / a)
        pixels[i + 2] = Math.round(b / a)
      }
      pixels[i + 3] = Math.round(coverage * 255)
    }
  }

  return pixels
}

/* ------------------------------------------------------------------ PNG bits */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** Encodes an RGBA buffer as a PNG. Filter type 0 (None) on every scanline. */
function encodePng(pixels, size) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------------- main */

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, options: { transparentOutside: true } },
  { file: 'icon-512.png', size: 512, options: { transparentOutside: true } },
  // Maskable: artwork inset to the 80% safe zone, background bleeding edge to
  // edge so any mask shape crops into colour rather than into nothing.
  { file: 'icon-maskable-512.png', size: 512, options: { inset: 0.1 } },
]

for (const { file, size, options } of targets) {
  const png = encodePng(renderIcon(size, options), size)
  writeFileSync(resolve(OUT_DIR, file), png)
  console.log(`wrote public/icons/${file}  ${size}x${size}  ${png.length} bytes`)
}
