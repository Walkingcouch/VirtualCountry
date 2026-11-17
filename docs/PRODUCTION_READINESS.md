# Production readiness review

Virtual Country · First Geospatial Pty Ltd · reviewed 17 November 2026 · version 0.11.0

This review answers one question: what has to be true before a community records real cultural material in Virtual Country?

**Short answer.** The software is ready for demonstrations, partner walk-throughs and testing with invented material. It is not ready for real community material. The blockers are hosting, account recovery, sign-in strength, backups, legal agreements and an independent security review. They are listed at the end.

Status words: **Done** (built and checked), **Partial** (some of it works, the gap is named), **Not started**.

## 1. Hosting and data residency

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Database region | Partial | Supabase project in Sydney | Supabase cloud runs on AWS, a US-owned company. Acceptable for the demo only |
| Web hosting | Partial | Vercel, deployed from GitHub `main` | Vercel is US-owned and serves from a global network. Acceptable for the demo only |
| Content unreadable by the host | Done | All content is encrypted on the device. `supabase/tests/security.sql` confirms an administrator and an outsider read no item text | Nothing |
| No overseas map or analytics services | Done | Mapbox removed. The CSP allows connections only to the site itself and the database. Checked by `e2e/public.spec.ts` | Nothing |
| Production hosting chosen | Not started | None | Choose with the first community. See below |

**What must move.** Everything: Postgres, sign-in (GoTrue), the REST layer (PostgREST), file storage, and the web front end. All five are open source and can be self-hosted as one stack.

**Options, in order of effort.**

1. Self-hosted Supabase stack and the Next.js app on an Australian-owned cloud provider, in two Australian sites. Lowest effort. The provider's ownership, where its staff are, and any government certification must be checked in writing before signing.
2. The same stack with a community-owned server that keeps a full encrypted copy and serves the community on its own network (the "mixed" option in the documentation).
3. A community-owned server only (the "local" option), with First Geospatial or the community managing it.

**Migration path.**

1. Stand up the new stack. Apply `supabase/migrations` in file-name order. Do not load `seed.sql`.
2. Set the three environment variables on the new front end, with `NEXT_PUBLIC_DEMO_MODE` unset.
3. Run the database advisors and the manual role check in `docs/OPERATIONS.md`. The automated security suite needs the demo people, so it runs on the demo and staging databases only.
4. Communities start fresh on the new stack. Nothing is copied from the demo.
5. Keep the demo running at its current address, clearly labelled as a demonstration.

## 2. Sign-in

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Email and password sign-in | Done | `app/login/page.tsx` | Nothing for the demo |
| Email confirmation | Partial | Confirmation emails are sent. The link has pointed at `localhost` | Owner action: set Site URL and Redirect URLs in Supabase (see hand-over) |
| Password policy | Partial | 8 characters minimum in the form | Owner action: raise the minimum to 12 and turn on leaked-password protection in Supabase Auth |
| Passphrase rules | Done | 12 characters minimum, common choices refused, strength hint. `lib/passphrase.ts`, `tests/passphrase.test.ts` | Nothing |
| Passkeys or one-time codes | Not started | Build plan Phase 1 | Build before real use. Passwords alone are too weak for this material |
| Second factor for administrators and Cultural Authorities | Not started | None | Supabase supports TOTP. Require it for both roles before real use |
| Session length | Partial | Supabase defaults. The app locks keys after 2 to 60 minutes without use (community setting) | Set a session time limit and inactivity timeout in Auth settings |
| Sign-in rate limits | Partial | Supabase defaults | Review limits. Add CAPTCHA on sign-up before opening sign-up to the public |

## 3. Email

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Sending address | Partial | Mail arrives from "Virtual Country" through a Google Workspace app password | Move to a transactional mail service with Australian processing, or the production host's own mail relay |
| SPF, DKIM, DMARC | Not started | Not checked in this review | Publish all three for `firstgeospatial.com.au`. Start DMARC at `p=none`, read the reports, then move to `quarantine` |
| Templates | Not started | Supabase default wording | Rewrite the confirm, reset and change-email templates in plain language with First Geospatial branding. Never name content, people or communities in an email |

## 4. Backups, restore and key loss

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Database backups | Partial | Whatever the Supabase plan provides. Not verified in this review | Daily encrypted backups to a second Australian site, kept 30 days, plus point-in-time recovery |
| File backups | Not started | The `media` bucket is not backed up separately | Back up the bucket on the same schedule. Files are already encrypted |
| Tested restore | Not started | None | Restore to a blank stack, sign in, open an item, verify the governance chain. Repeat every quarter and record the result |
| Governance log integrity | Done | Hash chain with `verify_audit_chain()`. Log cannot be edited or deleted by any signed-in role (security suite) | Schedule the check (section 5) |

