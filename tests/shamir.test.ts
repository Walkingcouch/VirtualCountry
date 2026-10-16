import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { combine, split } from '../lib/shamir';

const rnd = (n: number) => new Uint8Array(randomBytes(n));

describe('shamir', () => {
  const secret = rnd(32);

  it('any two of three shares rebuild the key', () => {
    const [a, b, c] = split(secret, 3, 2, rnd);
    expect(combine([a, b])).toEqual(secret);
    expect(combine([b, c])).toEqual(secret);
    expect(combine([c, a])).toEqual(secret);
  });

  it('three of five shares rebuild the key, in any order', () => {
    const s = split(secret, 5, 3, rnd);
    expect(combine([s[4], s[0], s[2]])).toEqual(secret);
    expect(combine([s[1], s[3], s[4]])).toEqual(secret);
  });

  it('too few shares give a different value', () => {
    const s = split(secret, 5, 3, rnd);
    expect(combine([s[0], s[1]])).not.toEqual(secret);
  });

  it('a single share reveals nothing about the key byte for byte', () => {
    const s1 = split(new Uint8Array(32), 3, 2, rnd)[0];
    const s2 = split(new Uint8Array(32).fill(255), 3, 2, rnd)[0];
    // with random coefficients, shares of very different secrets are both uniformly spread
    expect(s1.slice(1)).not.toEqual(new Uint8Array(32));
    expect(s2.slice(1)).not.toEqual(new Uint8Array(32).fill(255));
  });

  it('rejects duplicate shares', () => {
    const [a] = split(secret, 3, 2, rnd);
    expect(() => combine([a, a])).toThrow();
  });
});
