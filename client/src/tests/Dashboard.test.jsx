import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { user: { name: 'Demo Doctor', role: 'DOCTOR' } } }));
vi.mock('../api/client', () => ({ default: { get }, errorMessage: (error) => error.message }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('dashboard', () => {
  beforeEach(() => {
    get.mockReset();
    auth.user = { name: 'Demo Doctor', role: 'DOCTOR' };
    get.mockImplementation((path) => path === '/dashboard'
      ? Promise.resolve({ data: { data: { date: '2026-10-14', timeZone: 'Asia/Kolkata', today: { SCHEDULED: 2, ARRIVED: 1, COMPLETED: 0, CANCELLED: 0 } } } })
      : Promise.resolve({ data: { data: [] } }));
  });

  it('shows real same-day counts and hides booking from doctors', async () => {
    renderDashboard();
    const scheduledCard = await screen.findByText('Scheduled appointments');
    const arrivedCard = screen.getByText('Arrived appointments');
    expect(scheduledCard.closest('.metric-card')).toHaveTextContent('2');
    expect(arrivedCard.closest('.metric-card')).toHaveTextContent('1');
    expect(screen.queryByRole('link', { name: /book appointment/i })).not.toBeInTheDocument();
  });

  it('offers booking to reception staff', async () => {
    auth.user = { name: 'Demo Receptionist', role: 'RECEPTIONIST' };
    renderDashboard();
    expect(await screen.findByRole('link', { name: /book appointment/i })).toHaveAttribute('href', '/scheduler');
  });
});
