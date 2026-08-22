/**
 * BCH error-correcting codes over GF(2^m).
 *
 * A faithful port of `python/trustmark/bchecc.py` from adobe/trustmark (MIT),
 * which is itself a port of the Linux kernel's `lib/bch.c`. Ported rather than
 * depended upon because the reference lives in Python and Rust, and the one
 * JavaScript build Adobe ships is minified and decode-only.
 *
 * Faithfulness to the reference matters more than elegance here: a watermark we
 * can encode but Adobe's decoder cannot read is worthless, so the structure
 * below deliberately mirrors the original, including the parts that look odd
 * (`syn[2i+1] = sqrt(syn[i])` really does index `syn[i]`, as the kernel does).
 *
 * The arithmetic needs care that Python did not. Python integers are arbitrary
 * precision; JavaScript's bitwise operators coerce to *signed* 32-bit, so any
 * word with bit 31 set goes negative. Word arrays are therefore `Uint32Array`
 * (stores coerce back through ToUint32) and shifts that must be logical use
 * `>>>`. Where a literal `1 << 31` would overflow, we use `2 ** n` instead.
 */

interface Polynomial {
  deg: number
  c: number[]
}

function ceilDiv(a: number, b: number): number {
  return Math.trunc((a + b - 1) / b)
}

/** Index of the highest set bit — `floor(log2(x))` for x > 0. */
function degree(x: number): number {
  let count = 0
  while (x >>> 1) {
    x = x >>> 1
    count += 1
  }
  return count
}

function load4bytes(data: Uint8Array, offset: number): number {
  return (
    data[offset] * 0x1000000 +
    data[offset + 1] * 0x10000 +
    data[offset + 2] * 0x100 +
    data[offset + 3]
  )
}

export class BCH {
  readonly m: number
  readonly t: number
  readonly poly: number
  readonly n: number
  readonly eccBits: number
  readonly eccBytes: number

  private readonly exponents: Int32Array
  private readonly logarithms: Int32Array
  private readonly elpPre: Int32Array
  private readonly cyclicTab: Uint32Array
  private readonly eccBuf: Uint32Array
  private elp: Polynomial
  private errloc: number[]

