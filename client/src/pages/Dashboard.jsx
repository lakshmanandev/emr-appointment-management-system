import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, Clock3, RotateCw, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

const cards = [
  { key: 'SCHEDULED', title: 'Scheduled', icon: CalendarDays, tone: 'blue' },
  { key: 'ARRIVED', title: 'Arrived', icon: UserCheck, tone: 'teal' },
  { key: 'COMPLETED', title: 'Completed', icon: Check, tone: 'green' },
  { key: 'CANCELLED', title: 'Cancelled', icon: Clock3, tone: 'slate' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canBook = user?.role === 'SUPER_ADMIN' || user?.role === 'RECEPTIONIST';

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/dashboard', { signal });
      const dashboard = response.data.data;
      const list = await api.get('/appointments', {
        params: { limit: 6, from: dashboard.date, to: dashboard.date }, signal,
      });
      setData(dashboard);
      setAppointments(list.data.data);
    } catch (e) {
      if (e.code !== 'ERR_CANCELED') setError(errorMessage(e));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const today = data?.date ? new Date(`${data.date}T12:00:00Z`) : new Date();
  const total = cards.reduce((sum, card) => sum + (data?.today?.[card.key] || 0), 0);
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">OVERVIEW</span><h1>Dashboard</h1><p className="muted">Your care team's daily snapshot.</p></div>
      {canBook && <Link className="primary" to="/scheduler">Book appointment <ArrowUpRight size={16}/></Link>}
    </div>
    {error && <div className="alert error" role="alert">{error}<button className="secondary retry-button" onClick={() => load()}><RotateCw size={14}/> Try again</button></div>}
    <div className="section-title"><h2>Today at a glance</h2><span>{data?.date && new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: data.timeZone }).format(today)}{data?.timeZone ? ` · ${data.timeZone}` : ''}</span></div>
    {loading && !data ? <div className="panel loading-state" role="status">Loading today's snapshot…</div> : <>
      <div className="metric-grid">{cards.map(({ key, title, icon: Icon, tone }) => <article className="metric-card" key={key}><div className={`metric-icon ${tone}`}><Icon size={18}/></div><span className="metric-label">{title} appointments</span><strong>{data?.today?.[key] ?? '—'}</strong><small>Today</small></article>)}</div>
      <section className="panel status-panel"><div className="panel-heading"><div><h2>Today's visit status</h2><p className="muted">{total} appointments recorded for this day</p></div></div>
        <div className="status-breakdown" aria-label="Appointment status breakdown">{cards.map(({ key, title, tone }) => <div className="status-row" key={key}><span>{title}</span><div className="status-track"><i className={`status-fill ${tone}`} style={{ width: `${total ? (data?.today?.[key] || 0) / total * 100 : 0}%` }}/></div><strong>{data?.today?.[key] ?? 0}</strong></div>)}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Today's appointments</h2><p className="muted">Visits scheduled for {data?.timeZone || 'your local'} day</p></div><Link className="text-link" to="/appointments">View all <ArrowUpRight size={15}/></Link></div>
        {loading ? <div className="loading-state" role="status">Refreshing appointments…</div> : !appointments.length ? <div className="empty-state"><span className="empty-icon"><CalendarDays size={21}/></span><strong>No appointments to show</strong><p>Appointments for today will appear here.</p></div> : <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Time</th><th>Status</th></tr></thead><tbody>{appointments.map((a) => <tr key={a._id}><td><strong>{a.patient?.name}</strong><small>{a.patient?.patientId}</small></td><td>{a.doctor?.user?.name}</td><td>{new Date(a.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: a.doctor?.timezone || data?.timeZone })}</td><td><span className={`badge ${a.status.toLowerCase()}`}>{a.status}</span></td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </>;
}
