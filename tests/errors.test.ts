import { describe, expect, it } from 'vitest';
import { friendly } from '../lib/errors';

describe('plain-language errors', () => {
  it('explains a dropped connection', () => {
    expect(friendly(new TypeError('Failed to fetch'))).toMatch(/connection dropped/i);
  });
  it('explains a refused action without database words', () => {
    const text = friendly({ message: 'new row violates row-level security policy for table "items"' });
    expect(text).toMatch(/not allowed/i);
    expect(text).not.toMatch(/row-level|policy|table/i);
  });
  it('explains sign-in problems', () => {
    expect(friendly(new Error('Invalid login credentials'))).toMatch(/do not match/i);
    expect(friendly(new Error('Email not confirmed'))).toMatch(/confirm/i);
    expect(friendly(new Error('JWT expired'))).toMatch(/sign in again/i);
  });
  it('passes database rule messages through, because they are already plain', () => {
    const rule = 'Every organisation needs at least one administrator. Make someone else an administrator first.';
    expect(friendly(new Error(rule))).toBe(rule);
  });
  it('never returns an empty message', () => {
    expect(friendly(undefined)).toBeTruthy();
    expect(friendly(new Error(''))).toBeTruthy();
  });
});
