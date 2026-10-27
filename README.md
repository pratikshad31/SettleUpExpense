# SettleUpExpenses — Full-Stack Shared Expense Management & Settlement Optimizer

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-000000.svg)](https://settle-up-expense.vercel.app/)
[![Tests](https://img.shields.io/badge/Backend%20Tests-187%20Passing-10b981.svg)]()
[![E2E](https://img.shields.io/badge/E2E-Playwright-45ba4b.svg)]()
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Neon)-336791.svg)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%205-68a063.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208-61dafb.svg)]()
[![UPI](https://img.shields.io/badge/Payments-NPCI%20UPI%20Links%20%26%20QR-4f46e5.svg)]()

**SettleUpExpenses** is a full-stack shared-expense management and debt-settlement platform built for flatmates, friends, college groups, and travel groups in India.

It computes exactly **who owes whom**, maintains a **zero-sum net balance invariant** over **integer-paise** money, produces an **optimized settlement plan** with a deterministic **Greedy Min-Cash-Flow** algorithm (at most N − 1 payments), and enforces a **role-gated settlement approval workflow** (`pending → marked_paid → confirmed / rejected`) with native **Indian UPI** deep links and QR codes.

## 🌐 Live Deployment

| Tier | Platform | URL / Notes |
|---|---|---|
| **Frontend** | [Vercel](https://settleupexpense.onrender.com) | **https://settle-up-expense.vercel.app/** |
| **Backend API** | [Render](https://render.com) (Web Service) | `https://YOUR-RENDER-SERVICE.onrender.com` |
| **Database** | [Neon](https://neon.tech) (serverless PostgreSQL) | Connected via `DB_*` environment variables, SSL enabled in production |

> **Free-tier note:** the live demo runs on free/trial plans. The Render service may go to sleep when idle, so the **first request after inactivity can take several seconds** while it wakes up. Neon's free compute can also suspend when idle and resume on the next query.

```
Browser ──► Vercel (React SPA) ──HTTPS──► Render (Express API) ──SSL──► Neon (PostgreSQL)
```

---

## 🌟 Key Features & Implementation Highlights

### 1. Financial Precision — Integer Paise Everywhere
- All monetary values are calculated and stored as **integer paise** (₹1 = 100 paise) in PostgreSQL `BIGINT` columns — no floats ever touch the ledger.
- Input parsing rejects amounts with more than 2 decimal places and out-of-range paise values; the server **recomputes every split itself** and verifies `Σ participant shares == expense total` before inserting — client-supplied totals are never trusted.
- **Zero-sum invariant**: `Σ net balance ≡ 0` is computed on every balance read, returned as `netSumPaise`, and surfaced in the UI. The optimizer **throws** (rather than warns) if the invariant is ever violated.

### 2. Six Split Engines with Deterministic Remainder Distribution
1. **Equal** — floor division; leftover paise go one-by-one to the first participants sorted by user ID ascending.
2. **Exact Amounts** — explicit per-member paise allocations, rejected unless they sum exactly to the total.
3. **Percentage** — percentages must total 100% (±0.01% tolerance); floor the base and award leftover paise by largest fractional remainder (ties → lowest user ID).
4. **Shares / Weights** — proportional weighted shares (e.g. 3 shares vs 2 shares), same largest-remainder distribution.
5. **Adjustment** — equal base split plus signed per-member paise adjustments, with negative-final-share protection.
6. **Itemized** — line items assigned to specific members (split equally within an item), with shared tax/fees/delivery distributed proportionally to each member's item subtotal.

> **Note on UI coverage:** the expense form currently exposes **Equal, Exact, Percentage, and Itemized**. **Shares** and **Adjustment** are fully implemented in the API, schema (`split_type` CHECK), split engine, and seed data, but do not have buttons in the UI yet.

### 3. Multiple Payers & Subset Participants
- Expenses can be funded by **one or several payers** with independent contribution amounts — the UI has a *Single Payer / Multiple Payers* toggle with live "matched total" feedback; contributions must equal the expense total exactly.
- **Payers need not be participants**, and any valid subset of active group members can participate (the server rejects non-members).

### 4. Who-Owes-Whom & Settlement Optimization (Dual Views)
- **Detailed Person-to-Person Debts** (`GET /api/groups/:id/debts`): deterministic proportional payer attribution, confirmed-settlement offset with direction reversal on overpayment, then bilateral netting so at most one direction survives per pair.
- **Optimized Settlement Plan** (`GET /api/groups/:id/balances`): Greedy Min-Cash-Flow — repeatedly pays `min(|debt|, credit)` between the largest debtor and largest creditor, collapsing circular debts into **at most N − 1 payments** in O(N log N). Each suggestion ships with a ready-to-use UPI URI.
- The detailed-debt net and the balance net are cross-checked by a seeded randomized test (6,000 multi-payer expenses).

### 5. Role-Enforced Settlement State Machine
Statuses (enforced by a DB `CHECK` constraint): `pending`, `marked_paid`, `confirmed`, `rejected`.

- **Payer (debtor) only — "Record Payment"**: `from_user` must equal the requester (otherwise **403**); always stored as `pending`.
- **Settlement amount is capped at the actual net debt** between the two parties (pending settlements are subtracted from the available debt; opposite-direction debts are netted first). One paisa above the debt is rejected, and concurrent creates are serialized so their combined amount cannot exceed it.
- **Payer only — "Mark Paid"**: `pending → marked_paid` with a UPI reference/UTR; the payer can never confirm or reject their own payment.
- **Receiver (creditor) only — "Confirm" / "Reject"**: only `to_user` may move a settlement to `confirmed` or `rejected`; admins and third parties see no action buttons.
- **Strict balance-timing invariant**: `pending`, `marked_paid`, and `rejected` never change balances. **Only `confirmed` settlements move money.**
- **Full audit trail**: every transition is written to `settlement_status_history` plus the group `activity_logs`.
- **Concurrency safety**: transitions run in a transaction behind `SELECT … FOR UPDATE` row locks.
- **Idempotency**: `Idempotency-Key` is supported on expense creation and all settlement mutation routes. Keys are **scoped per user + route** and bound to a request hash — replaying the same key with a different body returns **422**, concurrent duplicates create exactly one record, and a 5xx releases the reservation so a corrected retry can run. Responses are cached for 24 hours in `idempotency_records`.

### 6. Indian UPI Deep Links & QR Code Generator
- The backend validates VPAs (`user@bankhandle`) and generates NPCI-compliant deep links: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
- Served through `GET /api/settlements/upi-details` (with a payer-safety disclaimer) and auto-attached to every optimized suggestion and recorded settlement.
- In-app **"Pay with UPI"** modal renders a scannable QR (`qrcode.react`, 220 px, error-correction level M) for GPay / PhonePe / Paytm / BHIM, with a copyable VPA and an *Open in UPI App* button.
- Launching a UPI app or scanning the QR is **not** proof of payment — the recipient must confirm inside SettleUp before balances update.
- UPI lookups are privacy-gated: you can only look up or search users who share an active group with you.

### 7. Governance, Audit Trails & Integrity
- **Group roles**: `owner` / `admin` / `member`. Adding members by email and changing roles require admin/owner privileges; every member can add expenses and settle their own debts.
- **Restricted Group Exit**: members cannot leave while their net balance is non-zero, **or** while they are a payer/receiver on a `pending` or `marked_paid` settlement. Leaving is serialized against settlement creation and rolls back fully if any step fails.
- **Owner continuity**: if the owner leaves, the earliest-joined remaining active member is promoted; membership is set to `inactive` so financial history is preserved.
- **Soft-Voiding**: expenses are never deleted — voiding sets `is_voided = true` and balances recompute immediately.
- **Expense Versioning + Optimistic Locking**: every edit snapshots the previous state into `expense_versions` with a required edit reason. Edits must include the current `version`; stale or simultaneous edits get **409 Conflict**.
- **Activity Logs**: chronological per-group history (paginated, max 100 per page).
- **Invite Codes**: groups have an auto-generated 8-character invite code (join by code, add by email, user search).

### 8. Account Security
- Server-side password policy mirrored live in the signup UI: min 8 chars, upper + lower case, digit, special character, blocklist of 22 common weak passwords, and a Weak/Medium/Strong meter.
- JWT bearer authentication (default expiry `7d`), bcrypt hashing (cost 10), profile update and password-change endpoints.
- **Login timing protection**: unknown emails still run one bcrypt comparison against a dummy hash and return the same 401 as a wrong password, so accounts can't be enumerated by response or timing.
- Tokens with `alg: none` or a tampered signature are rejected (covered by tests).

> **Known limitation:** the "Forgot Password?" dialog on the login page is a UI placeholder only — there is no backend reset flow or email delivery yet. Logged-in users can change their password from **Profile Settings**.

---

## 🛠 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, React Router 7, lucide-react, qrcode.react, plain `fetch` API client (no axios), hand-written CSS design system, ESLint 10 flat config |
| **Backend** | Node.js 22, Express 5, direct `pg` driver (parameterized SQL, no ORM), bcryptjs, jsonwebtoken, **helmet**, cors, express-rate-limit, dotenv |
| **Database** | PostgreSQL — 12 tables, `BIGINT` paise columns, foreign keys, `CHECK` constraints, indexes, ACID transactions |
| **Testing** | Node built-in test runner (`node --test`), Supertest (REST integration), randomized/Monte Carlo invariant tests, **Playwright** (browser E2E) |
| **Hosting** | Vercel (frontend) · Render (API) · Neon (PostgreSQL) |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) **v22 LTS**
- [PostgreSQL](https://www.postgresql.org/) v14+ running locally or remotely

### 1. Install Dependencies
```bash
npm --prefix backend install
npm --prefix frontend install
```
> The root `package.json` only wires convenience scripts — no root install is required.

### 2. Create the Database
```sql
CREATE DATABASE settleup_expenses;
```

### 3. Configure the Backend
```bash
cp backend/.env.example backend/.env
```
```env
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=settleup_expenses
PORT=5000
JWT_SECRET=your_super_secret_jwt_key_at_least_32_chars
JWT_EXPIRES_IN=7d
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Important behaviour (the server **refuses to start** otherwise):
- `JWT_SECRET` is required and must be **at least 32 characters**.
- All five `DB_*` variables are required (there is **no** `DATABASE_URL` support and no fallback database name).
- `CORS_ORIGINS` must list explicit origins, comma-separated. A wildcard `*` is rejected.
- With `NODE_ENV=production`, the database connection uses SSL with certificate verification.

### 4. Configure the Frontend
```bash
cp frontend/.env.example frontend/.env
```
```env
VITE_API_URL=http://localhost:5000/api
```
> The Vite dev server also proxies `/api` → `http://localhost:5000`, so `VITE_API_URL=/api` works locally too.

### 5. Migrate & Seed
```bash
npm run migrate   # schema.sql + migrations/001_idempotency_scope.sql (idempotent)
npm run seed      # demo users, 2 groups, 7 expenses, settlements in every status
```

> ⚠️ **`npm run seed` begins with `TRUNCATE … RESTART IDENTITY CASCADE`** — it wipes every table. Never run it against a database holding data you want to keep (including your Neon database).

### 6. Start the Servers
```bash
npm run dev:backend     # http://localhost:5000  (nodemon; `npm start` for plain node)
npm run dev:frontend    # http://localhost:5173
```
Verify: `GET /api/health` → `{ "status": "healthy" }` and `GET /api/db-test` → confirms the PostgreSQL connection.

### Root Scripts

| Command | Action |
|---|---|
| `npm start` | Start backend (`node server.js`) |
| `npm run dev:backend` / `npm run dev:frontend` | Dev servers with hot reload |
| `npm run migrate` / `npm run seed` | Database migration / demo data seeding |
| `npm test` | Backend **and** frontend unit test suites |
| `npm run test:unit` / `test:random` / `test:api` | Backend sub-suites |
| `npm run test:frontend` | Frontend unit tests |
| `npm run build:frontend` | Production frontend build |

Playwright E2E tests run from the frontend folder: `npm --prefix frontend run test:e2e` (see [`frontend/e2e/README.md`](frontend/e2e/README.md)).

---

## ☁️ Deployment (Vercel + Render + Neon)

The production deployment uses three free/trial-tier services. Deploy in this order: **database → backend → frontend**, then come back and allow the frontend origin in the backend's CORS settings.

### 1. Database — Neon
1. Create a Neon project and database.
2. From the Neon connection details, copy the **host, user, password, and database name**. The backend reads **separate variables** (`DB_HOST`, `DB_USER`, …) rather than a single connection string, so split the Neon URL into these fields. Port is `5432`.
3. Run the migration once from your machine, with `backend/.env` temporarily pointing at Neon:
   ```bash
   npm run migrate
   ```
4. Seed demo data **only if you want demo accounts on the live site**, and only on a fresh database (`npm run seed` truncates all tables).

### 2. Backend — Render (Web Service)
| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:
```env
NODE_ENV=production
DB_HOST=<neon host>
DB_PORT=5432
DB_USER=<neon user>
DB_PASSWORD=<neon password>
DB_NAME=<neon database name>
JWT_SECRET=<random string, 32+ characters>
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://settle-up-expense.vercel.app
```
- Render supplies `PORT` automatically; the app reads it.
- `CORS_ORIGINS` **must** contain the exact Vercel URL (no trailing slash), otherwise the browser blocks every API call. Add `http://localhost:5173` as well if you also develop against the hosted API.
- `app.set('trust proxy', 1)` is enabled so rate limiting sees the real client IP behind Render's proxy.

### 3. Frontend — Vercel
| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

Environment variable:
```env
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
```
- `VITE_API_URL` is baked in at **build time** — redeploy the frontend after changing it.
- [`frontend/vercel.json`](frontend/vercel.json) rewrites all paths to `index.html` so client-side routes (`/dashboard`, `/groups/:id`) survive a page refresh.

### Post-deploy checklist
- [ ] `https://YOUR-RENDER-SERVICE.onrender.com/api/health` returns `{ "status": "healthy" }`
- [ ] `https://YOUR-RENDER-SERVICE.onrender.com/api/db-test` confirms the Neon connection
- [ ] Sign up and log in on https://settle-up-expense.vercel.app/
- [ ] Create a group, add an expense, and run a settlement end to end

---

## 🧪 Automated Test Suite

```bash
npm test                              # backend (187) + frontend unit (8)
npm --prefix backend test             # backend only
npm --prefix frontend run test:e2e    # Playwright browser tests (37)
```

| Suite | Count | Notes |
|---|---|---|
| **Backend** | **187 tests across 27 files** | Run serially (`--test-concurrency=1`) with `tests/setup.js` preloaded |
| **Frontend unit** | 8 tests | `formatINR`, `formatDate`, `formatDateTime`, `inrToPaise` |
| **Playwright E2E** | 37 tests across 4 spec files | Auth/groups, expense flows, settlement/leave/profile, login |

Backend sub-suites:

| Command | What it runs |
|---|---|
| `npm --prefix backend run test:unit` | 6 database-free files: money, splits, validators, UPI, debts, optimizer |
| `npm --prefix backend run test:random` | Seeded randomized financial invariants (zero-sum, detailed-debt vs. balance agreement) |
| `npm --prefix backend run test:api` | End-to-end Supertest coverage of the Express routes (requires PostgreSQL) |

Most remaining backend tests exercise real controllers against a real PostgreSQL pool (there is no mock layer), so a reachable database configured in `backend/.env` is required for `npm test`.

> ⚠️ **`npm test` re-seeds and truncates the database** (`api.test.js` and `balanceUpdateTiming.test.js` call the seeder). **Never run it with `backend/.env` pointing at Neon/production.** Use a dedicated local test database.

Areas covered include: all six split engines and remainder rules, multi-payer and subset-participant expenses, expense versioning and 409 conflicts, the settlement state machine and balance-update timing, settlement limits and concurrency, idempotency (concurrent keys, per-user scoping, body-mismatch 422), group leave rules, user-search privacy, JWT edge cases (`alg: none`, tampering), password policy, malformed-request handling, config/secret validation, and security headers/CORS.

---

## 🔑 Demo Accounts (Seeded by `npm run seed`)

All seeded accounts use the password **`password123`** (accepted at login, but intentionally on the signup blocklist).

| Name | Email | Role in Demo Groups | UPI ID |
|---|---|---|---|
| **Aarav Sharma** | `aarav@example.com` | **Owner** of *Flat 402 Indiranagar*, **Admin** of *Goa Trip 2026* | `aarav@okhdfcbank` |
| **Priya Patel** | `priya@example.com` | **Admin** of *Flat 402*, **Owner** of *Goa Trip 2026* | `priya@okaxis` |
| **Rohan Iyer** | `rohan@example.com` | Member of both groups | `rohan@paytm` |
| **Ananya Gupta** | `ananya@example.com` | Member of both groups | `ananya@icici` |
| **Vikram Singh** | `vikram@example.com` | Member of *Goa Trip 2026* | `vikram@upi` |

**Demo groups & invite codes:** `Flat 402 Indiranagar` → **FLAT402B**, `Goa Trip 2026` → **GOA2026X**.

The Login page has one-click demo buttons for Aarav, Priya, Rohan, and Vikram. The seed data includes 7 expenses covering **all 6 split methods** (including a multi-payer villa booking and a subset-only trip) and settlements in **all four statuses**.

An optional script, `backend/scripts/seed-demo.js`, rebuilds only a small **"Goa Trip"** group (users `alice@`, `bob@`, `carol@example.com`, password `Demo@12345`) without truncating other data. Run it with `node backend/scripts/seed-demo.js`.

---

## 📁 Project Directory Structure

```
SettleUpExpense/
├── README.md
├── package.json                      # Root convenience scripts
├── .env.example                      # Master environment template
├── AGENTS.md                         # Project rules for AI coding agents
├── CHANGELOG_REVIEW.md               # Code-review findings → fix → commit → test
├── docs/
│   ├── API_DOCUMENTATION.md          # REST API reference
│   ├── DATABASE_SCHEMA.md            # Schema, constraints, indexes & ERD
│   └── DEPLOYMENT.md                 # Production deployment guide
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── server.js / app.js / db.js    # Thin delegates into src/
│   ├── scripts/
│   │   └── seed-demo.js              # Non-destructive "Goa Trip" demo group
│   ├── src/
│   │   ├── server.js                 # Bootstrap + graceful shutdown
│   │   ├── app.js                    # Express app, helmet, CORS, body guards, routes
│   │   ├── config.js                 # JWT_SECRET validation (fails fast)
│   │   ├── db/index.js               # pg.Pool (SSL in production), query(), withTransaction()
│   │   ├── database/
│   │   │   ├── schema.sql            # Idempotent DDL (12 tables)
│   │   │   ├── migrate.js            # Migration runner
│   │   │   ├── migrations/
│   │   │   │   └── 001_idempotency_scope.sql
│   │   │   └── seed.js               # Indian demo data seeder (TRUNCATES first)
│   │   ├── utils/                    # money, splits, debts, optimizer, groupBalances,
│   │   │                             # upi, password, validators
│   │   ├── middleware/               # auth, groupAuth, rateLimiter, idempotency, errorHandler
│   │   ├── controllers/              # auth, group, expense, settlement, balance, activity
│   │   └── routes/                   # auth, group, expense, settlement, user
│   └── tests/                        # 27 test files → 187 tests
└── frontend/
    ├── package.json
    ├── vercel.json                   # SPA rewrite for Vercel
    ├── vite.config.js                # Port 5173 + /api proxy
    ├── playwright.config.js
    ├── eslint.config.js
    ├── e2e/                          # Playwright specs + helpers
    └── src/
        ├── main.jsx / App.jsx        # Bootstrap + routes (Protected / PublicOnly)
        ├── index.css                 # Custom CSS design system
        ├── api/client.js             # fetch client (JWT + Idempotency-Key)
        ├── context/                  # AuthContext, authState
        ├── components/               # Modal, ConfirmModal, Toast, Navbar, ExpenseModal,
        │                             # RecordPaymentModal, MarkPaidModal, UpiQrModal
        ├── pages/                    # Login, Signup, Dashboard, GroupDetails (5 tabs), Profile
        └── utils/                    # formatters (+ tests), passwordStrength
```

---

## 🔒 Security & Reliability Architecture

- **Parameterized SQL only** — no ORM, no string interpolation.
- **ACID transactions** — every multi-table write runs in `BEGIN … COMMIT` with automatic `ROLLBACK`.
- **Row-level locking** — `SELECT … FOR UPDATE` makes settlement transitions race-proof.
- **Idempotency** — per-user, per-route keys with request-hash verification (see Feature 5).
- **Authentication & authorization** — JWT bearer tokens, bcrypt hashing, and `requireGroupMember` / `requireGroupAdmin` checks on group-scoped routes; the server will not boot without a 32+ character `JWT_SECRET`.
- **HTTP hardening** — `helmet` security headers; CORS restricted to an explicit allow-list (wildcard rejected at startup).
- **Request guards** — 100 KB JSON body limit; request bodies must be JSON objects; null bytes anywhere in the body are rejected; malformed input returns clean 4xx errors.
- **Rate limiting** — 50 requests / 15 min on signup & login, 300 requests / min globally.
- **Privacy** — user search and UPI lookup are limited to people who share an active group with you.
- **Financial protection** — settlements are capped at the real net debt; members can't leave with an unsettled balance or in-flight settlements.
- **Immutable financial history** — soft-voided expenses, versioned edits, and a logged settlement status history.
- **Safe error handling** — unexpected server errors return a generic message (even in development); details stay in server logs.
- **Transport security** — production database connections use SSL with certificate verification.
- **Dependency hygiene** — `npm audit` reported 0 vulnerabilities for backend and frontend at the last review.

---

## 📚 Additional Documentation

- [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) — REST endpoint reference
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — schema, constraints, indexes, ERD
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment guide
- [`CHANGELOG_REVIEW.md`](CHANGELOG_REVIEW.md) — security/correctness review findings and the tests covering each fix

---

## 🔮 Future Improvements

- Surface the **Shares** and **Adjustment** split methods in the expense form (API, schema, and engines already support them).
- Implement a real **password-reset flow** (the current dialog is a placeholder).
- Component-level frontend tests (currently only utility helpers have unit tests, plus Playwright E2E).
- Optional dark theme and richer responsive breakpoints.
- Real payment-rail integration (UPI Autopay / collect requests) beyond deep links and QR codes.
- A paid Render tier or an uptime ping to avoid cold starts on the live demo.
