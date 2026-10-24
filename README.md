# SettleUpExpenses — Full-Stack Shared Expense Management & Settlement Optimizer

[![Tests](https://img.shields.io/badge/Tests-37%20Passed-10b981.svg)]()
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Direct%20pg)-336791.svg)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-68a063.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb.svg)]()
[![UPI](https://img.shields.io/badge/Payments-NPCI%20UPI%20Links%20%26%20QR-4f46e5.svg)]()

**SettleUpExpenses** is a full-stack shared-expense management and debt-settlement platform engineered specifically for flatmates, friends, college groups, and travel groups in India.

The application calculates and displays exactly **who owes whom**, maintains a **zero-sum net balance invariant**, and computes an **optimized settlement plan** using a Greedy Min-Cash-Flow algorithm that bounds payments to at most $N - 1$ transactions.

---

## 🌟 Key Features

### 1. Financial Precision & Integer Paise
- All monetary operations are calculated and stored as **integer paise** (1 INR = 100 Paise) using PostgreSQL `BIGINT`.
- Eliminates IEEE 754 binary floating-point drift.
- Server strictly recalculates and validates all amounts; client totals are never trusted.

### 2. Six Complete Split Methods with Fair Remainder Distribution
1. **Equal Split**: Even division among selected members with deterministic 1-paisa remainder allocation.
2. **Exact Amounts**: Explicit rupee allocations validated against total cost.
3. **Percentage Split**: Custom percentages summing to 100%, rounding remainders distributed by largest fractional part.
4. **Shares / Weights**: Proportional units (e.g. 3:2:1 ratio), remainders distributed deterministically.
5. **Adjustments**: Equal split base plus individual positive/negative adjustments (e.g. beverage surcharges).
6. **Itemized Split**: Item-level breakdown assigned to specific members + shared taxes/fees distributed proportionally.

### 3. Multiple Payers & Subset Participants
- Expenses can be funded by **one or multiple payers** with independent contribution amounts.
- Payers can differ from participants.
- Any valid subset of group members can participate in an expense.

### 4. Who-Owes-Whom & Settlement Optimization
- **Detailed Person-to-Person Debts**: Computed via deterministic proportional payer attribution followed by bilateral reciprocal debt netting.
- **Optimized Settlement Plan**: Deterministic Greedy Min-Cash-Flow algorithm reducing total payment count across the group.
- **Zero-Sum Invariant**: $\sum \text{Net Balance} = 0$ is mathematically maintained and verified.

### 5. Multi-Step Settlement Workflow
- States: `pending` ➔ `marked_paid` ➔ `confirmed` / `rejected`.
- **Concurrency-Safe Confirmation**: Uses row-level locks (`SELECT ... FOR UPDATE`) in PostgreSQL transactions.
- **Financial Rule**: Only confirmed settlements affect balances.
- **Protection**: Payers cannot confirm their own payments; duplicate confirmations are rejected; duplicate requests prevented with `Idempotency-Key`.

### 6. Indian UPI Integration
- Generates safe NPCI-compliant deep links: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
- In-app **UPI QR Code** generator (`qrcode.react`) for camera scanning.
- Explicit disclaimers clarifying that launching UPI is not proof of payment; requires recipient confirmation.

### 7. Versioning & Activity Audit Log
- Expenses are never permanently deleted: voiding flags `is_voided = true` and restores pre-expense balances.
- Edits archive previous snapshots in `expense_versions`.
- Chronological `activity_logs` tracks expense, settlement, and membership events.

---

## 🛠 Technology Stack

- **Frontend**: React 19, Vite, JavaScript, React Router 7, Lucide Icons, QRCode.react, Custom CSS Design System.
- **Backend**: Node.js 22, Express.js 5, direct `pg` driver (no ORM), bcryptjs, jsonwebtoken, express-rate-limit.
- **Database**: PostgreSQL 18 with parameterized SQL, relational integrity, transactions, and foreign keys.
- **Testing**: Node.js native test runner (`node --test`), Supertest for REST API testing, and Monte Carlo randomized invariant property testing.

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (v22 recommended)
- [PostgreSQL](https://www.postgresql.org/) v14+ running locally or remotely

### 1. Database Configuration
Ensure PostgreSQL is running and create the database (or use an existing one):
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

### 3. Start Backend & Frontend

#### Terminal 1 — Backend:
```bash
cd backend
npm start
# Server starts at http://localhost:5000
```

#### Terminal 2 — Frontend:
```bash
cd frontend
npm run dev
# Frontend runs at http://localhost:5173
```

---

## 🧪 Automated Test Suite

Run the complete test suite (unit tests, API integration tests, and 100 randomized property simulations):
```bash
npm --prefix backend test
```

### Specialized Test Commands:
```bash
# Unit tests: 6 split methods, optimizer, and debts policy
npm --prefix backend run test:unit

# 100 Monte Carlo randomized financial invariant tests
npm --prefix backend run test:random

# End-to-end REST API integration tests
npm --prefix backend run test:api
```

All 37 test cases pass with zero failures:
- Split engines & deterministic remainder distributions.
- Multiple payers & subset participants.
- Zero-sum invariants across 100 random multi-user simulations.
- Concurrency-safe settlement state machine.
- Unauthorized access & balance-protected group leaving.

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

*Tip: The Login screen includes one-click buttons to instantly log in as any demo account.*

---

## 📁 Project Directory Structure

```
SettleUpExpenses/
├── README.md                      # Primary project documentation
├── .gitignore                     # Git ignore rules
├── package.json                   # Root package scripts
├── .env.example                   # Master environment template
├── docs/
│   ├── API_DOCUMENTATION.md       # Comprehensive REST API reference
│   ├── DATABASE_SCHEMA.md         # Schema, constraints, indexes & ERD
│   └── DEPLOYMENT.md              # Production multi-tier deployment guide
├── backend/
│   ├── package.json
│   ├── .env                       # Local backend configuration
│   ├── .env.example
│   ├── server.js                  # Server listener
│   ├── app.js                     # Express app instance
│   ├── src/
│   │   ├── db/
│   │   │   └── index.js           # pg.Pool connection & transaction wrapper
│   │   ├── database/
│   │   │   ├── schema.sql         # Idempotent DDL schema
│   │   │   ├── migrate.js         # Migration executor
│   │   │   └── seed.js            # Realistic Indian demo seeder
│   │   ├── utils/
│   │   │   ├── money.js           # Integer paise <-> INR utilities
│   │   │   ├── splits.js          # All 6 split calculation algorithms
│   │   │   ├── debts.js           # Deterministic pairwise debt engine
│   │   │   ├── optimizer.js       # Greedy Min-Cash-Flow settlement optimizer
│   │   │   └── upi.js             # NPCI compliant UPI URI generator
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT bearer token verification
│   │   │   ├── groupAuth.js       # Role & membership authorizers
│   │   │   ├── rateLimiter.js     # Express brute-force limiter
│   │   │   ├── idempotency.js     # Request idempotency caching
│   │   │   └── errorHandler.js    # Centralized HTTP error handler
│   │   ├── controllers/           # Auth, Group, Expense, Settlement, Balance controllers
│   │   └── routes/                # Express API routes
│   └── tests/
│       ├── splits.test.js
│       ├── optimizer.test.js
│       ├── debts.test.js
│       ├── api.test.js
│       └── randomizedFinancial.test.js
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── api/                   # Fetch client with auth headers
        ├── context/               # React AuthContext
        ├── components/            # Modals, Navbar, Toast, ExpenseModal, UpiQrModal
        ├── pages/                 # Login, Signup, Dashboard, GroupDetails, Profile
        ├── utils/                 # Formatting & currency helpers
        └── index.css              # Custom responsive CSS design system
```

---

## 🔒 Security & Reliability Architecture

- **No ORM Vulnerabilities**: Handcrafted, parameterized SQL queries ensure query performance and total protection against SQL injection.
- **Transactions (`BEGIN ... COMMIT / ROLLBACK`)**: All multi-table updates (expense creation, edits, settlement confirmation, group creation) execute within ACID transactions.
- **Concurrency Safety**: Row locking (`SELECT ... FOR UPDATE`) prevents race conditions when confirming settlements.
- **Idempotency**: Prevents double debit/confirmations via client-supplied `Idempotency-Key`.
- **Integrity Guarantee**: Members cannot leave a group until their net balance is exactly ₹0.00.
