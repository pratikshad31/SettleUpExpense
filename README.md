# SettleUpExpenses — Full-Stack Shared Expense Management & Settlement Optimizer

[![Tests](https://img.shields.io/badge/Tests-152%20Passed-10b981.svg)]()
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Direct%20pg)-336791.svg)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%205-68a063.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208-61dafb.svg)]()
[![UPI](https://img.shields.io/badge/Payments-NPCI%20UPI%20Links%20%26%20QR-4f46e5.svg)]()

**SettleUpExpenses** is a full-stack shared-expense management and debt-settlement platform engineered for flatmates, friends, college groups, and travel groups in India.

The application computes and displays exactly **who owes whom**, maintains a mathematically verified **zero-sum net balance invariant** over **integer-paise** money, produces an **optimized settlement plan** with a deterministic **Greedy Min-Cash-Flow** algorithm bounded to at most $N - 1$ payments, and enforces a **role-gated settlement approval workflow** (`PENDING → MARKED_PAID → CONFIRMED / REJECTED`) with native **Indian UPI** deep links and QR codes.

---

## 🌟 Key Features & Implementation Highlights

### 1. Financial Precision — Integer Paise Everywhere
- All monetary values are calculated and stored as **integer paise** (₹1 = 100 paise) in PostgreSQL `BIGINT` columns — no floats ever touch the ledger.
- Input parsing rejects amounts with more than 2 decimal places; the server **recomputes every split itself** and verifies `Σ participant shares == expense total` before inserting — client-supplied totals are never trusted.
- **Zero-sum invariant**: $\sum \text{Net Balance} \equiv 0$ is computed on every balance read, returned as `netSumPaise`, and surfaced in the UI (*"Sum of group balances = ₹0.00 (Zero-Sum Invariant Verified)"*).

### 2. Six Split Engines with Deterministic Remainder Distribution
1. **Equal** — floor division; the leftover paises go one-by-one to the first participants sorted by user ID ascending.
2. **Exact Amounts** — explicit per-member paise allocations, rejected unless they sum exactly to the total.
3. **Percentage** — percentages must total 100% (±0.01% tolerance); floor the base and award leftover paises by largest fractional remainder (ties → lowest user ID).
4. **Shares / Weights** — proportional weighted shares (e.g. 3 shares vs 2 shares), same largest-remainder distribution.
5. **Adjustment** — equal base split plus signed per-member paise adjustments, with negative-final-share protection.
6. **Itemized** — line items assigned to specific members (split equally within an item), with shared tax/fees/delivery distributed proportionally to each member's item subtotal.

> **Note on UI coverage:** the expense form currently exposes **Equal, Exact, Percentage, and Itemized** split buttons. **Shares** and **Adjustment** are fully implemented in the API, schema (`split_type` CHECK), split engine, and seed data (the seeded Goa villa expense uses `shares` and the seafood dinner uses `adjustment`).

### 3. Multiple Payers & Subset Participants
- Expenses can be funded by **one or several payers** with independent contribution amounts — the UI has a *Single Payer / Multiple Payers* toggle with live "matched total" feedback; contributions must equal the expense total exactly.
- **Payers need not be participants**, and any valid subset of active group members can participate in an expense (the server rejects non-members as participants).

### 4. Who-Owes-Whom & Settlement Optimization (Dual Views)
- **Detailed Person-to-Person Debts** (`GET /api/groups/:id/debts`): deterministic proportional payer attribution (each payer funded `P_k / Total` of every participant's share), confirmed-settlement offset with direction reversal on overpayment, then bilateral netting so at most one direction survives per pair.
- **Optimized Settlement Plan** (`GET /api/groups/:id/balances`): deterministic Greedy Min-Cash-Flow — creditors sorted descending, debtors sorted descending (userId tie-break), repeatedly paying `min(|debt|, credit)` between the largest debtor and largest creditor. This collapses dense circular debts into **at most $N - 1$ payments** in $O(N \log N)$, and each suggestion ships with a ready-to-use UPI URI.

### 5. Role-Enforced Settlement State Machine
The `settlements` table enforces four statuses via a `CHECK` constraint: `pending`, `marked_paid`, `confirmed`, `rejected`.

- **Payer (debtor) only — "Record Payment"**: a settlement can only be created for your own debt (`from_user` must equal the requester, otherwise **403**), and it is **always stored as `pending`**.
- **Payer only — "Mark Paid"**: moves `pending → marked_paid` with a UPI reference/UTR; the payer can never confirm or reject their own payment (explicit **403**).
- **Receiver (creditor) only — "Confirm" / "Reject"**: only `to_user` may transition to `confirmed` or `rejected`; everyone else (including admins and third parties) sees **no action buttons at all**.
- **Strict balance-timing invariant**:
  - `pending` and `marked_paid` payments **do not** alter any balance.
  - `rejected` settlements **do not** alter any balance and cancel the request.
  - **Only `confirmed` settlements move money** — confirmation instantly recomputes net balances, the optimized plan, and the detailed debt graph.
- **Full audit trail**: every transition is written to `settlement_status_history` (previous → new status, actor, timestamp) plus the group `activity_logs`.
- **Concurrency safety**: all transitions run in a transaction behind `SELECT ... FOR UPDATE` row locks, so racing confirmations cannot double-apply.
- **Idempotency**: settlement routes accept `Idempotency-Key` headers; replays are served from a 24-hour response cache (`idempotency_records`) instead of re-executing.

### 6. Indian UPI Deep Links & QR Code Generator
- The backend validates VPAs against the standard `user@bankhandle` format and generates NPCI-compliant deep links: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
- Served through `GET /api/settlements/upi-details` (with a payer-safety disclaimer) and auto-attached to every optimized suggestion and recorded settlement.
- In-app **"Pay with UPI"** modal renders a scannable **QRCodeSVG** (via `qrcode.react`, 220 px, error-correction level M) for GPay / PhonePe / Paytm / BHIM, with a copyable VPA and an *"Open in UPI App"* button.
- Disclaimer shown to users: launching a UPI app or scanning the QR is **not** proof of payment — the recipient must verify and confirm inside SettleUp before balances update.

### 7. Governance, Audit Trails & Integrity
- **Group roles**: `owner` / `admin` / `member`. Adding members by email and changing roles require admin/owner privileges; every member can add expenses and settle their own debts.
- **Restricted Group Exit**: members cannot leave while their net balance is non-zero (whether they owe or are owed), with a specific error message showing the amount.
- **Owner continuity**: if the owner leaves after settling up, the next remaining active member is automatically promoted to owner; membership is set to `inactive` so financial history is preserved.
- **Soft-Voiding**: expenses are never deleted — voiding sets `is_voided = true` (creator, or any admin/owner) and balances immediately recompute without them.
- **Expense Versioning**: every edit snapshots the previous state into `expense_versions` together with an edit reason (the UI requires one) and surfaces the revision history in the expense details modal.
- **Activity Logs**: chronological per-group history of expense, settlement, membership, and group events (paginated, max 100 per page).
- **Invite Codes**: groups are protected by an auto-generated 8-character invite code (join by code, add by email, user search).

### 8. Account Security
- Strong password policy enforced server-side **and** mirrored live in the signup UI: minimum 8 characters, upper + lower case, a digit, a special character, and a blocklist of 22 common weak passwords — plus a real-time Weak/Medium/Strong meter.
- JWT bearer authentication (default expiry `7d`), bcrypt password hashing (cost 10), profile update and password-change endpoints.

---

## 🛠 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19.3, Vite 8.3, React Router 7, lucide-react icons, qrcode.react, plain `fetch` API client (no axios), hand-rolled CSS design system (custom properties, cards/modals/tabs/badges/toasts, responsive at 768px), ESLint 10 flat config |
| **Backend** | Node.js 22, Express 5.2, direct `pg` 8.23 driver (parameterized SQL, no ORM), bcryptjs, jsonwebtoken, express-rate-limit, cors, dotenv |
| **Database** | PostgreSQL — 12 tables, `BIGINT` paise columns, foreign keys, `CHECK` constraints, indexes, ACID transactions (`BEGIN … COMMIT / ROLLBACK`) |
| **Testing** | Node.js built-in test runner (`node --test`), Supertest for REST integration, Monte Carlo randomized invariant testing |

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) **v22 LTS** (developed and tested on v22.17)
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

Copy the template and edit `backend/.env`:

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
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

> Set all database variables in the environment. `DB_NAME` must match the database you created in step 2. `CORS_ORIGINS` is a comma-separated list of frontend origins allowed to call the API.

### 4. Configure the Frontend

```bash
cp frontend/.env.example frontend/.env
```

```env
VITE_API_URL=http://localhost:5000/api
```

> The Vite dev server also proxies `/api` → `http://localhost:5000`, so `VITE_API_URL=/api` works as well.

### 5. Migrate & Seed

From the project root:

```bash
# Create/update the schema (schema.sql, idempotent DDL)
npm run migrate

# Seed demo users, 2 groups, 7 expenses covering all 6 split methods,
# and settlements in every status (pending / marked_paid / confirmed / rejected)
npm run seed
```

### 6. Start the Servers

**Terminal 1 — Backend API** (http://localhost:5000):

```bash
npm run dev:backend     # nodemon; use `npm start` for plain node
```

**Terminal 2 — Frontend** (http://localhost:5173):

```bash
npm run dev:frontend
```

Verify the stack:

- `GET http://localhost:5000/api/health` → `{ status: "healthy" }`
- `GET http://localhost:5000/api/db-test` → confirms the PostgreSQL connection

### Root Scripts

| Command | Action |
|---|---|
| `npm start` | Start backend (production-style, `node server.js`) |
| `npm run dev:backend` / `npm run dev:frontend` | Dev servers with hot reload |
| `npm run migrate` / `npm run seed` | Database migration / demo data seeding |
| `npm test` | Backend **and** frontend test suites |
| `npm run test:unit` / `test:random` / `test:api` | Backend sub-suites |
| `npm run build:frontend` | Production frontend build |

---

## 🧪 Automated Test Suite — 152 Tests Passing

```bash
npm test        # root: runs backend (144) + frontend (8)
```

### Backend — 144 tests across 18 files

```bash
npm --prefix backend test
```

| Sub-suite | Command | Tests | Coverage |
|---|---|---|---|
| Unit | `npm --prefix backend run test:unit` | 48 | Money math, all 6 split engines, UPI URI generation, pairwise debts, min-cash-flow optimizer — **runs without a database** |
| Randomized | `npm --prefix backend run test:random` | 1 case → **100 Monte Carlo simulations** | Zero-sum and allocation invariants across 100 randomized multi-user groups — **runs without a database** |
| REST API | `npm --prefix backend run test:api` | 14 | End-to-end Supertest coverage of the live Express routes (requires PostgreSQL) |

**Database split:** 62 of the 144 tests are pure unit tests (8 files — money, splits, upi, debts, optimizer, password rules, error handler, randomized); the remaining **82 tests (10 files) require a reachable PostgreSQL** instance configured in `backend/.env`, because there is no mock layer — controllers are exercised against the real pool.

> ⚠️ **`npm test` re-seeds the database.** `api.test.js` and `balanceUpdateTiming.test.js` call the seeder, which starts with `TRUNCATE … RESTART IDENTITY CASCADE` and reloads the demo dataset. Point `DB_NAME` at a dedicated test database, or run `npm run seed` afterwards to restore demo data.

What the suite verifies:

- All **6 split engines** and their deterministic 1-paisa remainder distributions (including rejection of invalid allocations) — `splits.test.js` (22 cases).
- **Multi-payer** contributions, **subset participant** allocations, expense creation/edit/void versioning.
- **Zero-sum invariants** across 100 randomized simulations.
- The **settlement state machine**: payer-only creation/mark-paid, receiver-only confirmation/rejection, and rejection of self-confirmation attempts — `settlementController.test.js` (12 cases).
- **Balance update timing**: balances unchanged for `pending` / `marked_paid` / `rejected`, updated only on `confirmed`.
- Group authorization (`requireGroupMember` / `requireGroupAdmin` / `requireGroupOwner`), auth middleware, JWT flow, password policy, error handler, and `withTransaction` commit/rollback behavior.

### Frontend — 8 tests

```bash
npm --prefix frontend test
```

Unit tests for the formatting helpers (`formatINR`, `formatDate`, `formatDateTime`, `inrToPaise`) using Node's built-in test runner.

---

## 🔑 Demo Accounts (Pre-Seeded)

All seeded accounts use the password **`password123`**.

| Name | Email | Role in Demo Groups | UPI ID |
|---|---|---|---|
| **Aarav Sharma** | `aarav@example.com` | **Owner** of *Flat 402 Indiranagar*, **Admin** of *Goa Trip 2026* | `aarav@okhdfcbank` |
| **Priya Patel** | `priya@example.com` | **Admin** of *Flat 402*, **Owner** of *Goa Trip 2026* | `priya@okaxis` |
| **Rohan Iyer** | `rohan@example.com` | Member of both groups | `rohan@paytm` |
| **Ananya Gupta** | `ananya@example.com` | Member of both groups | `ananya@icici` |
| **Vikram Singh** | `vikram@example.com` | Member of *Goa Trip 2026* | `vikram@upi` |
| **Pratiksha Dogare** | `dongarepratiksha62@gmail.com` | Extra seeded account (no demo groups) | `pratiksha@upi` |
| **Pratiksha** | `pratiksha.d@ahduni.edu.in` | Extra seeded account (no demo groups) | `pratiksha@upi` |

**Demo groups & invite codes:** `Flat 402 Indiranagar` → invite code **FLAT402B**, `Goa Trip 2026` → invite code **GOA2026X**.

*Tip: the Login page has one-click demo buttons for Aarav, Priya, Rohan, and Vikram.*

The seed dataset includes 7 expenses covering **all 6 split methods** (including a multi-payer villa booking and a subset-only scuba trip) and settlements in **all four statuses**, so the pending/confirm/reject workflow can be exercised immediately.

---

## 📁 Project Directory Structure

```
SettleUpExpenses/
├── README.md                                   # This documentation
├── package.json                                # Root convenience scripts (migrate/seed/test/dev)
├── .env.example                                # Master environment template
├── docs/
│   ├── API_DOCUMENTATION.md                    # REST API reference
│   ├── DATABASE_SCHEMA.md                      # Schema, constraints, indexes & ERD
│   └── DEPLOYMENT.md                           # Production deployment guide
├── backend/
│   ├── package.json                            # API deps + test scripts
│   ├── .env / .env.example                     # Local configuration template
│   ├── server.js / app.js / db.js              # Thin delegates into src/
│   ├── index.js                                # Legacy float-based prototype (unused)
│   ├── src/
│   │   ├── server.js                           # Server bootstrap + graceful shutdown
│   │   ├── app.js                              # Express app, middleware, route mounting
│   │   ├── db/
│   │   │   └── index.js                        # pg.Pool, query(), withTransaction()
│   │   ├── database/
│   │   │   ├── schema.sql                      # Idempotent DDL (12 tables, paise BIGINT)
│   │   │   ├── migrate.js                      # Migration runner
│   │   │   └── seed.js                         # Indian demo data seeder
│   │   ├── utils/
│   │   │   ├── money.js                        # Integer paise ⇄ INR helpers
│   │   │   ├── splits.js                       # 6 split engines + dispatcher
│   │   │   ├── debts.js                        # Pairwise debt engine (attribution + netting)
│   │   │   ├── optimizer.js                    # Greedy Min-Cash-Flow settlement optimizer
│   │   │   ├── upi.js                          # VPA validation + NPCI UPI URI generator
│   │   │   └── password.js                     # Password policy + strength scoring
│   │   ├── middleware/
│   │   │   ├── auth.js                         # JWT bearer verification
│   │   │   ├── groupAuth.js                    # member / admin / owner authorizers
│   │   │   ├── rateLimiter.js                  # auth + general rate limiters
│   │   │   ├── idempotency.js                  # Idempotency-Key replay cache
│   │   │   └── errorHandler.js                 # Centralized HTTP error handler
│   │   ├── controllers/
│   │   │   ├── authController.js               # signup / login / profile / change password
│   │   │   ├── groupController.js              # groups, invites, members, roles, leave
│   │   │   ├── expenseController.js            # create / read / edit / void expenses
│   │   │   ├── settlementController.js         # settlement state machine + UPI details
│   │   │   ├── balanceController.js            # balances, optimized plan, detailed debts
│   │   │   └── activityController.js           # paginated activity log
│   │   └── routes/
│   │       ├── authRoutes.js                   # /api/auth/*
│   │       ├── groupRoutes.js                  # /api/groups/* (group-scoped)
│   │       ├── expenseRoutes.js                # /api/expenses/:id/*
│   │       ├── settlementRoutes.js             # /api/settlements/*
│   │       └── userRoutes.js                   # /api/users/search
│   └── tests/                                  # 18 test files → 144 tests
│       ├── money.test.js
│       ├── splits.test.js
│       ├── debts.test.js
│       ├── optimizer.test.js
│       ├── upi.test.js
│       ├── passwordRules.test.js
│       ├── randomizedFinancial.test.js
│       ├── api.test.js
│       ├── authController.test.js
│       ├── authMiddleware.test.js
│       ├── groupController.test.js
│       ├── groupAuth.test.js
│       ├── expenseController.test.js
│       ├── settlementController.test.js
│       ├── balanceAndActivityControllers.test.js
│       ├── balanceUpdateTiming.test.js
│       ├── db.test.js
│       └── errorHandler.test.js
└── frontend/
    ├── package.json
    ├── .env / .env.example                     # VITE_API_URL
    ├── index.html
    ├── vite.config.js                          # Port 5173 + /api proxy
    ├── eslint.config.js                        # ESLint flat config
    └── src/
        ├── main.jsx / App.jsx                  # Bootstrap + routes (Protected/PublicOnly)
        ├── index.css                           # 600-line custom CSS design system
        ├── api/client.js                       # fetch client (auth + Idempotency-Key)
        ├── context/AuthContext.jsx             # session restore via localStorage token
        ├── components/                         # Modal, ConfirmModal, Toast, Navbar,
        │                                       # ExpenseModal, RecordPaymentModal,
        │                                       # MarkPaidModal, UpiQrModal
        ├── pages/                              # Login, Signup, Dashboard,
        │                                       # GroupDetails (5 tabs), Profile
        └── utils/                              # formatters (+ tests), passwordStrength
```

---

## 🔒 Security & Reliability Architecture

- **Direct parameterized SQL** — no ORM, no string interpolation; complete protection against SQL injection.
- **ACID transactions** — every multi-table write (expense + payers + participants + items + version + activity log, settlement transitions, group creation) runs inside `BEGIN … COMMIT` with automatic `ROLLBACK` on failure.
- **Row-level locking** — `SELECT … FOR UPDATE` on settlement rows makes confirmation/rejection race-proof.
- **Idempotency guarantee** — `Idempotency-Key` headers (24 h TTL) prevent duplicate payment records and double updates on network retries.
- **Authentication & authorization** — JWT bearer tokens, bcrypt hashing, and middleware-level membership/role checks (`requireGroupMember`, `requireGroupAdmin`) on every group-scoped route.
- **Rate limiting** — 50 requests / 15 min on auth endpoints, 300 requests / min globally, with standard rate-limit headers.
- **Strong password policy** — enforced at signup and password change, with a 22-entry weak-password blocklist.
- **Financial balance protection** — members cannot leave a group until their net balance is exactly ₹0.00.
- **Immutable financial history** — expenses are soft-voided (never deleted), edits are versioned, and every settlement transition is logged.
- **Safe error handling** — unexpected server errors return a generic message; details are logged on the server.

---

## 📚 Additional Documentation

- [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) — REST endpoint reference
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — schema, constraints, indexes, ERD
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment guide

---

## 🔮 Future Improvements

- Surface the **Shares** and **Adjustment** split methods in the expense form (the API, schema, and engines already support them).
- Optional dark theme and richer responsive breakpoints for the design system.
- Component-level frontend tests (currently only utility helpers are covered).
- Real payment-rail integration (UPI Autopay / collect requests) in addition to deep links and QR codes.
