# USDT → INR Exchange (Release 1 MVP)

Verified Indian users sell USDT (Tron TRC-20 or BNB Smart Chain BEP-20) and receive rupees in their own bank account or UPI. Admins review each order and pay by hand, then record the bank reference (UTR). Built to the Release 1 spec. Release 2 items are not included.

**Status:** runs end to end in **Test mode** (Tron Nile + BSC Testnet). It is not ready for real money until the "Going live" checklist below is done and the owner has answered the open questions.

---

## Run it with Docker (test phases)

Needs only Docker.

```bash
docker compose up -d --build        # first run builds the image (~3–5 min)
open http://localhost:3000           # user site
open http://localhost:3000/admin     # admin panel
```

| What | Value |
|---|---|
| Admin login | `owner@example.com` / `change-me-now-please` |
| Admin 2FA | Required. First sign-in shows a QR code for Google Authenticator or a similar app. |
| User login | Email + password sign-up (the confirmation link is in **Admin → Test tools → Outbox**), or "Test sign-in" (any email, no password). Google sign-in appears when the Firebase settings are filled in. |
| Mobile OTP | Shown on screen in Test mode (no SMS account needed) |
| Emails | Not sent. Listed in **Admin → Test tools → Outbox** |
| Test USDT payment | **Admin → Test tools → Simulate an incoming USDT payment**: enter the exact order amount |
| ID documents | Saved in a private Docker volume, opened only through 5-minute signed links |

The encryption key is generated on first start and stored in the `appdata` volume. `docker compose down -v` wipes all data, including that key.

To use a pre-built image instead of building locally: `APP_IMAGE=ghcr.io/thecoderas/crptrx:latest docker compose up -d --no-build`. The image is published by the Docker workflow on every push to `main`.

### Full walkthrough (about 5 minutes)
1. **Admin:** log in at `/admin` and scan the 2FA QR code.
2. **User** (another browser or a private window): test sign-in → confirm mobile (the code is on screen) → submit KYC (any JPG/PNG/PDF files).
3. **Admin → KYC:** open the documents (each view is logged), then Approve or ask for changes.
4. **User:** add a bank account or UPI ID. **Admin → Payout methods:** approve it (a name mismatch is highlighted in red).
5. **User → Sell:** pick a network → enter 100 USDT → **Get my quote** → **Confirm and get deposit address**. Note the exact amount, e.g. `100.37`.
6. **Admin → Test tools:** simulate a payment of exactly that amount on the same network. The order becomes *Payment received*.
7. **Admin → Orders:** Start review → fill in the wallet check → Approve → Mark as paid (UTR, exact net amount, 2FA code).
8. **User:** the order shows the UTR and a **Download receipt (PDF)** button.

Things to try: pay the wrong amount, pay after the 15-minute expiry, submit a BSC TxID on a Tron order, simulate a fake token, change a deposit address (1-hour delay plus a cancel link in the Outbox).

`e2e/flow.mjs` automates this walkthrough in a real browser. CI runs it against the built image.

### Real testnet tokens and Google sign-in (Stage 2)
Step-by-step guide: **[docs/STAGE2.md](docs/STAGE2.md)**. The `Testnet chain check` workflow (Actions tab) checks the Tron/BSC readers against the live test networks.

### Real testnet tokens (short version)
The seeded test deposit addresses are random placeholders that nobody controls. To test with real Nile or BSC-Testnet tokens:
1. Put your own testnet wallet addresses in **Admin → Settings → Deposit addresses** (they take effect after 1 hour).
2. Check that **USDT token contracts** (Test mode) are the test tokens you will actually send. The pre-filled ones are commonly used test tokens and **must be confirmed by the owner**.
3. Optional: add `TRONGRID_API_KEY` (TronGrid limits keyless use).

### Using Supabase as the database
Supabase is only the database here; the app and worker still run in Docker.
1. Create a Supabase project in region **South Asia (Mumbai)**.
2. Project Settings → Database → **Connect** → copy the **Session pooler** string. Put your database password in it, and add `?sslmode=require&connection_limit=5` to the end.
3. Put it in `.env` as `DATABASE_URL=...` and run `docker compose up -d --build`. Tables are created on start.

Every table has row-level security switched on, so Supabase's public data API can't read them. The app connects as the table owner and is unaffected.

---

## Local development

Needs Node 22 and PostgreSQL 16.

```bash
npm ci
cp .env.example .env          # set DATABASE_URL, ENCRYPTION_KEY; for local testing set DEV_LOGIN_ENABLED=true DEV_TOOLS_ENABLED=true
npx prisma migrate deploy
npm run db:seed               # uses SEED_* values from .env
npm run dev                   # web on :3000
npm run worker                # blockchain watchers + quote expiry (separate terminal)
npm test                      # needs TEST_DATABASE_URL (default postgresql://postgres@localhost:5432/usdt_test)
```

