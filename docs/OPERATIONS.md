# Operations guide

Virtual Country · First Geospatial Pty Ltd · 17 November 2026

For the person running the service day to day. Everything here applies to the demonstration now and to production later. Where the two differ, it says so.

Two rules come first:

- First Geospatial cannot read stories, messages or files, and must never try to. Support work uses account state and the governance log only.
- Never put real community material in the demonstration.

## Routine checks

### Daily (5 minutes)

1. Open the site and sign in. If it does not load, see "When something breaks".
2. Supabase → Reports: look for failed requests or a jump in sign-ups.
3. Check the support inbox, contact@firstgeospatial.com.au.

### Weekly (15 minutes)

1. Supabase → Advisors → Security. Expected: warnings only for functions signed-in people are meant to call, plus leaked-password protection until that is switched on. Anything new needs a look.
2. Community screen → Governance log for each organisation you administer: the chip should read "Chain intact".
3. Supabase → Authentication → Users: remove obvious junk sign-ups that never confirmed their email.
4. Vercel → Deployments: the latest production deployment is "Ready".

### Monthly (1 hour)

1. `npm audit` and `npm outdated`. Apply security updates, run `npm run check`, deploy.
2. Run `supabase/tests/security.sql` in the SQL editor of the demo project. Every row must show `ok = true`.
3. Download the governance log (Community → Download log) for each organisation you administer and file it.
4. Production only: restore last night's backup to a blank stack and open one item. Record the date and result.

## Everyday tasks

### Add a community

1. The person who will be its first administrator creates an account and finishes set-up (passphrase, then recovery card).
2. They go to Organisations → Start a new organisation, choose "Community" and name it.
3. They are now its administrator and founding Cultural Authority. They should appoint a second Cultural Authority soon: Community → People → "Put forward as Cultural Authority". A community cannot remove its only Cultural Authority.
4. Each person can start up to 3 organisations.

### Approve, remove and manage members

- **Approve**: Community → People → Approve. The server records who approved and when.
- **Remove**: Community → People → Remove. The person loses the chats, the log and every item shared with them straight away. Holders will see an "Update access" prompt so items are locked again without them.
- **Content keys**: an administrator who should run things but not open stories has "No content keys". Another administrator can change this. Nobody can change their own.
- **Administrators**: "Make administrator" and "Remove administrator role". The last administrator cannot step down.
- **Groups**: Community → Groups. Create a group, add or take out people. Changes apply the next time a holder updates access. Every change is logged.
- **Someone left and wants to come back**: they ask again from Organisations, and an administrator approves them as before.

### Lost passphrase or recovery card

| Situation | What to tell the person |
|---|---|
| Forgot passphrase, has the card | On the unlock screen choose "Forgot it? Use my recovery card", type the card, choose a new passphrase |
| Lost the card, knows the passphrase | Me → "Make a new recovery card". The old card stops working |
| Forgot the sign-in password | Use the email reset. They still need their passphrase or card after signing in |
| Lost both passphrase and card | Nothing can open their private space. Items they shared can still be opened by the people they shared with. With the person's clear agreement, First Geospatial can clear their vault so they can set up again with new keys. Everything only they held is gone for good |

Never ask for a passphrase or recovery card, and never accept one by email.

### Bridges between organisations

- **Open**: an administrator asks from Messages → Bridges. An administrator of the other organisation accepts or declines. Nobody can accept their own request.
- **Close**: either side's administrator, from the same screen. Nobody can write to a closed bridge. It can still be read.
- **New administrators** join their organisation's open bridges automatically. They can read once any existing bridge member next opens the chat, because that device passes on the key.
- **Former administrators** lose bridge access as soon as the role is removed.
- An organisation can have 5 requests waiting. After a decline, the same request cannot be sent again for a day.

### Export the governance log

Community → Governance log → "Download log (CSV)". The file has one line per action with who, what, when and the chain fingerprints. Detail columns are filled only for administrators and Cultural Authorities.

### Public summaries

- A holder drafts one from an item that has consent for public use. One draft per item can be waiting.
- A Cultural Authority of the same community signs it. Sacred, paused or deleted items can never be published.
- The holder or any Cultural Authority can withdraw it at any time.

### Delete an item

Only the holder can. Item screen → Holder tools → "Delete this item". Files, stored text and every key are erased. Legacy wishes for it are cancelled. The log keeps a line saying it existed and was deleted. It cannot be undone, by anyone.

### Reset the demonstration

```bash
DATABASE_URL=<demo connection string> npm run demo:reset
```

It shows the target and asks you to type `RESET DEMO`. It removes the two demo organisations and the six demo people, then loads `supabase/seed.sql`. Accounts made by testers are kept. **This script has not been run yet. Read `supabase/demo_reset.sql` before its first use, and never run it against production.**

## Releasing a change

1. `npm run check` passes (type check, unit tests, build).
2. `npm run test:e2e` passes. For the signed-in journeys: `E2E_FULL=1 npm run test:e2e` from a machine that can reach the demo database.
3. Database changes go in a new file in `supabase/migrations`. Nothing is dropped. Try each in a transaction that is rolled back, then apply.
4. Run `supabase/tests/security.sql` and the Supabase advisors.
5. Push to `main`. Vercel deploys. Check the deployment is "Ready" and sign in once.
6. Add a line to `docs/CHANGELOG.md`.

To undo a bad release: Vercel → Deployments → the last good one → "Promote to Production". Migrations are additive, so the earlier front end keeps working.

## Manual checks the tests do not cover

Do these by hand after any change to sign-in or set-up:

1. Create an account with a new email address. The confirmation link opens the live site, not `localhost`.
2. Set-up refuses a short or common passphrase and will not continue until the last four characters of the recovery card are typed.
3. Ask to join a community, approve from an administrator account, and confirm the new member sees nothing until a holder updates access.
4. Unlock with the recovery card and choose a new passphrase.
5. Turn the network off: the offline banner appears and saving shows a plain message.

## When something breaks

| What you see | Likely cause | What to do |
|---|---|---|
| "Virtual Country could not start" | A missing environment variable on the host | Vercel → Settings → Environment Variables: the three `NEXT_PUBLIC_` values. Redeploy |
| "Something went wrong on this screen" | A bug on one screen | Note the screen and the reference. "Try again" usually recovers. Report it |
| Red banner with "Try again" | The database could not be reached | Check Supabase status and the project is not paused |
| Confirmation email link opens `localhost` | Auth URL settings | Supabase → Authentication → URL Configuration |
| "You are not allowed to do that here" | The database refused the action | Usually correct. Check the person's role and membership |
| An item shows "cannot be opened" | That device has no key for it | The holder uses "Update access", or the person was removed |
| "Chain broken" on the Community screen | The governance log was changed outside the app | Treat as a security incident. Stop, record the entry number, contact First Geospatial |
| Site is down | Hosting | Vercel → Deployments. Roll back to the last good deployment |

For a suspected security incident: do not delete anything, write down the time and what you saw, and email contact@firstgeospatial.com.au marked urgent. The steps are in `docs/PRODUCTION_READINESS.md`, section 6.
