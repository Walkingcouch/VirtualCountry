/**
 * Shamir secret sharing over GF(256), byte by byte.
 * Used by legacy access: an item key is split so that any `threshold` Legacy Keepers together can rebuild it,
 * while fewer than `threshold` keepers learn nothing about it.
 * Share format: [x, y0, y1, ... yN] where x is 1..255.
 */

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // multiply by the generator 3 in GF(256) with the AES polynomial 0x11b
    x ^= (x << 1) ^ ((x & 0x80) ? 0x11b : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}
function div(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero');
  if (a === 0) return 0;
  return EXP[(LOG[a] + 255 - LOG[b]) % 255];
}

/** Split `secret` into `n` shares, any `threshold` of which rebuild it. `random` must return cryptographically secure bytes. */
export function split(secret: Uint8Array, n: number, threshold: number, random: (len: number) => Uint8Array): Uint8Array[] {
  if (threshold < 2) throw new Error('threshold must be at least 2');
  if (n < threshold) throw new Error('need at least as many shares as the threshold');
  if (n > 255) throw new Error('at most 255 shares');
  const shares = Array.from({ length: n }, (_, i) => {
    const s = new Uint8Array(secret.length + 1);
    s[0] = i + 1;
    return s;
  });
  for (let b = 0; b < secret.length; b++) {
    // polynomial with constant term = secret byte and random higher coefficients
    const coeffs = new Uint8Array(threshold);
    coeffs[0] = secret[b];
    coeffs.set(random(threshold - 1), 1);
    for (const s of shares) {
      const x = s[0];
      let y = 0;
      for (let k = threshold - 1; k >= 0; k--) y = mul(y, x) ^ coeffs[k];
      s[b + 1] = y;
    }
  }
  return shares;
}

/** Rebuild the secret from at least `threshold` distinct shares (Lagrange interpolation at x = 0). */
export function combine(shares: Uint8Array[]): Uint8Array {
  if (shares.length < 2) throw new Error('need at least two shares');
  const len = shares[0].length;
  if (shares.some((s) => s.length !== len)) throw new Error('shares are different lengths');
  const xs = shares.map((s) => s[0]);
  if (new Set(xs).size !== xs.length || xs.includes(0)) throw new Error('shares must be distinct');
  const out = new Uint8Array(len - 1);
  for (let b = 1; b < len; b++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) {
      let basis = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        basis = mul(basis, div(xs[j], xs[j] ^ xs[i]));
      }
      acc ^= mul(shares[i][b], basis);
    }
    out[b - 1] = acc;
  }
  return out;
}
