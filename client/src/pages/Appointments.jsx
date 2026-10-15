import { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Appointments() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/doctors'), api.get('/doctors/departments')])
      .then(([doctorResponse, departmentResponse]) => {
        if (active) { setDoctors(doctorResponse.data.data); setDepartments(departmentResponse.data.data); }
      })
      .catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      api.get('/appointments', { params: { page, limit: 10, patient: q || undefined, status: status || undefined, from: from || undefined, to: to || undefined, doctorId: doctorId || undefined, departmentId: departmentId || undefined }, signal: controller.signal })
        .then(({ data }) => { if (active) setResult(data); })
        .catch((e) => { if (active && e.code !== 'ERR_CANCELED') setError(errorMessage(e)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [q, status, from, to, doctorId, departmentId, page]);

  const resetFilters = () => { setPage(1); setQ(''); setStatus(''); setFrom(''); setTo(''); setDoctorId(''); setDepartmentId(''); };
  return <>
    <div className="page-heading"><div><span className="eyebrow">PATIENT CARE</span><h1>Appointments</h1><p className="muted">Search and manage patient visits.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <section className="panel">
      <div className="toolbar">
        <div className="searchbox"><Search size={17}/><input aria-label="Search appointments" placeholder="Search patient, ID or mobile" value={q} onChange={e => { setPage(1); setQ(e.target.value); }}/></div>
        <select aria-label="Filter status" value={status} onChange={e => { setPage(1); setStatus(e.target.value); }}><option value="">All statuses</option>{['SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED'].map(s => <option key={s}>{s}</option>)}</select>
        {user?.role !== 'DOCTOR' && <select aria-label="Filter doctor" value={doctorId} onChange={e => { setPage(1); setDoctorId(e.target.value); }}><option value="">All doctors</option>{doctors.map(d => <option key={d._id} value={d._id}>{d.user?.name || d.code}</option>)}</select>}
        <select aria-label="Filter department" value={departmentId} onChange={e => { setPage(1); setDepartmentId(e.target.value); }}><option value="">All departments</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
        <label>From<input aria-label="From date" type="date" value={from} max={to || undefined} onChange={e => { setPage(1); setFrom(e.target.value); }}/></label>
        <label>To<input aria-label="To date" type="date" value={to} min={from || undefined} onChange={e => { setPage(1); setTo(e.target.value); }}/></label>
      </div>
      {loading ? <div className="loading-state" role="status">Loading appointments…</div> : result.data.length ? <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Department</th><th>Date &amp; time</th><th>Status</th></tr></thead><tbody>{result.data.map(a => <tr key={a._id}><td><Link className="patient-link" to={`/appointments/${a._id}`}><strong>{a.patient?.name}</strong><small>{a.patient?.patientId} · {a.patient?.mobile}</small></Link></td><td>{a.doctor?.user?.name}</td><td>{a.department?.name}</td><td>{new Date(a.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: a.doctor?.timezone })}</td><td><span className={`badge ${a.status.toLowerCase()}`}>{a.status}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><CalendarDays size={21}/></span><strong>No matching appointments</strong><p>Try a different search or status filter.</p><button className="small-action" onClick={resetFilters}>Clear filters</button></div>}
      <div className="pagination"><span>{result.pagination?.total ?? 0} appointments</span><div><button className="icon-button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17}/></button><span>Page {page} of {Math.max(1, result.pagination?.totalPages || 1)}</span><button className="icon-button" disabled={loading || page >= (result.pagination?.totalPages || 1)} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17}/></button></div></div>
    </section>
  </>;
}

