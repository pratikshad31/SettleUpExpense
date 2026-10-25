// frontend/src/api/client.js
// Fetch-based API client with automatic JWT token attachment

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const token = localStorage.getItem('settleup_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey }),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      let errorMessage = data.error || data.message;
      if (!errorMessage) {
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          errorMessage = 'Unable to connect to the server. Please verify the backend service is running and try again.';
        } else if (response.status === 409) {
          errorMessage = 'An account with this email address already exists. Please sign in instead.';
        } else if (response.status === 401) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        } else if (response.status === 403) {
          errorMessage = 'You do not have permission to perform this action.';
        } else if (response.status === 404) {
          errorMessage = 'The requested resource or service was not found.';
        } else if (response.status === 500) {
          errorMessage = 'A server error occurred. Please try again in a few moments.';
        } else {
          errorMessage = 'Something went wrong. Please try again.';
        }
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message && err.message.toLowerCase().includes('fetch')) {
      const networkError = new Error('Cannot reach the server. Please check your connection and try again.');
      networkError.status = 503;
      throw networkError;
    }
    throw err;
  }
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
};
