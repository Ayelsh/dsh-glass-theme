/**
 * Reads real pixels out of a PNG so a visual question ("is there a seam?", "is
 * this text legible on that material?") can be answered with numbers instead of
 * impressions.
 *
 * Node has zlib built in, so a minimal 8-bit PNG decoder is small enough to keep
 * here rather than adding a dependency to the plugin.
 *
 *   node tools/pixels.mjs shot.png --seams
 *   node tools/pixels.mjs shot.png --at 100,200 --at 800,400
 *   node tools/pixels.mjs shot.png --row 400 --segments
 *   node tools/pixels.mjs shot.png --col 900 --segments
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const flag = (name) => process.argv.includes(name)

/** Decode an 8-bit RGB/RGBA PNG into { width, height, get(x, y) -> [r,g,b,a] }. */
function decodePng(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8) throw new Error('only 8-bit PNGs are supported, got ' + bitDepth)
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (channels === 0) throw new Error('unsupported PNG colour type ' + colorType)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)

  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const x = src[i]
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev === null ? 0 : prev[i]
      const c = prev !== null && i >= channels ? prev[i - channels] : 0
      let v
      switch (filter) {
        case 0:
          v = x
          break
        case 1:
          v = x + a
          break
        case 2:
          v = x + b
          break
        case 3:
          v = x + ((a + b) >> 1)
          break
        case 4:
          v = x + paeth(a, b, c)
          break
        default:
          throw new Error('bad filter ' + filter + ' on row ' + y)
      }
      cur[i] = v & 0xff
    }
  }

  return {
    width,
    height,
    get(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return null
      const i = y * stride + x * channels
      return channels === 1
        ? [out[i], out[i], out[i], 255]
        : channels === 3
          ? [out[i], out[i + 1], out[i + 2], 255]
          : [out[i], out[i + 1], out[i + 2], out[i + 3]]
    },
  }
}

const file = process.argv[2]
if (file === undefined || file.startsWith('--')) {
  console.error('usage: node tools/pixels.mjs <file.png> [--at x,y] [--row y] [--col x] [--seams]')
  process.exit(1)
}
const img = decodePng(file)
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

console.log(`${file}: ${img.width}x${img.height}`)

if (flag('--at')) {
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] !== '--at') continue
    const [x, y] = process.argv[i + 1].split(',').map(Number)
    const px = img.get(x, y)
    console.log(`  (${x},${y}) rgba(${px.join(', ')})  luma ${lum(px).toFixed(1)}`)
  }
}

/**
 * A "segment" is a run of columns (or rows) whose mean colour stays within a
 * small tolerance. Boundaries between segments are the places a screenshot
 * changes character — which is exactly where an unintended seam would be.
 */
const segments = (axis, index, tolerance = 2.5) => {
  const length = axis === 'row' ? img.width : img.height
  const means = []
  for (let i = 0; i < length; i++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    if (axis === 'row') {
      for (let y = 0; y < img.height; y += 2) {
        const p = img.get(i, y)
        r += p[0]
        g += p[1]
        b += p[2]
        n++
      }
    } else {
      for (let x = 0; x < img.width; x += 2) {
        const p = img.get(x, i)
        r += p[0]
        g += p[1]
        b += p[2]
        n++
      }
    }
    means.push([r / n, g / n, b / n])
  }
  const runs = []
  let start = 0
  for (let i = 1; i <= length; i++) {
    const prev = means[i - 1]
    const cur = means[i]
    const jump = cur === undefined ? Infinity : Math.max(Math.abs(cur[0] - prev[0]), Math.abs(cur[1] - prev[1]), Math.abs(cur[2] - prev[2]))
    if (jump > tolerance || i === length) {
      if (i - start >= 2) {
        const mid = means[Math.floor((start + i - 1) / 2)]
        runs.push({ from: start, to: i - 1, color: mid.map((v) => Math.round(v)) })
      }
      start = i
    }
  }
  return runs
}

if (flag('--row')) {
  const y = Number(argOf('--row', '0'))
  console.log(`\nrow y=${y} segments:`)
  for (const r of segments('row', y)) {
    console.log(`  x ${String(r.from).padStart(5)}..${String(r.to).padStart(5)}  rgb(${r.color.join(', ')})  luma ${lum(r.color).toFixed(1)}`)
  }
}

if (flag('--col')) {
  const x = Number(argOf('--col', '0'))
  console.log(`\ncolumn x=${x} segments:`)
  for (const r of segments('col', x)) {
    console.log(`  y ${String(r.from).padStart(5)}..${String(r.to).padStart(5)}  rgb(${r.color.join(', ')})`)
  }
}

if (flag('--seams')) {
  // Scan every column mean for a one-pixel jump: that is a hard vertical edge.
  console.log('\nvertical seams (column-to-column jump > 4):')
  let found = 0
  const cols = []
  for (let x = 0; x < img.width; x++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = 0; y < img.height; y += 4) {
      const p = img.get(x, y)
      r += p[0]
      g += p[1]
      b += p[2]
      n++
    }
    cols.push([r / n, g / n, b / n])
  }
  for (let x = 1; x < cols.length; x++) {
    const d = Math.max(...cols[x].map((v, i) => Math.abs(v - cols[x - 1][i])))
    if (d <= 4) continue
    found++
    const before = cols[x - 1].map((v) => Math.round(v))
    const after = cols[x].map((v) => Math.round(v))
    if (found <= 30) console.log(`  x=${x}  ${JSON.stringify(before)} -> ${JSON.stringify(after)}  delta ${d.toFixed(1)}`)
  }
  console.log(`  ${found} seam column(s)`)
}
