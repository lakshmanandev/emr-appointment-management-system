import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import api from '../api/client';

vi.mock('../api/client', () => ({ default: { post: vi.fn() } }));
function Harness() { const { user, login, logout } = useAuth(); return <div><output>{user?.name || 'Signed out'}</output><button onClick={() => login('desk@hospital.test', 'secret')}>Sign in</button><button onClick={async () => { try { await logout(); } catch { /* local auth is cleared even when the server cannot be reached */ } }}>Sign out</button></div>; }

describe('authentication context', () => {
  it('stores the access token and authenticated user after login', async () => {
    api.post.mockResolvedValue({ data: { data: { accessToken: 'access-token', user: { id: '1', name: 'Front Desk', role: 'RECEPTIONIST' } } } });
    render(<AuthProvider><Harness/></AuthProvider>); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Front Desk')).toBeInTheDocument());
    expect(localStorage.getItem('accessToken')).toBe('access-token');
    expect(JSON.parse(localStorage.getItem('user')).role).toBe('RECEPTIONIST');
  });
  it('clears local auth state on logout, even if the request fails', async () => {
    localStorage.setItem('accessToken', 'expired'); localStorage.setItem('user', JSON.stringify({ name: 'Front Desk' }));
    api.post.mockRejectedValueOnce(new Error('network unavailable'));
    render(<AuthProvider><Harness/></AuthProvider>); fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByText('Signed out')).toBeInTheDocument());
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
