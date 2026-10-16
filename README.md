# Virtual Country

A First Nations-led ICIP platform and living archive.
Proprietary software of First Geospatial Pty Ltd. All rights reserved. Not for redistribution.

This repository is the minimum viable product (MVP) demo. It runs on a Supabase sandbox populated with invented "Demo Country" data. No real community material belongs in the demo project.

## What the MVP does

| Area | What works now |
|---|---|
| Accounts and keys | Sign-in, key creation on the device, passphrase lock, printed recovery code, six-word safety code, key-change alerts |
| Record | Stories, places, photos and audio, encrypted on the device before upload |
| Cultural locks | Women's, men's, family, named people, only me, sacred, deceased and seasonal flags. Keys go only to people a Cultural Authority has confirmed |
| Sorry business | Pause re-locks an item to the holder alone |
| Map | Invented Demo Country map. Exact places stay locked; public releases show a blurred square only |
| Releases | Holder drafts a public summary, a Cultural Authority signs it, and the public page checks the signature |
| Messages | End-to-end encrypted chats inside one organisation. Other organisations are reached only through an administrator bridge that every member can see |
| Community | Approve and remove members, confirm standings by signature, settings, governance log with hash chain check |
| Guide | Help mode that answers from built-in help and blocks locked terms, coordinates, emails, phone numbers and recovery codes |
| Your data | Download everything you can open |

## Run it locally (VS Code)

Requires Node 22 or later.

```bash
npm install
cp .env.example .env.local     # then paste the publishable key from Supabase
npm run dev                    # http://localhost:3000
npm test                       # crypto and seed round-trip tests
npm run build                  # production build check
```

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=https://mqtlsexmvgofjpreqttx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key, Supabase > Project Settings > API Keys>
NEXT_PUBLIC_DEMO_MODE=true
```

The Supabase project `virtual-country` (Sydney region) already has both migrations applied and the demo seed loaded.

## Put the demo online (Vercel)

From the repository folder:

```bash
npx vercel link                       # create or pick the project
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add NEXT_PUBLIC_DEMO_MODE production     # value: true
npx vercel --prod --regions syd1
```

Alternatively, push the repository to a private GitHub repo and import it at vercel.com/new, adding the same three variables.

## Demo accounts

All accounts use password `VirtualCountry-demo-2026` and unlock passphrase `country-demo`. The sign-in page has one-tap buttons for each.

| Person | Role | What to look for |
|---|---|---|
| Rose | Elder, founding Cultural Authority, women's standing | Sees women's and family items. Can sign releases |
| Tom | Elder, Cultural Authority, men's standing | Sees men's items. Can sign Daniel's waiting release |
| Maya | Teacher, women's standing, Recovery Keeper | Has a private "only me" note |
| Daniel | Ranger, men's standing | Never receives women's or family keys |
| Sam | Community Administrator | Runs the community but holds no content keys. Sees zero stories |
| Dr Lee | Researcher, partner organisation administrator | Outside the community. Talks to Sam only through the bridge |

## Ten-minute demo walkthrough

1. Open the landing page, then **Public**. Two signed public summaries appear with a "Signature checked" mark and blurred locations.
2. Sign in as **Rose**. Open **Stories** and an item with women's restrictions. Open "What the server sees": only ciphertext and a signature.
3. Sign out and sign in as **Daniel**. The same women's item is not in his list, because his device was never given its key.
4. As **Daniel**, record a short story with a photo and choose "Men's". Then open **Releases**: his draft is waiting for sign-off.
5. Sign in as **Tom** and open **Releases**. Approve and sign Daniel's draft. Check it on the **Public** page.
6. As **Tom**, open one of his items and press **Pause** (sorry business). The item re-locks to the holder only.
7. Sign in as **Sam**. **Stories** is empty: administrators manage people, not content. Open **Community** to approve members and view the governance log with "Chain intact".
8. As **Sam**, open **Messages**. The bridge to Demo University is listed, and every member can see that it exists and when it was used.
9. Press **Try it** under "Test the rule". The database refuses a chat with someone outside the organisation.
10. Sign in as **Maya**. Open **Me**, compare her safety code and download her data.
11. As **Rose**, open one of her women's items and tap **Change who can open this**. Add or remove a person and save. The change is a new locked version, the people affected get a message, and **Community → Governance log** shows who was added and removed (open the entry; detail is visible to administrators and Cultural Authorities only).
12. As **Rose**, open one of her items that has no women's or men's restriction and tap **Pass this on, later**. Name Daniel as the person to receive it (as if he were a grandchild), add "Kevin" under "never to", choose "After I pass away, once they reach age 18", choose Tom and Maya as Legacy Keepers with 2 of 2 required, and save.
13. Sign in as each keeper and open **Legacy**. Each keeper sees the wishes, the never list and the message, ticks that the wishes are met and chooses Daniel and taps **Agree and pass on my part**. Anyone on a never list is left out of the choices. When the second keeper agrees, Daniel opens **Legacy** and taps **Receive it**. The item now opens for them. Every step is in the governance log.
14. As **Rose**, open **Community**. Daniel shows as put forward as a Cultural Authority and waiting for a second Cultural Authority (Rose's signature is already in the sandbox). Sign in as **Tom**, who sees it in **Notifications**, and either agrees or withdraws the nomination. Standings and roles can be undone from the same screen.

## Project layout

```
app/                  Next.js App Router pages
  (root)              home, record, stories, map, messages, releases, community, legacy, notifications, me
  login, setup, public
