import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { request } from '@playwright/test';

const API_BASE_URL = `${(process.env.E2E_API_URL || 'http://127.0.0.1:5000/api').replace(/\/+$/, '')}/`;
const TEST_PASSWORD = 'E2eTestPass1!';

export async function createApiContext() {
  return request.newContext({ baseURL: API_BASE_URL });
}

async function readJson(response, operation, expectedStatus) {
  const body = await response.json().catch(() => ({}));
  if (response.status() !== expectedStatus) {
    throw new Error(`${operation} returned HTTP ${response.status()}: ${body.error || 'request failed'}`);
  }
  return body;
}

export async function registerUser(api, overrides = {}) {
  const id = randomUUID();
  const input = {
    name: `E2E User ${id.slice(0, 8)}`,
    email: `e2e-${id}@example.test`,
    password: TEST_PASSWORD,
    upi_id: `e2e${id.slice(0, 8)}@okaxis`,
    ...overrides,
  };
  const response = await api.post('auth/signup', { data: input });
  const result = await readJson(response, 'register user', 201);
  return { user: result.user, token: result.token, email: input.email, password: input.password };
}

export async function loginUser(api, { email, password = TEST_PASSWORD }) {
  const response = await api.post('auth/login', { data: { email, password } });
  const result = await readJson(response, 'login user', 200);
  return { user: result.user, token: result.token, email, password };
}

function authHeaders(user) {
  return { Authorization: `Bearer ${user.token}` };
}

export async function createGroup(api, owner, { name, description = 'Playwright test group' } = {}) {
  const response = await api.post('groups', {
    headers: authHeaders(owner),
    data: { name: name || `E2E Group ${randomUUID().slice(0, 8)}`, description },
  });
  const result = await readJson(response, 'create group', 201);
  return result.group;
}

export async function addMember(api, owner, groupId, email) {
  const response = await api.post(`groups/${groupId}/members`, {
    headers: authHeaders(owner),
    data: { email },
  });
  const result = await readJson(response, 'add group member', 200);
  return result.user;
}

export async function seedExpense(api, owner, groupId, expense = {}) {
  const payload = {
    description: `E2E expense ${randomUUID().slice(0, 8)}`,
    amountPaise: 1000,
    splitType: 'equal',
    participantIds: [owner.user.id],
    ...expense,
  };
  const response = await api.post(`groups/${groupId}/expenses`, {
    headers: authHeaders(owner),
    data: payload,
  });
  const result = await readJson(response, 'seed expense', 201);
  return result.expense;
}

export async function createIsolatedUser(api, overrides = {}) {
  // Unique email per call keeps tests independent without truncating shared tables.
  return registerUser(api, overrides);
}
