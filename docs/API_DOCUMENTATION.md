# SettleUpExpenses — REST API Documentation

SettleUpExpenses provides a RESTful JSON API. All monetary values in the database are stored as **integer paise** (1 INR = 100 Paise) to ensure zero floating-point precision loss.

## Base URL
- Development: `http://localhost:5000/api`
- Production: `https://<your-backend-domain>/api`

---

## Authentication & Headers
All protected routes require a valid JWT Bearer token:
```http
Authorization: Bearer <jwt_token>
```

For payment proposals, mark-paid, and confirmation, pass an optional idempotency key:
```http
Idempotency-Key: <unique-uuid-or-key>
```

---

## 1. Authentication & Profiles (`/auth`)

### 1.1 Sign Up
- **POST** `/auth/signup`
- **Rate Limit**: 50 req / 15 min
- **Request Body**:
```json
{
  "name": "Aarav Sharma",
  "email": "aarav@example.com",
  "password": "password123",
  "upi_id": "aarav@okhdfcbank"
}
```
- **Response** `201 Created`:
```json
{
  "message": "Account created successfully",
  "user": {
    "id": 1,
    "name": "Aarav Sharma",
    "email": "aarav@example.com",
    "upi_id": "aarav@okhdfcbank",
    "created_at": "2026-10-23T18:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 1.2 Login
- **POST** `/auth/login`
- **Request Body**:
```json
{
  "email": "aarav@example.com",
  "password": "password123"
}
```
- **Response** `200 OK`:
```json
{
  "message": "Logged in successfully",
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 1.3 Get Current Profile
- **GET** `/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response** `200 OK`:
```json
{
  "user": {
    "id": 1,
    "name": "Aarav Sharma",
    "email": "aarav@example.com",
    "upi_id": "aarav@okhdfcbank"
  }
}
```

### 1.4 Update Profile
- **PUT** `/auth/profile`
- **Request Body**:
```json
{
  "name": "Aarav K. Sharma",
  "upi_id": "aarav@okaxis"
}
```

### 1.5 Change Password
- **PUT** `/auth/change-password`
- **Request Body**:
```json
{
  "currentPassword": "password123",
  "newPassword": "newSecretPassword456"
}
```

---

## 2. Groups & Memberships (`/groups`)

### 2.1 Create Group
- **POST** `/groups`
- **Request Body**:
```json
{
  "name": "Flat 402 Indiranagar",
  "description": "Flatmates sharing rent and utilities"
}
```
- **Response** `201 Created`:
```json
{
  "message": "Group created successfully",
  "group": {
    "id": 1,
    "name": "Flat 402 Indiranagar",
    "description": "Flatmates sharing rent and utilities",
    "invite_code": "FLAT402B",
    "created_by": 1
  }
}
```

### 2.2 Get User's Groups (with Net Balance)
- **GET** `/groups`
- **Response** `200 OK`:
```json
{
  "groups": [
    {
      "id": 1,
      "name": "Flat 402 Indiranagar",
      "role": "owner",
      "member_count": 4,
      "expense_count": 8,
      "myNetBalancePaise": 250000
    }
  ]
}
```

### 2.3 Join Group with Invite Code
- **POST** `/groups/join`
- **Request Body**:
```json
{
  "invite_code": "FLAT402B"
}
```

### 2.4 Get Group Details
- **GET** `/groups/:groupId`
- **Response** `200 OK`: Returns group metadata, membership role, and active/inactive member roster.

### 2.5 Add Member by Email (Admin/Owner only)
- **POST** `/groups/:groupId/members`
- **Request Body**:
```json
{
  "email": "priya@example.com"
}
```

### 2.6 Leave Group
- **POST** `/groups/:groupId/leave`
- **Validation**: User net balance in this group must be exactly ₹0.00. Returns `400 Bad Request` if unsettled.

---

## 3. Expenses & Splits (`/groups/:groupId/expenses`, `/expenses`)

### 3.1 Create Expense
- **POST** `/groups/:groupId/expenses`
- **Split Types**: `equal`, `exact`, `percentage`, `shares`, `adjustment`, `itemized`
- **Single or Multiple Payers Supported**

#### Example 1: Equal Split (Single Payer)
```json
{
  "description": "WiFi Bill",
  "amountPaise": 150000,
  "category": "Utilities",
  "splitType": "equal",
  "payers": [{ "userId": 1, "amountPaise": 150000 }],
  "participantIds": [1, 2, 3, 4]
}
```

#### Example 2: Multiple Payers + Percentage Split
```json
{
  "description": "BESCOM Electricity",
  "amountPaise": 360000,
  "category": "Utilities",
  "splitType": "percentage",
  "payers": [
    { "userId": 1, "amountPaise": 200000 },
    { "userId": 2, "amountPaise": 160000 }
  ],
  "splitData": [
    { "userId": 1, "percentage": 35 },
    { "userId": 2, "percentage": 35 },
    { "userId": 3, "percentage": 15 },
    { "userId": 4, "percentage": 15 }
  ]
}
```

#### Example 3: Itemized Split with Shared Tax
```json
{
  "description": "Swiggy Order",
  "amountPaise": 235000,
  "category": "Food & Dining",
  "splitType": "itemized",
  "payers": [{ "userId": 2, "amountPaise": 235000 }],
  "items": [
    { "name": "Pizza", "amountPaise": 85000, "assignedUserIds": [1, 3] },
    { "name": "Pasta", "amountPaise": 70000, "assignedUserIds": [2, 4] },
    { "name": "Garlic Bread", "amountPaise": 60000, "assignedUserIds": [1, 2, 3, 4] }
  ],
  "sharedTaxPaise": 20000
}
```

### 3.2 Update Expense (Creates Version Snapshot)
- **PUT** `/expenses/:expenseId`
- **Request Body**: Same schema as Create Expense, with optional `reason`.
- Automatically archives previous version in `expense_versions`.

### 3.3 Void Expense
- **POST** `/expenses/:expenseId/void`
- Sets `is_voided = true`. Does not delete financial records.

---

## 4. Balances, Debts, & Optimization (`/groups/:groupId/balances`, `/groups/:groupId/debts`)

### 4.1 Get Balances & Optimized Settlement Suggestions
- **GET** `/groups/:groupId/balances`
- **Response** `200 OK`:
```json
{
  "groupId": 1,
  "balances": [
    {
      "userId": 1,
      "name": "Aarav Sharma",
      "upiId": "aarav@okhdfcbank",
      "totalPaidPaise": 450000,
      "totalOwedPaise": 150000,
      "netBalancePaise": 300000
    }
  ],
  "suggestions": [
    {
      "fromUser": 2,
      "fromName": "Priya Patel",
      "toUser": 1,
      "toName": "Aarav Sharma",
      "toUpiId": "aarav@okhdfcbank",
      "amountPaise": 300000,
      "upiUri": "upi://pay?pa=aarav%40okhdfcbank&pn=Aarav+Sharma&am=3000.00&cu=INR&tn=SettleUp+debt+payment"
    }
  ],
  "netSumPaise": 0
}
```

### 4.2 Get Detailed Person-to-Person Debts
- **GET** `/groups/:groupId/debts`
- **Response** `200 OK`: Returns direct pairwise debts computed via proportional payer attribution with bilateral netting.

---

## 5. Settlements Workflow (`/groups/:groupId/settlements`, `/settlements`)

### 5.1 Propose or Record Settlement
- **POST** `/groups/:groupId/settlements`
- **Headers**: Optional `Idempotency-Key`
- **Request Body**:
```json
{
  "fromUser": 2,
  "toUser": 1,
  "amountPaise": 50000,
  "paymentMethod": "upi",
  "referenceId": "UPI/20261023/123456",
  "notes": "Settled WiFi share"
}
```

### 5.2 Mark Settlement as Paid (Debtor/Creator)
- **POST** `/settlements/:settlementId/mark-paid`
- **Request Body**: `{ "referenceId": "UPI/20261023/123456", "notes": "Paid via PhonePe" }`

### 5.3 Confirm Settlement (Creditor/Recipient Only)
- **POST** `/settlements/:settlementId/confirm`
- **Concurrency-Safe**: Uses `SELECT ... FOR UPDATE` in a database transaction.
- **Effect**: Only confirmed settlements update group balances!

### 5.4 Reject Settlement (Creditor Only)
- **POST** `/settlements/:settlementId/reject`
- **Request Body**: `{ "reason": "Did not receive credit in bank account" }`

---

## 6. Activity History (`/groups/:groupId/activity`)
- **GET** `/groups/:groupId/activity`
- **Query Params**: `limit` (default 50), `offset` (default 0)
- Returns chronological log of expense creations, edits, voidings, settlements, and member joins/leaves.