components/           map, Guide, unlock screen, logo, chips
lib/
  crypto.ts           libsodium: XChaCha20-Poly1305, X25519 sealed boxes, Ed25519, Argon2id, BLAKE2b
  access.ts           who may receive keys, worked out on the device from signed attestations
  vault.ts            account key vault (passphrase and recovery code)
  data.ts             items, media, releases, messages, bridges, governance
  session.tsx         keys held in memory only, auto-lock, key pinning
  guide.ts            help answers and screening
  shamir.ts           Shamir secret sharing over GF(256)
  legacy.ts           legacy wishes: split item keys among keepers, release, receive
  notifications.ts    in-app notifications worked out on the device
supabase/
  migrations/         schema, row level security, audit hash chain, RPCs
  seed.sql            generated Demo Country data (npm run seed:sql)
scripts/seed.ts       seed generator (real keys, real encryption)
tests/                vitest
docs/BUILD_PLAN.md    remaining phases for the full build
```

## Security model in brief

- Content, media and messages are encrypted on the device. The server stores ciphertext, signatures and per-person sealed key envelopes.
- Each item has its own key. The holder's device decides who receives it, using standings that a Cultural Authority has signed. The founding Cultural Authority is the trust anchor.
- Administrators with no content membership never receive keys. Row level security also blocks them from reading envelopes.
- Every action is written to a hash-chained governance log by database triggers. Rows cannot be updated or deleted by clients. Extra detail for each entry (who signed, who was added or removed) sits in a separate table readable only by administrators and Cultural Authorities, and its fingerprint is part of the chain.
- A new Cultural Authority needs two existing Cultural Authorities to sign (the founding Cultural Authority alone can appoint the second). Nobody can appoint themselves.
- Legacy access splits an item's key into parts held by Legacy Keepers. A set number must agree before the database lets the recipient's device add its own key envelope. Nobody on the holder's "never to" list can be chosen.
- Messages stay inside an organisation. The only path between organisations is an administrator bridge whose existence and activity every member can see.

## Known demo limits

These are deliberate shortcuts for the sandbox. They are listed in `docs/BUILD_PLAN.md` for the full build.

- Supabase cloud and Vercel run on AWS. They are used for the demo only. Production uses self-hosted Supabase on Australian-owned infrastructure or a local server, as set out in the documentation.
- The key vault is wrapped with the passphrase and stored on the server. Device-bound keys, passkeys and one-time codes come next.
- Demo accounts share one password and passphrase.
- The Content Security Policy still allows inline styles required by Next.js.
- The Guide uses built-in help and keyword screening. No language model is connected.
- Recovery Keepers are shown but in-person recovery is not built yet. Legacy access already uses the same key splitting, so recovery can reuse it.
- Notifications are in-app only. Email and push alerts need a server-side sender (see the build plan).
- Legacy keepers judge whether a condition is met (age, passing). The app does not check dates of birth or death records.
- The map is an invented drawing, not real geography.

© First Geospatial Pty Ltd. Proprietary and confidential.
