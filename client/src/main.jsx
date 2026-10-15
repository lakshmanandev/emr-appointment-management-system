import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import Scheduler from './pages/Scheduler';
import Doctors from './pages/Doctors';
import Management from './pages/Management';
import AppointmentDetails from './pages/AppointmentDetails';
import './styles/global.css';
function App() { return <AuthProvider><BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route element={<ProtectedRoute/>}><Route element={<AppLayout/>}><Route index element={<Dashboard/>}/><Route path="appointments" element={<Appointments/>}/><Route path="appointments/:id" element={<AppointmentDetails/>}/><Route element={<ProtectedRoute roles={['SUPER_ADMIN', 'RECEPTIONIST']}/>}><Route path="scheduler" element={<Scheduler/>}/></Route><Route path="doctors" element={<Doctors/>}/><Route element={<ProtectedRoute roles={['SUPER_ADMIN']}/>}><Route path="management" element={<Management/>}/></Route><Route path="unauthorized" element={<div className="panel"><h1>Access restricted</h1><p className="muted">Your account does not have access to this page.</p></div>}/></Route></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></BrowserRouter></AuthProvider>; }
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
