/** Passphrase rules and a plain strength hint. Runs on the device; the passphrase is never sent anywhere. */
export const MIN_PASSPHRASE = 12;

const COMMON = ['password', 'passphrase', 'qwerty', '123456', 'letmein', 'welcome', 'iloveyou', 'abc123', 'admin', 'virtualcountry', 'country', 'changeme'];

export interface PassphraseCheck { ok: boolean; score: 0 | 1 | 2 | 3 | 4; label: string; hint: string }

const LABELS = ['Too easy to guess', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** `personal` holds words that must not make up the passphrase, such as the person's name or email. */
export function checkPassphrase(value: string, personal: string[] = []): PassphraseCheck {
  const p = value.normalize('NFKC');
  const lower = p.toLowerCase();
  const fail = (hint: string, score: 0 | 1 = 0): PassphraseCheck => ({ ok: false, score, label: LABELS[score], hint });
  if (!p) return fail(`Use at least ${MIN_PASSPHRASE} characters. Three or four words you will remember works well.`);
  if (p.length < MIN_PASSPHRASE) return fail(`${MIN_PASSPHRASE - p.length} more character${MIN_PASSPHRASE - p.length === 1 ? '' : 's'} needed. Adding another word is the easiest way.`, p.length >= 8 ? 1 : 0);
  if (new Set(lower.replace(/\s/g, '')).size < 5) return fail('Too many repeated characters. Use a few different words.');
  if (/^(?:0123456789|1234567890|abcdefghijkl|qwertyuiop)/.test(lower.replace(/[\s-]/g, ''))) return fail('That is a common pattern. Use words only you would put together.');
  const stripped = lower.replace(/[^a-z]/g, '');
  if (COMMON.some((c) => stripped === c || stripped === c + c)) return fail('That one is on every list of common passphrases. Choose something of your own.');
  for (const w of personal.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 4)) {
    if (lower.replace(/[\s-]/g, '') === w.replace(/[\s-]/g, '') || (lower.includes(w) && p.length - w.length < 6)) {
      return fail('Do not build it from your own name or email. Other people know those.');
    }
  }
  const words = p.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 2).length;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let score = 2;
  if (p.length >= 16 || words >= 3) score++;
  if (p.length >= 20 || (words >= 4 && kinds >= 2)) score++;
  const s = Math.min(4, score) as 2 | 3 | 4;
  const hint = s === 2 ? 'This will do. One more word would make it much harder to guess.' : s === 3 ? 'Good. Make sure you can remember it without writing it where others can see.' : 'Strong. Make sure you can remember it.';
  return { ok: true, score: s, label: LABELS[s], hint };
}
