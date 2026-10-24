# SettleUpExpenses — Production Deployment Guide

This guide details deploying SettleUpExpenses across three separately hosted tiers:
1. **Frontend**: Static single-page application (React + Vite) hosted on Vercel, Netlify, Cloudflare Pages, or AWS S3/CloudFront.
2. **Backend**: REST API (Node.js + Express) hosted on Render, Railway, Fly.io, AWS ECS, or a Linux VPS.
3. **Database**: Managed PostgreSQL instance (Neon, Supabase, AWS RDS, Railway, or standard PostgreSQL 14+).

---

## 1. Database Setup (PostgreSQL)

### Recommended Providers
- Neon.tech (serverless PostgreSQL with connection pooling)
- Supabase / AWS RDS / DigitalOcean Managed Databases

### Configuration Steps
1. Create a database named `settleup_expenses`.
2. Obtain connection parameters:
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_HOST`
   - `DB_PORT` (default: `5432`)
   - `DB_NAME`
3. Run the idempotent database migration:
   ```bash
   cd backend
   npm run migrate
   ```
4. Optional: Populate initial demo accounts and sample expenses:
   ```bash
   npm run seed
   ```

---

## 2. Backend Deployment (Node.js + Express)

### Environment Variables
Set the following environment variables in your hosting dashboard:
```env
NODE_ENV=production
PORT=5000
DB_HOST=your-postgres-host.com
DB_PORT=5432
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_NAME=settleup_expenses
JWT_SECRET=generate_a_random_64_character_hex_string_here
JWT_EXPIRES_IN=7d
```

### Build & Start Commands
- **Install command**: `npm install --omit=dev`
- **Build command**: (None required for plain Node.js)
- **Start command**: `npm start` (or `node server.js`)

### Health Check Endpoints
- `/health`: Returns `{ "status": "healthy" }`
- `/api/db-test`: Validates live PostgreSQL connectivity

---

## 3. Frontend Deployment (React + Vite)

### Environment Variables
Configure the backend API URL:
```env
VITE_API_URL=https://api.yourdomain.com/api
```

### Build & Deploy Commands
- **Install command**: `npm install`
- **Build command**: `npm run build`
- **Publish directory**: `dist`

### SPA Routing Rule
For Vercel (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
For Netlify (`_redirects` in `public/`):
```
/*    /index.html   200
```

---

## 4. Production Security Checklist

- [x] **Monetary Precision**: All amounts strictly calculated and stored as integer paise (`BIGINT`).
- [x] **SQL Injection Defense**: 100% of queries use parameterized `$1, $2` inputs without string concatenation.
- [x] **Rate Limiting**: Protects sensitive `/api/auth/login` and `/api/auth/signup` against brute force.
- [x] **Concurrency Safety**: Settlement confirmations use atomic `SELECT ... FOR UPDATE` row locks inside PostgreSQL transactions.
- [x] **Idempotency Protection**: Supports `Idempotency-Key` headers on payment proposals and confirmations.
- [x] **Credential Protection**: Passwords securely hashed with bcrypt (salt rounds = 10); hashes never returned in API payloads.
- [x] **Zero-Sum Balance Validation**: Balance calculation recomputed strictly from non-voided expenses and confirmed settlements.
