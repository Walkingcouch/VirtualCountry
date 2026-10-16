# Virtual Country build plan

For use with Claude Code in VS Code. The MVP in this repository covers Phase 0. Work through the phases in order. Each phase ends with tests passing, `npm run build` passing and the Supabase advisors clean.

Ground rules for every phase:

- Keep all content encryption on the device. The server must never receive plaintext content, item keys or private keys.
- Every new table gets row level security, no client delete policies, and audit triggers through `vc_log`.
- New SQL goes in a new migration file. Do not edit applied migrations.
- Australian English in all interface text. Plain language suitable for Elders and community members.
- Code is proprietary to First Geospatial Pty Ltd. Check every new dependency's licence before adding it.

## Phase 0: MVP demo (done)

Accounts and vault, encrypted items and media, cultural locks, pause, map, releases with signatures, same-organisation messages, bridges, community management, governance log, Guide help mode, data export, Demo Country seed.

Added after the first review: changing who can open an item after it is saved, legacy access (keepers, never-to list, future recipients), two-signature Cultural Authority appointment with undo for roles and standings, governance log detail by access level, in-app notifications, chat lists split into people and groups with unread markers, bridges in their own tab, phone navigation with icons, confirm password on sign-up.

Deployment setting to check on every new environment: Supabase → Authentication → URL Configuration. Site URL must be the app address and Redirect URLs must include `<app address>/**`, or email verification links fail.

## Phase 1: Account hardening

1. Device keys: generate a non-extractable WebCrypto key per device and wrap the Account Master Key with it, so daily unlock does not need the passphrase. Keep the passphrase as a fallback.
2. Passkeys (WebAuthn) for sign-in, with email one-time codes as the fallback. Remove shared demo passwords outside demo mode.
3. Recovery Keepers: split a recovery secret with Shamir secret sharing (2 of 3 by default), sealed to each keeper, reusing `lib/shamir.ts` and the legacy keeper pattern. Add an in-person recovery flow with both keepers confirming and a waiting period logged in the governance log.
4. Optional escrow held by the community, configurable per organisation.
5. Remove `'unsafe-inline'` from the CSP using nonces.
6. Rate limits and lockout on sign-in and unlock.
7. Email and push notifications: a Supabase Edge Function (or database webhook) that sends "something is waiting for you in Virtual Country" by email and Web Push, never naming content, people or titles. Per-person settings for which alerts to receive, and quiet hours.
8. Legacy access hardening: keeper replacement when a keeper leaves or passes away (holder re-splits, or remaining keepers re-split by agreement with a waiting period), a waiting period after the threshold is met during which any keeper can object, and a yearly reminder for holders to review their wishes.

## Phase 2: Storage options

Match the three options in the documentation.

1. **Australian cloud**: self-hosted Supabase (Postgres, GoTrue, PostgREST, Storage) on an Australian-owned provider. Docker Compose plus Terraform. Daily encrypted backups to a second Australian site.
2. **Mixed**: the same stack in the cloud, plus a local server that keeps a full encrypted replica and serves the community on its own network. Sync with logical replication for metadata and object sync for media.
3. **Local server**: the stack on a community-owned server with a managed or self-managed choice. Add a health check, update channel and backup to removable drive.
4. Store `orgs.storage_option` and show the location in Community settings. Add a migration script between options.

## Phase 3: Offline and field use

1. Installable PWA with a service worker.
2. Offline recording queue in IndexedDB holding ciphertext only. Sync when back online with conflict handling by version.
3. Audio recording with compression, and photo resizing before encryption.
4. Low-bandwidth mode.

## Phase 4: Labels and partners

1. Local Contexts TK and BC Labels through the Local Contexts Hub API, linked to project IDs.
2. Partner agreements: record terms, expiry and permitted uses. Releases to partners require a current agreement.
3. Science datasets module: datasets linked to Country and to agreements, with cultural sign-off before sharing.
4. Partner organisation portal over the bridge, with read receipts and export logs.

## Phase 5: Guide and curation

1. Connect a language model in help mode only, with prompts screened by `lib/guide.ts` before sending and no content passed in.
2. Optional on-device curation help (tagging, transcription) that runs locally so content never leaves the device.
3. Community setting to turn each feature on or off, logged.

## Phase 6: Production readiness

1. Independent penetration test and cryptography review.
2. Accessibility audit to WCAG 2.2 AA.
3. Monitoring and alerting without logging content.
4. Data deletion and offboarding flows that respect holder decisions.
5. Admin console for First Geospatial support staff with no content access.
6. Billing for the three storage options.
