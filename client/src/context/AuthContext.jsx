import { createContext, useContext, useState } from 'react';
import api from '../api/client';
const AuthContext = createContext(null);
export function AuthProvider({ children }) { const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } });
  const login = async (email, password) => { const { data } = await api.post('/auth/login', { email, password }); localStorage.setItem('accessToken', data.data.accessToken); localStorage.setItem('user', JSON.stringify(data.data.user)); setUser(data.data.user); };
  const logout = async () => { try { await api.post('/auth/logout'); } finally { localStorage.removeItem('accessToken'); localStorage.removeItem('user'); setUser(null); } };
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>; }
export const useAuth = () => useContext(AuthContext);