  /**
   * @param t    correction capacity, in bit flips
   * @param poly primitive polynomial; TrustMark uses 137 (m = 7, n = 127)
   */
  constructor(t: number, poly: number) {
    const m = degree(poly)
    this.m = m
    this.t = t
    this.poly = poly
    this.n = 2 ** m - 1
    this.eccBytes = ceilDiv(m * t, 8)
    this.elp = { deg: 0, c: [] }
    this.errloc = []

    const words = ceilDiv(m * t, 32)
    this.eccBuf = new Uint32Array(words)

    // --- Galois field tables ---
    const k = 2 ** degree(poly)
    if (k !== 2 ** m) {
      throw new Error(`invalid primitive polynomial ${poly}`)
    }

    this.exponents = new Int32Array(this.n + 1)
    this.logarithms = new Int32Array(this.n + 1)
    this.elpPre = new Int32Array(this.m + 1)

    let x = 1
    for (let i = 0; i < this.n; i++) {
      this.exponents[i] = x
      this.logarithms[x] = i
      if (i && x === 1) {
        throw new Error(`polynomial ${poly} is not primitive`)
      }
      x *= 2
      if (x & k) {
        x = x ^ poly
      }
    }
    this.logarithms[0] = 0
    this.exponents[this.n] = 1

    // --- generator polynomial: enumerate the roots, then build g(x) ---
    const roots = new Uint8Array(this.n + 1)
    for (let i = 0; i < t; i++) {
      let r = 2 * i + 1
      for (let j = 0; j < m; j++) {
        roots[r] = 1
        r = this.mod(2 * r)
      }
    }

    const g: Polynomial = { deg: 0, c: new Array(m * t + 1).fill(0) }
    g.c[0] = 1
    for (let i = 0; i < this.n; i++) {
      if (!roots[i]) continue
      const r = this.exponents[i]
      g.c[g.deg + 1] = 1
      for (let j = g.deg; j > 0; j--) {
        g.c[j] = this.gMul(g.c[j], r) ^ g.c[j - 1]
      }
      g.c[0] = this.gMul(g.c[0], r)
      g.deg += 1
    }

    // Pack g(x) into 32-bit words, most significant coefficient first.
    const genpoly = new Uint32Array(ceilDiv(m * t + 1, 32))
    let remaining = g.deg + 1
    let wordIndex = 0
    while (remaining > 0) {
      const nbits = remaining > 32 ? 32 : remaining
      let word = 0
      for (let j = 0; j < nbits; j++) {
        // Addition, not `|`: bit 31 would make the operand negative.
        if (g.c[remaining - 1 - j]) word += 2 ** (31 - j)
      }
      genpoly[wordIndex] = word
      wordIndex += 1
      remaining -= nbits
    }
    this.eccBits = g.deg

    this.cyclicTab = new Uint32Array(4 * 256 * ceilDiv(m * t, 32))
    this.buildCyclic(genpoly)

    // --- precomputed table for solving quadratic error-locator polynomials ---
    let sum = 0
    let aexp = 0
    // `sum` deliberately accumulates across iterations, as the reference does.
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        sum = sum ^ this.gPow(i * 2 ** j)
      }
      if (sum) {
        aexp = this.exponents[i]
        break
      }
    }

    const precomp = new Uint8Array(31)
    let left = m
    let xx = 0
    while (xx <= this.n && left) {
      let y = this.gSqrt(xx) ^ xx
      for (let i = 0; i < 2; i++) {
        const r = this.gLog(y)
        if (y && r < m && !precomp[r]) {
          this.elpPre[r] = xx
          precomp[r] = 1
          left -= 1
          break
        }
        y = y ^ aexp
      }
      xx += 1
    }
  }

  // --- Galois field arithmetic ---

  private mod(v: number): number {
    return v < this.n ? v : v - this.n
  }

  private modn(v: number): number {
    const n = this.n
    while (v >= n) {
      v -= n
      v = (v & n) + (v >> this.m)
    }
    return v
  }

  private gMul(a: number, b: number): number {
    if (a > 0 && b > 0) {
      return this.exponents[this.mod(this.logarithms[a] + this.logarithms[b])]
    }
    return 0
  }

  private gDiv(a: number, b: number): number {
    if (a) {
      return this.exponents[
        this.mod(this.logarithms[a] + this.n - this.logarithms[b])
      ]
    }
    return 0
  }

  private gSqrt(a: number): number {
    return a ? this.exponents[this.mod(2 * this.logarithms[a])] : 0
  }

  private gLog(x: number): number {
    return this.logarithms[x]
  }

  private gPow(i: number): number {
    return this.exponents[this.modn(i)]
  }

  // --- table construction ---

  private buildCyclic(g: Uint32Array): void {
    const l = ceilDiv(this.m * this.t, 32)
    const plen = ceilDiv(this.eccBits + 1, 32)
    const ecclen = ceilDiv(this.eccBits, 32)

    for (let i = 0; i < 256; i++) {
      for (let b = 0; b < 4; b++) {
        const offset = (b * 256 + i) * l
        // `i << 8*b` would overflow into the sign bit for b = 3.
        let data = i * 2 ** (8 * b)
        while (data) {
          const d = degree(data)
          data = (data ^ (g[0] >>> (31 - d))) >>> 0
          for (let j = 0; j < ecclen; j++) {
            const hi = d < 31 ? (g[j] << (d + 1)) >>> 0 : 0
            const lo = j + 1 < plen ? g[j + 1] >>> (31 - d) : 0
            this.cyclicTab[j + offset] = this.cyclicTab[j + offset] ^ (hi | lo)
          }
        }
      }
    }
  }

  // --- public API ---

  getEccBits(): number {
    return this.eccBits
  }

  getEccBytes(): number {
    return this.eccBytes
  }

  /** Compute the ECC bytes for `data`. Also primes the buffer `decode` reads. */
  encode(data: Uint8Array): Uint8Array {
    const l = ceilDiv(this.m * this.t, 32) - 1
    const eccMaxWords = ceilDiv(31 * 64, 32)
    const r = new Uint32Array(eccMaxWords)
    const tab = this.cyclicTab

    const tab0idx = 0
    const tab1idx = tab0idx + 256 * (l + 1)
    const tab2idx = tab1idx + 256 * (l + 1)
    const tab3idx = tab2idx + 256 * (l + 1)

    let mlen = Math.trunc(data.length / 4)
    let offset = 0
    while (mlen > 0) {
      const w = (load4bytes(data, offset) ^ r[0]) >>> 0
      const p0 = tab0idx + (l + 1) * ((w >>> 0) & 0xff)
      const p1 = tab1idx + (l + 1) * ((w >>> 8) & 0xff)
      const p2 = tab2idx + (l + 1) * ((w >>> 16) & 0xff)
      const p3 = tab3idx + (l + 1) * ((w >>> 24) & 0xff)

      for (let i = 0; i < l; i++) {
        r[i] = r[i + 1] ^ tab[p0 + i] ^ tab[p1 + i] ^ tab[p2 + i] ^ tab[p3 + i]
      }
      r[l] = tab[p0 + l] ^ tab[p1 + l] ^ tab[p2 + l] ^ tab[p3 + l]
      mlen -= 1
      offset += 4
    }

    // Trailing bytes that did not fill a whole word, one at a time.
    let leftdata = data.length - offset
    let posn = offset
    while (leftdata) {
      const tmp = data[posn]
      posn += 1
      let pidx = (l + 1) * (((r[0] >>> 24) ^ tmp) & 0xff)
      for (let i = 0; i < l; i++) {
        r[i] = ((((r[i] << 8) >>> 0) | (r[i + 1] >>> 24)) ^ tab[pidx]) >>> 0
        pidx += 1
      }
      r[l] = (((r[l] << 8) >>> 0) ^ tab[pidx]) >>> 0
      leftdata -= 1
    }

    for (let i = 0; i < this.eccBuf.length; i++) {
      this.eccBuf[i] = r[i]
    }

    const out = new Uint8Array(this.eccBytes)
    for (let i = 0; i < this.eccBytes; i++) {
      const word = r[Math.trunc(i / 4)]
      out[i] = (word >>> (24 - 8 * (i % 4))) & 0xff
    }
    return out
  }

  /**
   * Correct `data` in place against the received ECC.
   *
   * @returns the number of bit flips corrected, or -1 if the errors exceed the
   *          code's capacity and the data could not be recovered.
   */
  decode(data: Uint8Array, recvecc: Uint8Array): number {
    this.encode(data)
    this.errloc = []

    const eccbuf: number[] = []
    let offset = 0
    let mlen = Math.trunc(recvecc.length / 4)
    while (mlen > 0) {
      eccbuf.push(load4bytes(recvecc, offset))
      offset += 4
      mlen -= 1
    }

    // The reference rebinds `recvecc` to the zero-padded tail here, so
    // corrections landing in the ECC never reach the caller's buffer. Only
    // corrections to `data` matter, and those we do propagate.
    const tail = new Uint8Array(4)
    const leftdata = recvecc.length - offset
    if (leftdata > 0) {
      tail.set(recvecc.subarray(offset))
      eccbuf.push(load4bytes(tail, 0))
    }
    const recveccLen = leftdata > 0 ? 4 : 0

    const eccwords = ceilDiv(this.m * this.t, 32)
    let sum = 0
    for (let i = 0; i < eccwords; i++) {
      this.eccBuf[i] = this.eccBuf[i] ^ (eccbuf[i] ?? 0)
      sum = (sum | this.eccBuf[i]) >>> 0
    }
    if (sum === 0) return 0 // no bit flips

    // --- syndromes ---
    const t = this.t
    const syn = new Array<number>(2 * t).fill(0)
    let s = this.eccBits
    const maskBits = s & 31
    const synbuf = this.eccBuf

    if (maskBits) {
      // Clearing the unused low bits keeps `i + s` non-negative below.
      synbuf[Math.trunc(s / 32)] =
        synbuf[Math.trunc(s / 32)] & ~(2 ** (32 - maskBits) - 1)
    }

    let synptr = 0
    while (s > 0 || synptr === 0) {
      let poly = synbuf[synptr]
      synptr += 1
      s -= 32
      while (poly) {
        const i = degree(poly)
        for (let j = 0; j < 2 * t; j += 2) {
          syn[j] = syn[j] ^ this.gPow((j + 1) * (i + s))
        }
        poly = (poly ^ 2 ** i) >>> 0
      }
    }
    for (let i = 0; i < t; i++) {
      syn[2 * i + 1] = this.gSqrt(syn[i])
    }

    // --- Berlekamp-Massey ---
    const n = this.n
    let pp = -1
    let pd = 1

    let pelp: Polynomial = { deg: 0, c: new Array(2 * t).fill(0) }
    pelp.c[0] = 1

    const elp: Polynomial = { deg: 0, c: new Array(2 * t).fill(0) }
    elp.c[0] = 1

    let d = syn[0]
    for (let i = 0; i < t; i++) {
      if (elp.deg > t) break
      if (d) {
        const k = 2 * i - pp
        const elpCopy: Polynomial = { deg: elp.deg, c: [...elp.c] }
        const tmp = this.gLog(d) + n - this.gLog(pd)
        for (let j = 0; j < pelp.deg + 1; j++) {
          if (pelp.c[j]) {
            const lg = this.gLog(pelp.c[j])
            elp.c[j + k] = elp.c[j + k] ^ this.gPow(tmp + lg)
          }
        }
        const newDeg = pelp.deg + k
        if (newDeg > elp.deg) {
          elp.deg = newDeg
          pelp = { deg: elpCopy.deg, c: [...elpCopy.c] }
          pd = d
          pp = 2 * i
        }
      }
      if (i < t - 1) {
        d = syn[2 * i + 2]
        for (let j = 1; j < elp.deg + 1; j++) {
          d = d ^ this.gMul(elp.c[j], syn[2 * i + 2 - j])
        }
      }
    }
    this.elp = elp

    // --- locate and flip ---
    const nroots = this.getroots(data.length, this.elp)
    const nbits = data.length * 8 + this.eccBits

    for (let i = 0; i < nroots; i++) {
      if (this.errloc[i] >= nbits) return -1
      let loc = nbits - 1 - this.errloc[i]
      loc = (loc & ~7) | (7 - (loc & 7))
      this.errloc[i] = loc
    }

    for (const bitflip of this.errloc) {
      const byte = Math.trunc(bitflip / 8)
      const bit = 2 ** (bitflip & 7)
      if (bitflip < (data.length + recveccLen) * 8 && byte < data.length) {
        data[byte] = data[byte] ^ bit
      }
    }

    return nroots
  }

  /** Roots of the error-locator polynomial — the positions of the flipped bits. */
  private getroots(k: number, poly: Polynomial): number {
    const roots: number[] = []

    if (poly.deg > 2) {
      k = k * 8 + this.eccBits

      const rep = new Array<number>(this.t * 2).fill(0)
      const d = poly.deg
      const l = this.n - this.gLog(poly.c[poly.deg])
      for (let i = 0; i < d; i++) {
        rep[i] = poly.c[i] ? this.mod(this.gLog(poly.c[i]) + l) : -1
      }
      rep[poly.deg] = 0

      const syn0 = this.gDiv(poly.c[0], poly.c[poly.deg])
      for (let i = this.n - k + 1; i < this.n + 1; i++) {
        let syn = syn0
        for (let j = 1; j < poly.deg + 1; j++) {
          const mm = rep[j]
          if (mm >= 0) syn = syn ^ this.gPow(mm + j * i)
        }
        if (syn === 0) {
          roots.push(this.n - i)
          if (roots.length === poly.deg) break
        }
      }
      if (roots.length < poly.deg) {
        this.errloc = []
        return -1 // not enough roots to correct
      }
    }

    if (poly.deg === 1 && poly.c[0]) {
      roots.push(
        this.mod(
          this.n - this.logarithms[poly.c[0]] + this.logarithms[poly.c[1]],
        ),
      )
    }

    if (poly.deg === 2 && poly.c[0] && poly.c[1]) {
      const l0 = this.logarithms[poly.c[0]]
      const l1 = this.logarithms[poly.c[1]]
      const l2 = this.logarithms[poly.c[2]]

      const u = this.gPow(l0 + l2 + 2 * (this.n - l1))
      let r = 0
      let v = u
      while (v) {
        const i = degree(v)
        r = r ^ this.elpPre[i]
        v = v ^ 2 ** i
      }
      if ((this.gSqrt(r) ^ r) === u) {
        roots.push(this.modn(2 * this.n - l1 - this.logarithms[r] + l2))
        roots.push(this.modn(2 * this.n - l1 - this.logarithms[r ^ 1] + l2))
      }
    }

    this.errloc = roots
    return roots.length
  }
}
