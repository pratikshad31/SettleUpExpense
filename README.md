# SettleUpExpenses — Full-Stack Shared Expense Management & Settlement Optimizer

[![Tests](https://img.shields.io/badge/Tests-133%20Passed-10b981.svg)]()
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Direct%20pg)-336791.svg)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%205-68a063.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208-61dafb.svg)]()
[![UPI](https://img.shields.io/badge/Payments-NPCI%20UPI%20Links%20%26%20QR-4f46e5.svg)]()

**SettleUpExpenses** is a full-stack shared-expense management and debt-settlement platform engineered specifically for flatmates, friends, college groups, and travel groups.

The application calculates and displays exactly **who owes whom**, maintains a mathematically verified **zero-sum net balance invariant**, computes an **optimized settlement plan** using a Greedy Min-Cash-Flow algorithm bounding payments to at most $N - 1$ transactions, and enforces a **role-based settlement approval workflow** with native **Indian UPI** payment integration.

---

## 🌟 Key Features & Implementation Highlights

### 1. Financial Precision & Integer Paise
- All monetary operations are calculated and stored as **integer paise** (1 INR = 100 Paise) using PostgreSQL `BIGINT`.
- Eliminates IEEE 754 binary floating-point drift (e.g. ₹100 split 3 ways has zero lost pennies).
- Server strictly recalculates and validates all amounts; client totals are never trusted.
- Zero-sum invariant: $\sum \text{Net Balance} \equiv 0$ is guaranteed at all times.

### 2. Six Complete Split Methods with Fair Remainder Distribution
1. **Equal Split**: Even division among selected members with deterministic 1-paisa remainder allocation.
2. **Exact Amounts**: Explicit rupee allocations validated against total cost.
3. **Percentage Split**: Custom percentages summing to 100%, fractional remainders distributed by largest decimal component.
4. **Shares / Weights**: Proportional units (e.g. 3:2:1 ratio), remainders distributed deterministically.
5. **Adjustments**: Equal split base plus individual positive/negative adjustments (e.g. beverage surcharges).
6. **Itemized Split**: Item-level breakdown assigned to specific members + shared taxes/fees distributed proportionally.

### 3. Multiple Payers & Subset Participants
- Expenses can be funded by **one or multiple payers** with independent contribution amounts.
- Payers can differ from participants.
- Any valid subset of group members can participate in an expense.

### 4. Who-Owes-Whom & Settlement Optimization (Dual Views)
- **Detailed Person-to-Person Debts**: Computed via deterministic proportional payer attribution followed by bilateral reciprocal debt netting.
- **Optimized Settlement Plan**: Deterministic Greedy Min-Cash-Flow algorithm that transforms dense $O(N^2)$ circular debts into at most $N - 1$ simplified payments.

### 5. Role-Enforced Settlement & Verification State Machine
- **Role-Based Action Buttons**:
  - **Debtor (Payer) Only**: Only the person who owes the money sees and can click "Record Payment" / "Settle". Non-debtors cannot settle someone else's debt (action buttons hidden completely).
  - **Status is Strictly `PENDING` on Creation**: When a payment is recorded, it enters `pending` status.
  - **Creditor (Receiver) Only**: Only the recipient of the payment sees and can click `[Confirm]` or `[Reject]`. The payer or other third parties cannot confirm or reject someone else's receipt.
  - **Strict Balance Timing Invariant**:
    - `PENDING` payments **do NOT** alter any balances.
    - `REJECTED` settlements **do NOT** alter any balances and cancel the pending request.
    - **Only `CONFIRMED` settlements update payer and receiver net balances**, immediately triggering a real-time recalculation of the Min-Cash-Flow optimized plan and detailed debt graph.
- **Concurrency Safety**: Uses PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) in transactions to prevent duplicate or racing confirmations.
- **Idempotency Protection**: Client-supplied `Idempotency-Key` headers prevent double submission.

### 6. Indian UPI Deep Links & QR Code Generator
- Generates safe, NPCI-compliant deep links: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
- In-app **UPI QR Code** modal (`qrcode.react`) for instant mobile camera scanning.
- Includes payer safety disclaimers clarifying that initiating UPI requires recipient confirmation before the ledger updates.

### 7. Governance, Audit Trails & Integrity
- **Restricted Group Exit**: Members are blocked from leaving a group if their net balance is non-zero (all debts must be settled first).
- **Soft-Voiding Audits**: Expenses are never permanently deleted; voiding sets `is_voided = true` and restores balances with full audit history.
- **Activity Logs**: Chronological log of group events, expense actions, and settlement state transitions.
- **Unique Invite Codes**: Group access controlled via 8-character alphanumeric invite codes.

---

## 🛠 Technology Stack

- **Frontend**: React 19, Vite 8, React Router 7, Lucide Icons, QRCode.react, Custom CSS Design System (mobile-responsive, dark/light accents, modals, tabs).
- **Backend**: Node.js 22, Express.js 5, direct `pg` driver (parameterized SQL, no ORM), bcryptjs, jsonwebtoken, express-rate-limit.
- **Database**: PostgreSQL with parameterized queries, relational integrity, transactions (`BEGIN ... COMMIT / ROLLBACK`), and foreign keys.
- **Testing**: Node.js native test runner (`node --test`), Supertest for REST API testing, and Monte Carlo randomized invariant property testing (100 simulations).

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (v22 recommended)
- [PostgreSQL](https://www.postgresql.org/) v14+ running locally or remotely

### 1. Database Configuration
Ensure PostgreSQL is running and create the database:
```sql
CREATE DATABASE splitwise_app;
```

Configure `backend/.env` (a template is available at `backend/.env.example`):
```env
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=splitwise_app
PORT=5000
JWT_SECRET=settleup_super_secret_jwt_key_2026_dev_india
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

Configure `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

### 2. Run Database Migration & Seeding
From the project root:
```bash
# Run schema migrations
npm --prefix backend run migrate

# Seed rich sample dataset (users, groups, all 6 split methods, settlements)
npm --prefix backend run seed
```

### 3. Start Backend & Frontend Servers

#### Terminal 1 — Backend API:
```bash
cd backend
npm start
# Server starts at http://localhost:5000
```

#### Terminal 2 — Frontend Application:
```bash
cd frontend
npm run dev
# Frontend runs at http://localhost:5173
```

---

## 🧪 Automated Test Suite (133 Tests Passing)

Run the full automated test suite covering unit math, split engines, role-based workflows, balance timing, API integration, and Monte Carlo randomized simulations:

```bash
npm --prefix backend test
```

### Specialized Test Suites:
```bash
# Unit tests: 6 split methods, optimizer, and debts policy
npm --prefix backend run test:unit

# 100 Monte Carlo randomized financial invariant tests
npm --prefix backend run test:random

# End-to-end REST API integration tests
npm --prefix backend run test:api

# Targeted balance timing & settlement lifecycle test
node --test backend/tests/balanceUpdateTiming.test.js
```

**All 133 test cases pass with zero failures**:
- All 6 split engines & deterministic remainder distributions.
- Multi-payer contributions & subset participant allocations.
- Zero-sum invariants across 100 random multi-user simulations.
- Concurrency-safe settlement state machine with receiver confirmation authorization.
- Balance update timing verification (unchanged on `PENDING` / `REJECTED`, updated on `CONFIRMED`).
- Unauthorized access controls & balance-protected group departure.

---

## 🔑 Demo Accounts (Pre-Seeded)

All demo accounts have password: `password123`

| Name | Email | Role in Demo Groups | UPI ID |
|---|---|---|---|
| **Aarav Sharma** | `aarav@example.com` | Flat Owner, Goa Admin | `aarav@okhdfcbank` |
| **Priya Patel** | `priya@example.com` | Flat Admin, Goa Owner | `priya@okaxis` |
| **Rohan Iyer** | `rohan@example.com` | Member | `rohan@paytm` |
| **Ananya Gupta** | `ananya@example.com` | Member | `ananya@icici` |
| **Vikram Singh** | `vikram@example.com` | Goa Trip Member | `vikram@upi` |

*Tip: The Login page includes one-click buttons to instantly log in as any demo user.*

---

## 📁 Project Directory Structure

```
SettleUpExpenses/
├── README.md                                  # Primary project documentation
├── SettleUpExpenses_Project_Documentation.pdf # Standalone project & architecture PDF
├── package.json                               # Root workspace scripts
├── .env.example                               # Master environment template
├── docs/
│   ├── API_DOCUMENTATION.md                   # Comprehensive REST API reference
│   ├── DATABASE_SCHEMA.md                     # Schema, constraints, indexes & ERD
│   └── DEPLOYMENT.md                          # Production multi-tier deployment guide
├── backend/
│   ├── package.json
│   ├── .env                                   # Local backend configuration
│   ├── server.js                              # Server listener (Port 5000)
│   ├── app.js                                 # Express application setup
│   ├── src/
│   │   ├── db/
│   │   │   └── index.js                       # pg.Pool connection & transaction wrapper
│   │   ├── database/
│   │   │   ├── schema.sql                     # Idempotent DDL schema
│   │   │   ├── migrate.js                     # Migration executor
│   │   │   └── seed.js                        # Indian demo data seeder
│   │   ├── utils/
│   │   │   ├── money.js                       # Integer paise <-> INR utilities
│   │   │   ├── splits.js                      # 6 split calculation algorithms
│   │   │   ├── debts.js                       # Deterministic pairwise debt engine
│   │   │   ├── optimizer.js                   # Greedy Min-Cash-Flow settlement optimizer
│   │   │   └── upi.js                         # NPCI compliant UPI URI generator
│   │   ├── middleware/
│   │   │   ├── auth.js                        # JWT bearer token verification
│   │   │   ├── groupAuth.js                   # Role & membership authorizers
│   │   │   ├── rateLimiter.js                 # Express brute-force limiter
│   │   │   ├── idempotency.js                 # Request idempotency caching
│   │   │   └── errorHandler.js                # Centralized HTTP error handler
│   │   ├── controllers/                       # Auth, Group, Expense, Settlement, Balance controllers
│   │   └── routes/                            # Express API routes
│   └── tests/
│       ├── balanceUpdateTiming.test.js        # Strict balance update timing tests
│       ├── settlementController.test.js       # Settlement role authorization tests
│       ├── splits.test.js                     # 6 split methods unit tests
│       ├── optimizer.test.js                  # Min-Cash-Flow algorithm tests
│       ├── debts.test.js                      # Pairwise debts calculation tests
│       ├── api.test.js                        # End-to-end REST API integration tests
│       └── randomizedFinancial.test.js        # 100 Monte Carlo invariant simulations
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── api/                               # Fetch client with auth headers
        ├── context/                           # React AuthContext
        ├── components/                        # Modals, Navbar, Toast, ExpenseModal, UpiQrModal
        ├── pages/                             # Login, Signup, Dashboard, GroupDetails, Profile
        ├── utils/                             # Formatting & currency helpers
        └── index.css                          # Custom responsive CSS design system
```

---

## 🔒 Security & Reliability Architecture

- **Direct Parameterized SQL**: Zero ORM overhead; complete protection against SQL injection.
- **ACID Transactions (`BEGIN ... COMMIT / ROLLBACK`)**: All multi-table updates (expenses, splits, settlements, group creations) run in database transactions.
- **Concurrency Protection**: Row-level locking (`SELECT ... FOR UPDATE`) guarantees race-condition immunity during settlement state transitions.
- **Idempotency Guarantee**: `Idempotency-Key` headers prevent duplicate payment records or double updates on network retries.
- **Financial Balance Protection**: Members cannot leave a group until their net balance is exactly ₹0.00.
