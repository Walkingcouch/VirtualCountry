'use client';

/** Last line of defence: shown when the whole app shell fails (for example a missing setting). Uses no shared styles or code. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-AU">
      <body style={{ margin: 0, minHeight: '100vh', background: '#10151B', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 520 }} role="alert">
          <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Virtual Country could not start</h1>
          <p style={{ opacity: 0.8, margin: '0 0 8px' }}>Nothing you saved has been lost. This is a problem with the site, not with your stories.</p>
          <p style={{ opacity: 0.6, fontSize: 14, margin: '0 0 16px', wordBreak: 'break-word' }}>{error.message}{error.digest ? ` (reference ${error.digest})` : ''}</p>
          <button onClick={reset} style={{ background: '#DDA66A', color: '#10151B', border: 0, borderRadius: 6, padding: '12px 18px', fontWeight: 700, fontSize: 16, cursor: 'pointer', marginRight: 8 }}>Try again</button>
          <a href="/login" style={{ color: '#fff' }}>Go to sign in</a>
          <p style={{ opacity: 0.6, fontSize: 13, marginTop: 20 }}>Still stuck? Email <a style={{ color: '#DDA66A' }} href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a></p>
        </div>
      </body>
    </html>
  );
}
