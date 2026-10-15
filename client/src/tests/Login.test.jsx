import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, login }) }));

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>);
}

describe('login screen', () => {
  beforeEach(() => login.mockReset());

  it('toggles password visibility accessibly', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('shows a useful authentication error and permits retry', async () => {
    const user = userEvent.setup();
    login.mockRejectedValueOnce(new Error('Invalid email or password'));
    renderLogin();
    await user.type(screen.getByLabelText('Email address'), 'staff@example.test');
    await user.type(screen.getByLabelText('Password'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });
});