**What can and cannot be recovered.**

| Lost | Recoverable? | By whom |
|---|---|---|
| Passphrase, recovery card kept | Yes | The person, on the unlock screen |
| Recovery card, passphrase known | Yes | The person, Me screen, "Make a new recovery card" |
| Phone or computer | Yes | The person signs in on another device with passphrase or card |
| Sign-in password | Yes | The person, by email reset. This does not open their keys; they still need the passphrase or card |
| Passphrase **and** recovery card | **No** | Nobody. Items only they hold are lost. Items shared with others remain open to those people |
| The whole database, with a backup | Yes | First Geospatial restores. Content stays encrypted throughout |
| The whole database, no backup | **No** | Nobody |
| A holder passes away | Partial | Only items with a legacy wish, once enough keepers agree. Items with no wish stay locked for good |

In-person recovery with Recovery Keepers is designed (build plan Phase 1, item 3) but **not built**. The app now says so plainly instead of promising it.

## 5. Monitoring

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Error screens for people | Done | `app/error.tsx`, `app/global-error.tsx`, offline and load-failure banners | Nothing |
| Error reporting to staff | Not started | Errors go to the browser console only | A self-hosted error collector that records the screen and error type, never content, keys, names or free text |
| Uptime checks | Not started | None | Check the site and the Auth health address every minute from an Australian location. Alert by SMS or email |
| Scheduled chain verification | Not started | The check exists and runs on the Community screen | A daily job that runs `verify_audit_chain` for every organisation and alerts on any failure |
| Database advisors | Partial | Run by hand in this review | Run after every migration. Record the result in the changelog |

## 6. Incident response and data breaches

Status: **Not started** as a written plan. What it must contain:

1. **Contain.** Rotate database and service keys, pause sign-ups, take the site to maintenance mode if needed.
2. **Assess** within 30 days whether the breach is likely to cause serious harm (Privacy Act 1988, Notifiable Data Breaches scheme). Because content is encrypted with keys the server never holds, a database leak exposes emails, display names, membership, roles, the governance log and public summaries, not stories. Membership of a community and cultural standing are themselves sensitive.
3. **Notify** affected people and the Office of the Australian Information Commissioner as soon as practicable if serious harm is likely. Tell each community's administrators and Cultural Authorities first, and follow their advice on how members are told.
4. **Record** what happened, what was exposed and what changed.

A lawyer should confirm whether the small-business exemption applies to First Geospatial. Plan as though the Act applies in full.

## 7. Legal and governance

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| Privacy notice, terms, ICIP statement, contact page | Partial | `/privacy`, `/terms`, `/icip`, `/contact`, each marked "Draft for legal review" | Legal review, then remove the draft banner |
| ICIP and data governance agreement per community | Not started | None | A signed agreement before any real material: ownership, who the Cultural Authorities are, storage option, what happens if the service ends, who may ask for takedown |
| Consent records | Done | Each item stores who consented, how, and for which uses, inside the encrypted item | Nothing |
| Takedown of public summaries | Done | Holder or any Cultural Authority can withdraw. Logged | A published contact route for outside requests (the contact page) |
| Deletion requests | Partial | Holders can delete items for good (text, files and keys erased). People can leave an organisation | Account closure is done by hand by First Geospatial. Build a self-service flow |
| CARE principles and AIATSIS Code | Partial | Design follows both: authority to control is enforced by keys, decisions are logged, nothing is published without sign-off | Review with each community against its own protocols |
| Service agreement and exit terms | Not started | None | What a community receives if First Geospatial stops operating: export format, notice period, handover of the stack |

## 8. Independent security review

Status: **Not started.** Scope for the reviewer:

1. **Cryptography design review**: key hierarchy, passphrase wrapping (Argon2id at interactive cost: consider raising), sealed boxes, signatures, Shamir implementation in `lib/shamir.ts`, legacy access flow.
2. **Authorisation**: every row level security policy and every `SECURITY DEFINER` function. `supabase/tests/security.sql` is the starting map (74 checks, 9 roles).
3. **Web application test**: OWASP ASVS Level 2, with attention to XSS (a script running in the page can use unlocked keys) and the CSP, which still allows inline scripts.
4. **Supply chain**: dependency review, build reproducibility, who can push to `main`.
5. **Operational**: backup handling, key and secret storage, staff access.

Known weaknesses to hand the reviewer up front:

- The CSP allows `'unsafe-inline'` scripts (a Next.js requirement without nonces).
- The server delivers the JavaScript that does the encryption. A compromised host could serve altered code. Mitigations: hosting control, release signing, and later an installable app.
- The vault (keys wrapped by the passphrase) is stored on the server, so passphrase strength matters.
- Cultural Authority signatures are verified on devices. The database tracks appointments but does not verify signatures itself.
- Row level security policies call `auth.uid()` per row. This is a performance point, not a security one.

