// frontend/src/context/AuthContext.jsx
// React context for authentication state management

import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { AuthContext } from './authState';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth from token in localStorage
  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('settleup_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.get('/auth/me');
        setUser(data.user);
      } catch (err) {
        console.warn('Session expired or invalid token:', err.message);
        localStorage.removeItem('settleup_token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('settleup_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const signup = async ({ name, email, password, upi_id }) => {
    const data = await api.post('/auth/signup', { name, email, password, upi_id });
    localStorage.setItem('settleup_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('settleup_token');
    setUser(null);
  };

  const updateProfile = async (profileData) => {
    const data = await api.put('/auth/profile', profileData);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
