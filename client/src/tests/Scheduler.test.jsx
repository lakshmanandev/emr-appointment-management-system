import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Scheduler from '../pages/Scheduler';
import api from '../api/client';

vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() }, errorMessage: (error) => error.response?.data?.error?.message || error.message }));
const department = { _id: '64b000000000000000000001', name: 'Neurology' };
const doctor = { _id: '64b000000000000000000002', department, user: { name: 'Dr. Chen' }, specialization: 'Neurology' };
const slot = { startAt: '2035-01-02T04:30:00.000Z', endAt: '2035-01-02T04:50:00.000Z', available: true };
const patient = { _id: '64b000000000000000000003', patientId: 'PT-123', name: 'Jordan Lee', mobile: '+919876543210' };

describe('appointment booking screen', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/doctors') return Promise.resolve({ data: { data: [doctor] } });
      if (url === '/doctors/departments') return Promise.resolve({ data: { data: [department] } });
      if (url === '/doctors/slots') return Promise.resolve({ data: { data: [slot] } });
      if (url === '/appointments/patients/search') return Promise.resolve({ data: { data: [patient] } });
      return Promise.resolve({ data: { data: [] } });
    });
    api.post.mockResolvedValue({ data: { success: true } });
  });
  it('finds a patient, selects an available slot, and sends a booking to the API', async () => {
    const user = userEvent.setup(); const { container } = render(<Scheduler/>);
    await user.selectOptions(await screen.findByLabelText('Department'), department._id);
    await user.selectOptions(screen.getByLabelText('Doctor'), doctor._id);
    await waitFor(() => expect(container.querySelector('.slot')).toBeInTheDocument());
    await user.click(container.querySelector('.slot'));
    await user.type(screen.getByPlaceholderText('Search name, patient ID or mobile'), 'Jordan');
    await user.click(await screen.findByRole('button', { name: /Jordan Lee/ }));
    await user.type(screen.getByPlaceholderText('Brief reason for visit'), 'Headache consultation');
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({ doctorId: doctor._id, departmentId: department._id, patientId: patient._id, startAt: slot.startAt, endAt: slot.endAt, purpose: 'Headache consultation' })));
    expect(await screen.findByText('Appointment booked successfully.')).toBeInTheDocument();
  });
  it('shows API errors instead of hiding failed setup requests', async () => {
    api.get.mockRejectedValueOnce(new Error('Service unavailable'));
    render(<Scheduler/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });
});
