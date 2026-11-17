import { describe, expect, it } from 'vitest';
import { checkPassphrase, MIN_PASSPHRASE } from '../lib/passphrase';

describe('passphrase rules', () => {
  it('refuses anything shorter than the minimum', () => {
    expect(checkPassphrase('short one').ok).toBe(false);
    expect(checkPassphrase('a'.repeat(MIN_PASSPHRASE - 1) ).ok).toBe(false);
  });
  it('refuses repeats, patterns and common choices', () => {
    expect(checkPassphrase('aaaaaaaaaaaaaaaa').ok).toBe(false);
    expect(checkPassphrase('1234567890123').ok).toBe(false);
    expect(checkPassphrase('passwordpassword').ok).toBe(false);
    expect(checkPassphrase('Virtual Country!').ok).toBe(false);
  });
  it('refuses a passphrase built from the person’s own name or email', () => {
    expect(checkPassphrase('rosemarie2026', ['Rosemarie']).ok).toBe(false);
    expect(checkPassphrase('daniel.ranger', ['x', 'daniel.ranger']).ok).toBe(false);
  });
  it('accepts a few words and scores longer ones higher', () => {
    const three = checkPassphrase('river stone emu');
    const five = checkPassphrase('river stone emu wind Rain 7');
    expect(three.ok).toBe(true);
    expect(five.ok).toBe(true);
    expect(five.score).toBeGreaterThanOrEqual(three.score);
    expect(checkPassphrase('country-demo').ok).toBe(true);
  });
});