---

## How it's built

| Part | Choice |
|---|---|
| App | Next.js 15 (TypeScript). One codebase for the user site and the admin panel (`/admin`). |
| Database | PostgreSQL + Prisma. USDT stored as `NUMERIC(38,18)`, rupees as `NUMERIC(14,2)`. |
| Money math | `decimal.js` only. Half-up rounding to paise at each step (spec 7.1). |
| User sign-in | **Firebase Google sign-in.** The browser gets a Google ID token; the server checks it against Google's public keys and issues its own HTTP-only session cookie. No Firebase service-account key is stored. |
| Admin sign-in | Email + password + authenticator-app code (required). Each code works once. 5 wrong passwords = 15-minute lock. 30-minute idle timeout. |
| Blockchain | One shared `NetworkAdapter` interface (`src/server/networks`). Tron uses TronGrid (solidified data only). BSC uses `viem` with a backup provider, reading only up to the `finalized` block. |
| Background jobs | One worker process (`src/worker`) with an independent loop per network plus the expiry job. No Redis needed. |
| Files | Private S3 bucket (India region) in production, or a local private folder for testing. 5-minute signed links. |
| Email / SMS | Resend / MSG91, or `console` (saved to the admin Outbox) for testing. |

Key files:
- `src/server/money.ts`: payout formula and on-chain unit conversion
- `src/server/orders/stateMachine.ts`: allowed status moves (spec 6), enforced on the server
- `src/server/orders/quote.ts`: quotes, unique amounts, limits, expiry
- `src/server/matching.ts`: payment matching and automatic holds (spec 7.3, 8.2)
- `src/server/watcher.ts`: watcher pass, restart-safe cursors, outage alerts
- `src/server/deposit.ts`: protected deposit-address changes (spec 10.3)
- `prisma/migrations/*/migration.sql`: append-only triggers on history tables, and the unique-amount and TxID indexes

### Tests (115, all passing)
Every required test case in spec section 13 is covered in `tests/`: unique amounts, 100.02-vs-100.03 hold, duplicate TxID, fake token on both networks, the same amount open on both networks, BSC TxID on a Tron order, 6- vs 18-decimal conversion, one BSC transaction paying two orders, watcher restart mid-range, late payment, rate change after a quote, address change with open orders, the PAYMENT_CONFIRMED→PAID jump, and a wrong paid amount. There are also tests for every disallowed status move, append-only history, 2FA replay, admin lockout, Live-mode switch confirmation and a Tron outage not stopping BSC.

---

### Rate: manual or automatic
Admin → Settings → Rate. **Manual:** you type the rate; quotes stop if it isn't re-saved within 12 hours. **Auto:** the worker reads the live USDT/INR price every 2 minutes from CoinDCX, WazirX and CoinGecko, takes the price they agree on, and offers `market × (1 − your margin%)`, rounded down to the paisa. Tax and fee still apply after that. Safety guards:
- at least 2 sources must agree within 2%; a source that disagrees is ignored;
- the rate must stay between your floor and ceiling;
- a market move above your jump limit (default 3%) between two updates is refused until you press **Accept new market price** (needs your 2FA code);
- if the feed fails, the last rate stays but quotes stop after 30 minutes, and super admins get one email;
- every rate change is recorded in the settings history.

### Sign-in and onboarding: admin switches
Admin → Settings → **Sign-in & onboarding**. Every switch applies on the next page load for every user, including people halfway through; orders already placed are never changed.

| Switch | Notes |
|---|---|
| Google sign-in / Email and password | At least one stays on. Email can't be turned off while Firebase isn't configured. |
| Require a confirmed email | Unconfirmed users only see the "check your inbox" page. |
| Mobile number required | |
| KYC required | Can be turned off in **Test mode only**; Live can't be switched on while it's off. A declined KYC keeps blocking the user either way. |
| Approve KYC automatically | Approves after basic checks (PAN format, 18+, all four files). No document check exists yet, so each one lands in **KYC → Auto-approved, to check** for a person. |
| Approve bank/UPI when the name matches | Only against an approved KYC name. |
| Customer sending wallets | Off / Optional / Required. Required blocks new orders until a wallet is added, and holds payments sent from any other wallet. |

The rules live in one place, `src/server/onboarding.ts`, which the pages and the server-side order check both use.

