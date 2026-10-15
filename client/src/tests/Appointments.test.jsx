import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Appointments from '../pages/Appointments';
import api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../api/client', () => ({ default: { get: vi.fn() }, errorMessage: (error) => error.response?.data?.error?.message || error.message }));

describe('appointment list', () => {
  const doctor = { _id: '64b000000000000000000002', code: 'DOC-2', user: { name: 'Dr. Chen' } };
  const department = { _id: '64b000000000000000000001', name: 'Neurology' };
  beforeEach(() => api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/doctors' ? [doctor] : url === '/doctors/departments' ? [department] : [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } })));
  const renderPage = () => render(<AuthProvider><MemoryRouter><Appointments/></MemoryRouter></AuthProvider>);

  it('shows loading and sends search, status, and date filters to the API', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading appointments');
    const search = screen.getByRole('textbox', { name: 'Search appointments' });
    await user.type(search, 'Jordan');
    await user.selectOptions(screen.getByLabelText('Filter status'), 'SCHEDULED');
    await user.selectOptions(await screen.findByLabelText('Filter doctor'), doctor._id);
    await user.selectOptions(screen.getByLabelText('Filter department'), department._id);
    await user.type(screen.getByLabelText('From date'), '2035-01-01');
    await user.type(screen.getByLabelText('To date'), '2035-01-31');
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/appointments', expect.objectContaining({ params: expect.objectContaining({ patient: 'Jordan', status: 'SCHEDULED', from: '2035-01-01', to: '2035-01-31', doctorId: doctor._id, departmentId: department._id }) })));
    expect(await screen.findByText('No matching appointments')).toBeInTheDocument();
  });

  it('shows a failed request as an error state', async () => {
    api.get.mockRejectedValueOnce(new Error('Appointments unavailable'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Appointments unavailable');
  });
});
