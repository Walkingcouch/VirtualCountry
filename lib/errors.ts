/** Turns technical errors into words a person can act on. Database rule messages are already plain and pass through. */
const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|timed out/i;

export function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You are offline. Nothing was sent. Try again when you have a connection.';
  if (NETWORK.test(raw)) return 'The connection dropped before this finished. Check your signal and try again.';
  if (/jwt expired|invalid jwt|not authenticated|refresh token/i.test(raw)) return 'Your sign-in has run out. Sign in again to carry on.';
  if (/row-level security|permission denied|violates row level/i.test(raw)) return 'You are not allowed to do that here. If you think you should be, ask your administrator.';
  if (/duplicate key|already exists/i.test(raw)) return 'That already exists.';
  if (/invalid login credentials/i.test(raw)) return 'That email and password do not match. Check them and try again.';
  if (/email not confirmed/i.test(raw)) return 'Open the link we emailed you to confirm your account, then sign in.';
  if (/user already registered/i.test(raw)) return 'There is already an account with that email. Sign in instead.';
  if (/rate limit|too many requests/i.test(raw)) return 'Too many tries in a short time. Wait a minute and try again.';
  if (/payload too large|exceeded the maximum allowed size/i.test(raw)) return 'That file is too big. Files up to 6 MB can be added.';
  return raw || 'Something went wrong. Try again.';
}
