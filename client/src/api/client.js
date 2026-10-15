import axios from 'axios';
// const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1', withCredentials: true });
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'https://emr-appointment-management-system-fcnr.onrender.com/api/v1', withCredentials: true });
api.interceptors.request.use((config) => { const token = localStorage.getItem('accessToken'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
let refreshing;
api.interceptors.response.use((r) => r, async (error) => { const original = error.config; if (error.response?.status === 401 && !original._retried && !original.url?.includes('/auth/')) { original._retried = true; refreshing ||= api.post('/auth/refresh').then(({ data }) => { localStorage.setItem('accessToken', data.data.accessToken); return data.data.accessToken; }).finally(() => { refreshing = null; }); try { original.headers.Authorization = `Bearer ${await refreshing}`; return api(original); } catch { localStorage.removeItem('accessToken'); window.location.assign('/login'); } } return Promise.reject(error); });
export const errorMessage = (e) => e.response?.data?.error?.message || e.message || 'Something went wrong';
export default api;
