# Playwright UI tests

Install the browser once with `npx playwright install chromium`. The Playwright config starts Vite at `http://127.0.0.1:5173` and reuses an already-running dev server outside CI.

Start PostgreSQL and prepare a dedicated database before UI tests. In PowerShell:

```powershell
cd backend
$env:DB_NAME = 'settleup_ui_e2e_20261026_95a7'
npm run migrate
$env:PORT = '5000'
npm start
```

The backend reads its database settings and `JWT_SECRET` from the ignored `backend/.env`. Keep the secret at least 32 characters; do not put it in this file or commit it. Leave the backend running, then from another terminal:

```powershell
cd frontend
npm run dev -- --host localhost --port 5173
npm run test:e2e
```

Set `E2E_API_URL` to override the API base (default `http://127.0.0.1:5000/api`) and `E2E_BASE_URL` to override the browser base URL. API helpers register a fresh uniquely named user for each test, so test data is isolated without truncating the database.