## 9. Capacity and cost

| Item | Status | Notes |
|---|---|---|
| Current load | Done | 9 accounts, 2 organisations, 15 items. Far inside free-tier limits |
| File size limit | Done | 6 MB per file, enforced by the bucket and the app |
| Message and request limits | Done | 60 messages a minute per person, 5 waiting join requests, 5 waiting bridge requests per organisation, 3 organisations per person |
| Slow connections | Done | Sign-in screen usable in about 2 seconds on a simulated slow 3G link (400 kbit/s, 400 ms delay), 577 KB in total |
| Load testing | Not started | Test with 200 people and 5,000 items before the first community of that size. Item lists are decrypted on the device, so long lists will need paging |
| Long audio and video | Not started | Needs chunked upload and compression (build plan Phase 3) |

**Cost.** No quotes were obtained in this review. For planning only, and to be replaced with real quotes: the demo fits a paid hobby tier of the current services (tens of dollars a month). A self-hosted stack on Australian infrastructure with a second site, backups and monitoring is likely to be several hundred dollars a month before staff time. The independent security review is a one-off cost in the tens of thousands of dollars. Get three quotes for each.

## 10. Support

| Question | Who answers |
|---|---|
| Cannot sign in, email not arriving | First Geospatial, contact@firstgeospatial.com.au |
| Forgot passphrase | The person, with their recovery card. Nobody else can help |
| Who should be a member, who has standing | The community's administrators and Cultural Authorities |
| Something on the public page should come down | The holder or a Cultural Authority withdraws it. Outside requests go to First Geospatial, who pass them to the community |
| Suspected security problem | First Geospatial, same address, marked urgent |

Not started: a staffed support rota, response time targets, and a support console that shows account state without any content.

## 11. Release process

| Item | Status | Evidence | What is needed |
|---|---|---|---|
| One-command check | Done | `npm run check` (type check, 29 unit tests, production build) | Nothing |
| Browser tests | Partial | `npm run test:e2e`: 38 public-page tests run anywhere. 8 signed-in journeys need the demo database (`E2E_FULL=1`) and have not been run yet | Run the signed-in journeys once from a machine that can reach the database |
| Security suite | Done | `supabase/tests/security.sql`, 74 checks | Run after every migration |
| Staging environment | Not started | Changes go straight to the one demo project | A second Supabase project and a Vercel preview that points at it |
| Migration discipline | Partial | Files are numbered and additive. One migration on 17 November went live without a rolled-back trial first (recorded in the changelog) | Apply to staging first, always |
| Rollback | Partial | Vercel keeps earlier deployments and can roll back in one click. Migrations are additive, so the previous front end keeps working | Write a rollback note in each migration header |
| Automated checks on push | Not started | None | A GitHub Action that runs `npm run check` and the public browser tests |
| Version tags | Not started | `package.json` is at 0.11.0 | Tag each release in git |
| Branch protection | Not started | Anyone with access can push to `main` | Require a pull request and passing checks |

## Go / no-go

### Must fix before any real community material

1. **Hosting.** Move off Supabase cloud and Vercel to Australian-owned or on-Country infrastructure agreed with the community.
2. **Account recovery.** Build in-person recovery with Recovery Keepers, or have each community accept in writing that losing both passphrase and card means losing what only that person holds.
3. **What happens when a holder passes away.** Today only items with a legacy wish can be passed on. Decide the custodian rule with communities and build it.
4. **Sign-in strength.** Passkeys or one-time codes, and a second factor for administrators and Cultural Authorities.
5. **Backups with a tested restore.**
6. **Independent security review**, with findings fixed.
7. **Legal.** Lawyer-reviewed privacy notice and terms, and a signed ICIP and data governance agreement with each community.
8. **Incident response plan**, written and rehearsed once.
9. **Auth settings.** Site URL, redirect URLs, leaked-password protection, longer minimum password. (Owner actions, minutes each.)
10. **Demo separation.** Production runs with demo mode off, on a database that never held demo people.

### Should fix soon

1. Staging environment, automated checks on push, branch protection.
2. Error reporting and uptime monitoring that never capture content.
3. Scheduled governance chain check.
4. Email domain records and plain-language templates.
5. Remove `'unsafe-inline'` from the CSP.
6. Run the signed-in browser journeys and add them to the automated checks.
7. Simpler Record screen with "More options".
8. Self-service account closure.
9. Paging for long item and message lists.

### Later

1. Offline recording and installable app.
2. Email and push notifications.
3. Local Contexts labels, partner agreements, science datasets.
4. Device-bound keys so daily unlock does not need the passphrase.
5. Support console and billing.
