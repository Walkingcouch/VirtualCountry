# Changelog

## 0.11.0 · 17 November 2026 · Readiness pass

### Security (database)

- A public summary must belong to the community that holds the item. Before this, someone could start their own organisation and sign a release of an item from another community.
- People removed from a community lose its chats, its log and every item shared with them straight away. Administrators who lose the role lose the bridges.
- Cultural Authority powers end when the person stops being an active member. A community's only Cultural Authority cannot be removed.
- Administrators cannot switch on their own content keys. The server records who approved each member. Every membership change is logged.
- A key can only be sealed to someone on the signed recipient list. Version numbers go up one at a time.
- Removed standings and withdrawn legacy approvals cannot be quietly restored.
- Group changes are logged. Only active members can be added. Members can be taken out.
- Table, column and function permissions cut back to what each role needs. Visitors can no longer list every account's public key.
- Limits: 60 messages a minute, 5 waiting join requests, 5 waiting bridge requests, one waiting release per item.
- Indexes added for the most used lookups.

Migrations: `20261116000000_audit_hardening.sql`, `20261117000000_readiness.sql`, `20261117000100_rejoin.sql`. All additive.

Process note: `readiness` was meant to be tried in a rolled-back transaction first and was committed directly by mistake. It applied cleanly and the security suite passed afterwards. `rejoin` was applied as a normal migration; its follow-up check did not run because the database tool was waiting for a confirmation that never came. Check it by hand (see the hand-over notes).

### New

- Delete an item for good (holder only).
- Groups screen for administrators. Give or remove content keys. Download the governance log as CSV.
- Leave an organisation, withdraw a request, ask to join again.
- Change passphrase and make a new recovery card from the Me screen.
- Chats are created in one step. New administrators join open bridges automatically.
- Privacy notice, terms of use, ICIP statement and contact page, marked as drafts for legal review.

### Fixed

- Blank page on errors: every screen now has an error screen with retry, home and sign-out.
- Endless "Loading" when a person had no community, or when the database could not be reached.
- Switching community briefly checked signatures against the previous community's directory.
- Unhandled errors on sign-in reload and on unlocking media.
- Five empty chats in the demo were left behind by failed chat set-up. The cause is fixed. The empty rows are harmless and hidden.

### Changed

- Mapbox removed. It was unreachable, blocked by the site's own security policy, and would have sent map views to a US service.
- Passphrases need 12 characters and common choices are refused. Set-up will not continue until part of the recovery card is typed back.
- The app no longer promises in-person recovery, which is not built.
- Demo sign-in details are left out of the build unless demo mode is on.
- Error messages are in plain language. An offline banner shows when the connection drops.
- Accessibility: darker label and status colours to meet contrast, larger chip buttons, labels on every field, skip link.

### Tests

- 29 unit tests (crypto, access rules, Shamir, legacy, passphrase rules, error text, log export).
- 38 browser tests on public pages: redirects, forms, WCAG 2.2 AA rules, 360px layout, security headers.
- 8 signed-in browser journeys written, not yet run (they need a machine that can reach the demo database).
- 74 database security checks across 9 roles.

## 0.10 · 17 October 2026

Organisations, administrators, bridge requests, "Proof it is encrypted" panel, Next.js 16.4.5 security upgrade.

## 0.9 · 16 October 2026

Review fixes and legacy access.