## CI/CD (`.github/workflows`)

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push to `main` and every PR | lint, type check, tests against Postgres, production build |
| `docker.yml` | PRs, `main`, `v*` tags | builds the image, starts the compose stack, runs the browser walkthrough, then (not on PRs) pushes to `ghcr.io/thecoderas/crptrx` with `latest`, branch, sha and version tags |
| `deploy.yml` | after a green image build on `main`, or manually | SSH to a Docker host, copies `deploy/docker-compose.prod.yml`, pulls the image, restarts. Skips cleanly until configured. |

To turn on deploys: in GitHub → Settings → Environments, create `staging` (and `production`) with secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (optional `DEPLOY_PORT`) and variable `DEPLOY_PATH`. On the server, put a filled-in `.env` (from `.env.example`) in `DEPLOY_PATH`, and put HTTPS in front of port 3000.

---

## Going live checklist

- [ ] Owner answers the open questions below. The payout formula must be confirmed by the CA.
- [ ] `DEV_LOGIN_ENABLED=false`, `DEV_TOOLS_ENABLED=false`, `AUTO_GENERATE_SECRETS=false`. (Test sign-in, on-screen OTP and the simulator are also blocked automatically in Live mode.)
- [ ] Real `ENCRYPTION_KEY` from a secret store, backed up offline. Losing it makes PAN, account numbers and 2FA secrets unreadable.
- [ ] Firebase project: Google provider on, production domain added to *Authorized domains*.
- [ ] S3 bucket in `ap-south-1`: private, encryption on, public access blocked.
- [ ] Resend domain verified; MSG91 DLT-approved OTP template.
- [ ] Paid BSC provider with `finalized` support in `BSC_LIVE_RPC_URL` (plus a backup); `TRONGRID_API_KEY`.
- [ ] Managed Postgres with daily backups kept 30+ days, and **one test restore done** (spec 10.1).
- [ ] HTTPS in front of the app; `SECURE_COOKIES=true`; optionally the admin IP allow-list.
- [ ] Live deposit addresses set (1-hour delay), from wallets whose recovery phrase the company holds offline.
- [ ] Rate, fee, GST, limits, company details, FIU number and hold reasons set; lawyer's Terms and Privacy text in place.
- [ ] Switch to Live in Settings (requires typing `SWITCH TO LIVE` and a 2FA code).

---

## Decisions and deviations to review

1. **User sign-in: Google (Firebase) and/or email + password**, switchable by the admin. Email/password follows spec 4.1: 5 wrong tries = 15-minute lock, single-use hashed email links, forgot/reset, and sign-up that never reveals whether an email exists. If a password was set on an email that was never confirmed and the real owner later signs in with Google, that password is removed. Optional user 2FA is not built yet.
2. **No Redis/BullMQ.** A single worker with per-network loops, Postgres advisory locks and unique constraints is enough at R1 volume and has fewer moving parts. Run exactly one worker.
3. **Append-only history** is enforced with database triggers that reject UPDATE, DELETE and TRUNCATE, whatever the database user. Also giving the app its own non-owner database role is still recommended in production.
4. **A wrong amount without a TxID goes to Unmatched payments**, not an automatic hold, because it can't safely be tied to an order. With a TxID, it is matched and held (spec 7.3).
5. **Extra automatic hold reasons** beyond the spec: transaction failed on chain; TxID has no USDT payment to our address; payment made before the order was created. Each still needs an admin decision.
6. **Receipts show "INR"** instead of "₹", because the standard PDF fonts can't draw the rupee sign. An embedded font can fix this later.

## Not verified yet
- **Live reads from TronGrid Nile and BSC Testnet were not exercised from the build sandbox** (outbound access was blocked). The chain readers are covered by unit tests with recorded response shapes and a fake RPC client, and the full flow was tested with the simulator. The first real test should be one small real testnet transfer per network.
- The `apt-get install openssl` step in the Dockerfile couldn't run in the sandbox. The image was verified with an equivalent base image; CI builds the exact Dockerfile.

## Questions for the owner
Spec section 16 (all still open): app name/domain; CA confirmation of the tax/fee/GST formula; fee %; limits; business hours; hold reasons; company details and FIU number; legal text; ID data retention period; which wallet-check tool; who holds the BSC wallet recovery phrase; which BSC provider.

New ones from this build:
- Should automatic KYC approval be allowed in Live at all before a PAN/DigiLocker check provider is connected? It's allowed now, with a review-later queue.
- Confirm the test USDT token contracts for Nile and BSC Testnet (Settings → USDT token contracts).
- Monthly and platform-daily limits were not in the spec; placeholder values are 20,000 and 50,000 USDT.
- Where will it be hosted (AWS Mumbai VM, ECS, etc.)? The deploy workflow assumes a single Docker host over SSH.
