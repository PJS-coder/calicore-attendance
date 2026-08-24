// apps/web/src/app/(protected)/admin/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { api, extractError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { SalaryBreakdown } from '../../../types';

interface EmployeeUser {
  id: string;
  email: string;
  name: string;
  role: 'EMPLOYEE' | 'ADMIN';
  officeSsid: string;
  hourlyRate: number;
  createdAt: string;
}

interface PayrollEmployeeItem {
  user: EmployeeUser;
  totalLeadsAssigned: number;
  totalSalesRevenue: number;
  breakdown: SalaryBreakdown | null;
}

interface AnalyticsData {
  totalSalesRevenue: number;
  totalLeadsAssigned: number;
  attendanceBreakdown: {
    totalPresentDays: number;
    totalNormalDays: number;
    totalLateDays: number;
    totalHalfDays: number;
  };
  dailySalesTrend: Array<{ date: string; revenue: number }>;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE';
  clockIn: string | null;
  clockOut: string | null;
  isLate: boolean;
  lateMinutes: number;
  totalHours: number | null;
  salesRevenue?: number;
  leadsAssigned?: number;
}

interface HalfDayRequestItem {
  id: string;
  userId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE';
  halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  halfDayReason: string | null;
  salesRevenue: number;
  leadsAssigned: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface ShiftApprovalItem {
  id: string;
  userId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  shift: 'FIRST_SHIFT' | 'SECOND_SHIFT';
  managerApproval: 'NONE' | 'PENDING' | 'APPROVED_PRESENT' | 'APPROVED_ABSENT' | 'REJECTED';
  approvalReason: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Active section tab: 'analytics' | 'roster' | 'requests' | 'shiftApprovals'
  const [activeTab, setActiveTab] = useState<'analytics' | 'roster' | 'requests' | 'shiftApprovals'>('analytics');

  const [payrollSummary, setPayrollSummary] = useState<{
    totalSalaryPayable: number;
    totalLeadsAssigned: number;
    totalEmployees: number;
    employees: PayrollEmployeeItem[];
  } | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [halfDayRequests, setHalfDayRequests] = useState<HalfDayRequestItem[]>([]);
  const [shiftApprovals, setShiftApprovals] = useState<ShiftApprovalItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<EmployeeUser | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Employee detail modal state
  const [detailEmployee, setDetailEmployee] = useState<{ emp: EmployeeUser; item: PayrollEmployeeItem } | null>(null);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [hourlyRate, setHourlyRate] = useState(9000);
  const [officeSsid, setOfficeSsid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { success, error: toastError, info, ToastContainer } = useToast();

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [payrollRes, analyticsRes, requestsRes, shiftApprovalsRes] = await Promise.all([
        api.get('/admin/payroll/summary', { params: { year, month } }),
        api.get('/admin/analytics', { params: { year, month } }),
        api.get('/admin/half-day-requests'),
        api.get('/admin/shift-approvals'),
      ]);
      setPayrollSummary(payrollRes.data);
      setAnalytics(analyticsRes.data);
      setHalfDayRequests(requestsRes.data?.data ?? []);
      setShiftApprovals(shiftApprovalsRes.data?.data ?? []);
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [year, month, toastError]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleApprovalAction = async (attendanceId: string, approval: 'APPROVED' | 'REJECTED') => {
    try {
      await api.put(`/admin/half-day-requests/${attendanceId}`, { approval });
      if (approval === 'APPROVED') {
        success('Request approved! Attendance marked as Half Day.');
      } else {
        info('Request rejected! Attendance marked as Absent.');
      }
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    }
  };

  const handleShiftApprovalAction = async (attendanceId: string, approval: 'APPROVED_PRESENT' | 'APPROVED_ABSENT') => {
    try {
      await api.put(`/admin/shift-approvals/${attendanceId}`, { approval });
      if (approval === 'APPROVED_PRESENT') {
        success('Attendance approved as Present!');
      } else {
        info('Attendance marked as Absent.');
      }
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const openEmployeeDetail = async (item: PayrollEmployeeItem) => {
    setDetailEmployee({ emp: item.user, item });
    setDetailAttendance([]);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/attendance/${item.user.id}/timesheet`, { params: { year, month } });
      setDetailAttendance(res.data.data ?? []);
    } catch {
      setDetailAttendance([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('EMPLOYEE');
    setHourlyRate(9000);
    setOfficeSsid('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (emp: EmployeeUser) => {
    setEditingUser(emp);
    setName(emp.name);
    setEmail(emp.email);
    setRole(emp.role);
    setHourlyRate(emp.hourlyRate);
    setOfficeSsid(emp.officeSsid);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/admin/employees', {
        name,
        email,
        password,
        role,
        hourlyRate: Number(hourlyRate),
        officeSsid,
      });
      success('User added successfully!');
      setShowAddModal(false);
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await api.put(`/admin/employees/${editingUser.id}`, {
        name,
        email,
        role,
        hourlyRate: Number(hourlyRate),
        officeSsid,
      });
      success('User updated successfully!');
      setEditingUser(null);
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (emp: EmployeeUser) => {
    if (!confirm(`Are you sure you want to delete user "${emp.name}"?`)) return;
    try {
      await api.delete(`/admin/employees/${emp.id}`);
      success('User deleted successfully!');
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    }
  };

  // Modern trend data fallback if database has few points
  const rawTrend = analytics?.dailySalesTrend || [];
  const salesTrendData = (rawTrend.length >= 4)
    ? rawTrend
    : [
        { date: '07/01', revenue: 4500 },
        { date: '07/05', revenue: 12000 },
        { date: '07/10', revenue: 8500 },
        { date: '07/15', revenue: 18000 },
        { date: '07/20', revenue: 15400 },
        { date: '07/25', revenue: 22000 },
        { date: '07/30', revenue: analytics?.totalSalesRevenue || 19500 },
      ];

  const maxVal = Math.max(...salesTrendData.map(d => d.revenue), 5000);

  // Generate smooth SVG curve path string
  const svgWidth = 640;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  const points = salesTrendData.map((item, idx) => {
    const x = paddingX + (idx / Math.max(salesTrendData.length - 1, 1)) * (svgWidth - paddingX * 2);
    const y = svgHeight - paddingY - (item.revenue / maxVal) * (svgHeight - paddingY * 2);
    return { x, y, ...item };
  });

  const pathD = points.reduce((acc, pt, i, a) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = a[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) / 2;
    const cy2 = pt.y;
    return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x},${svgHeight - paddingY} L ${points[0].x},${svgHeight - paddingY} Z`;

  return (
    <div className="admin-page-layout-wrapper">
      <ToastContainer />

      {/* FIXED PINNED LEFT SIDEBAR NAVBAR */}
      <aside className="pinned-admin-sidebar">
        
        {/* Brand Logo Header */}
        <div className="sidebar-brand-header">
          <div className="sidebar-logo-emblem">
            <Image src="/calicore.png" alt="Calicore" width={36} height={36} priority />
          </div>
          <div>
            <div className="sidebar-brand-name">Calicore</div>
            <div className="sidebar-brand-tag">Admin Console</div>
          </div>
        </div>

        {/* Section Menu Navigation */}
        <div className="sidebar-menu-wrapper">
          <div className="sidebar-menu-title">MANAGEMENT</div>
          
          <nav className="sidebar-nav-list">
            <button
              className={`sidebar-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <span className="btn-icon">📊</span>
              <span className="btn-text">Dashboard & Analytics</span>
              <span className="btn-badge live">Live</span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveTab('roster')}
            >
              <span className="btn-icon">👥</span>
              <span className="btn-text">Employee Roster & Payroll</span>
              <span className="btn-badge blue">{payrollSummary?.employees.filter(e => e.user.role === 'EMPLOYEE').length ?? 0}</span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'shiftApprovals' ? 'active' : ''}`}
              onClick={() => setActiveTab('shiftApprovals')}
            >
              <span className="btn-icon">📞</span>
              <span className="btn-text">Manager Shift Approvals</span>
              <span className="btn-badge orange" style={{ background: '#FEE2E2', color: '#DC2626', fontWeight: 800 }}>
                {shiftApprovals.filter(r => r.managerApproval === 'PENDING').length}
              </span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              <span className="btn-icon">⏳</span>
              <span className="btn-text">Pending Early Leave Requests</span>
              <span className="btn-badge orange" style={{ background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>
                {halfDayRequests.filter(r => r.halfDayApproval === 'PENDING').length}
              </span>
            </button>
          </nav>
        </div>

        {/* Footer User Profile Card */}
        <div className="sidebar-footer-profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="profile-avatar-circle">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="profile-name">{user?.name || 'Administrator'}</div>
              <div className="profile-role">Admin Account</div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={logout} title="Sign Out">
            🚪
          </button>
        </div>

      </aside>

      {/* MAIN WORKSPACE CONTENT AREA (PUSHED RIGHT) */}
      <main className="pinned-admin-main-content">
        
        {/* Top Header Action Bar */}
        <div className="modernize-header-bar">
          <div>
            <h1 className="modernize-page-title">
              {activeTab === 'analytics' && 'Dashboard & Executive Analytics'}
              {activeTab === 'roster' && 'Employee Roster & Monthly Payroll'}
              {activeTab === 'shiftApprovals' && 'Unclocked Shift Manager Approvals'}
              {activeTab === 'requests' && 'Pending Early Leave & Half Day Requests'}
            </h1>
            <p className="modernize-page-sub">
              {activeTab === 'analytics' && 'Real-time sales revenue trends, leads assigned & financial metrics'}
              {activeTab === 'roster' && 'Workforce account credentials, base salaries & calculated payouts'}
              {activeTab === 'shiftApprovals' && 'Approve unclocked employees past 10:30 AM / 9:30 PM as Present or Mark Absent'}
              {activeTab === 'requests' && 'Approve early leave requests for Half Day, or Reject to mark Absent'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Month Selector */}
            <div className="modernize-month-pill">
              <button className="m-btn" onClick={prevMonth}>‹</button>
              <span className="m-label">{MONTHS[month - 1]} {year}</span>
              <button className="m-btn" onClick={nextMonth}>›</button>
            </div>

          </div>
        </div>

        {/* TAB 1: DASHBOARD & ANALYTICS VIEW */}
        {activeTab === 'analytics' && (
          <div className="tab-view-fade">
            
            {/* 2 Clean Pastel Metric Cards Row */}
            <div className="modernize-pastel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              
              <div className="pastel-card blue" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="pastel-icon-circle blue" style={{ width: 52, height: 52, borderRadius: 14, background: '#2563EB', color: '#FFF', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  👤
                </div>
                <div>
                  <span className="pastel-label" style={{ fontSize: 13, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>Total Employees</span>
                  <span className="pastel-value" style={{ fontSize: 26, fontWeight: 800, color: '#1E293B', marginTop: 2, display: 'block' }}>{payrollSummary?.employees.filter(e => e.user.role === 'EMPLOYEE').length ?? 0}</span>
                </div>
              </div>

              <div className="pastel-card teal" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="pastel-icon-circle teal" style={{ width: 52, height: 52, borderRadius: 14, background: '#059669', color: '#FFF', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  💵
                </div>
                <div>
                  <span className="pastel-label" style={{ fontSize: 13, color: '#047857', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>Salary Payable ({MONTHS[month - 1]} {year})</span>
                  <span className="pastel-value" style={{ fontSize: 26, fontWeight: 800, color: '#065F46', marginTop: 2, display: 'block' }}>{payrollSummary ? fmtCurrency(payrollSummary.totalSalaryPayable) : '₹0.00'}</span>
                </div>
              </div>

            </div>

            {/* WORKFORCE PAYOUT SUMMARY TABLE */}
            <div className="modernize-table-card" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#0F172A' }}>
                    Monthly Salary Payable Breakdown ({MONTHS[month - 1]} {year})
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748B' }}>
                    Overview of monthly base salaries and calculated payout for each employee
                  </p>
                </div>

                <button className="modernize-add-btn" onClick={handleOpenAddModal}>
                  + Add Employee
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : !payrollSummary || payrollSummary.employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                  No employee records available for this month.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee Name</th>
                        <th>Role</th>
                        <th>Base Salary</th>
                        <th>Salary to Give ({MONTHS[month - 1]})</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummary.employees.filter(e => e.user.role === 'EMPLOYEE').map((item) => {
                        const { user: emp } = item;
                        return (
                          <tr key={emp.id} onClick={() => openEmployeeDetail(item)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{emp.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.email}</div>
                            </td>
                            <td>
                              <span className="badge badge-present" style={{ fontSize: 11, fontWeight: 600 }}>
                                {emp.role}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
                              {fmtCurrency(emp.hourlyRate)}<span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>/mo</span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#047857', fontSize: 15 }}>
                              {item.breakdown ? fmtCurrency(item.breakdown.grossSalary) : '—'}
                            </td>
                            <td>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#2563EB', borderColor: '#BFDBFE' }}
                                onClick={(e) => { e.stopPropagation(); openEmployeeDetail(item); }}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: EMPLOYEE ROSTER & PAYROLL VIEW */}
        {activeTab === 'roster' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#0F172A' }}>
                    Employee Roster
                  </h3>
                  <p style={{ fontSize: 13, color: '#94A3B8' }}>Manage employee accounts, base salaries and leads assigned.</p>
                </div>

                <button className="modernize-add-btn" onClick={handleOpenAddModal}>
                  + Add New Employee
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : !payrollSummary || payrollSummary.employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No users registered. Click &quot;+ Add User&quot; to create employee accounts.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Monthly Salary</th>
                        <th>Salary Generated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummary.employees.filter(e => e.user.role === 'EMPLOYEE').map((item) => {
                        const { user: emp } = item;
                        return (
                          <tr key={emp.id} onClick={() => openEmployeeDetail(item)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{emp.name}</div>
                              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{emp.email}</div>
                            </td>
                            <td>
                              <span className="badge badge-present" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                                Employee
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
                              {fmtCurrency(emp.hourlyRate)}<span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>/mo</span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#047857', fontSize: 14 }}>
                              {item.breakdown ? fmtCurrency(item.breakdown.grossSalary) : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600 }}
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditModal(emp); }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#DC2626', borderColor: '#FECACA' }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteUser(emp); }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PENDING EARLY LEAVE REQUESTS VIEW */}
        {activeTab === 'requests' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ marginBottom: 20 }}>
                <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                  Pending Early Leave Requests
                </h3>
                <p style={{ fontSize: 13, color: '#64748B' }}>
                  Employees who logged out before 6:00 PM and requested Half Day approval. If unapproved after 6:00 PM, they will automatically be marked Absent.
                </p>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : halfDayRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#64748B', background: '#F8FAFC', borderRadius: 12, border: '1px stroke #E2E8F0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>No Early Leave Requests Pending</h4>
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
                    All requests have been processed or no employees have requested early leave today.
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Clock In / Out</th>
                        <th>Reason for Early Leave</th>
                        <th>Approval Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {halfDayRequests.map((reqItem) => (
                        <tr key={reqItem.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{reqItem.user?.name}</div>
                            <div style={{ fontSize: 12, color: '#64748B' }}>{reqItem.user?.email}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                              In: {fmtTime(reqItem.clockIn)}
                            </div>
                            <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>
                              Out: {fmtTime(reqItem.clockOut)}
                            </div>
                          </td>
                          <td style={{ maxWidth: 220 }}>
                            <p style={{ fontSize: 12.5, color: '#475569', fontStyle: 'italic', margin: 0 }}>
                              "{reqItem.halfDayReason || 'No reason provided'}"
                            </p>
                          </td>
                          <td>
                            {reqItem.halfDayApproval === 'PENDING' ? (
                              <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                ⏳ Pending Review
                              </span>
                            ) : reqItem.halfDayApproval === 'APPROVED' ? (
                              <span style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                ✓ Approved (Half Day)
                              </span>
                            ) : (
                              <span style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                ✕ Rejected (Absent)
                              </span>
                            )}
                          </td>
                          <td>
                            {reqItem.halfDayApproval === 'PENDING' ? (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                  onClick={() => handleApprovalAction(reqItem.id, 'APPROVED')}
                                >
                                  Approve (Half Day)
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#EF4444', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                  onClick={() => handleApprovalAction(reqItem.id, 'REJECTED')}
                                >
                                  Reject (Absent)
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Completed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SHIFT MANAGER APPROVALS VIEW */}
        {activeTab === 'shiftApprovals' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ marginBottom: 20 }}>
                <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                  Unclocked Shift Manager Approvals
                </h3>
                <p style={{ fontSize: 13, color: '#64748B' }}>
                  Notifications for employees who missed clock-in by <strong>10:30 AM</strong> (First Shift) or <strong>9:30 PM</strong> (Second Shift). Approve as Present or Mark Absent.
                </p>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : shiftApprovals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#64748B', background: '#F8FAFC', borderRadius: 12, border: '1px stroke #E2E8F0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>No Pending Shift Approvals</h4>
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
                    All employees clocked in on time or no unclocked shifts require approval.
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Shift</th>
                        <th>Cutoff Missed Reason</th>
                        <th>Approval Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftApprovals.map((reqItem) => (
                        <tr key={reqItem.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{reqItem.user?.name}</div>
                            <div style={{ fontSize: 12, color: '#64748B' }}>{reqItem.user?.email}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{reqItem.shift === 'SECOND_SHIFT' ? '🌆' : '🌅'}</span>
                              <span>{reqItem.shift === 'SECOND_SHIFT' ? 'Evening Shift (4:00 PM – 9:00 PM)' : 'Morning Shift (6:00 AM – 10:00 AM)'}</span>
                            </div>
                          </td>
                          <td style={{ maxWidth: 260 }}>
                            <p style={{ fontSize: 12.5, color: '#DC2626', fontWeight: 600, margin: 0 }}>
                              {reqItem.approvalReason || 'No clock-in detected by cutoff time'}
                            </p>
                          </td>
                          <td>
                            {reqItem.managerApproval === 'PENDING' ? (
                              <span style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                🔔 Manager Review Required
                              </span>
                            ) : reqItem.managerApproval === 'APPROVED_PRESENT' ? (
                              <span style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                ✓ Approved Present
                              </span>
                            ) : (
                              <span style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                ✕ Marked Absent
                              </span>
                            )}
                          </td>
                          <td>
                            {reqItem.managerApproval === 'PENDING' ? (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#059669', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                  onClick={() => handleShiftApprovalAction(reqItem.id, 'APPROVED_PRESENT')}
                                >
                                  Approve Present
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#DC2626', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                  onClick={() => handleShiftApprovalAction(reqItem.id, 'APPROVED_ABSENT')}
                                >
                                  Mark Absent
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Completed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Employee Detail Modal — Calendar + Salary */}
      {detailEmployee && (
        <div className="modal-backdrop" onClick={() => setDetailEmployee(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 760, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 16 }}>
              <div>
                <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                  {detailEmployee.emp.name}
                </h2>
                <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 2 }}>{detailEmployee.emp.email}</p>
              </div>
              <button className="modal-close" onClick={() => setDetailEmployee(null)}>✕</button>
            </div>

            <div style={{ padding: '20px 0' }}>
              {/* Salary Generated Card */}
              <div style={{
                background: 'linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)',
                border: '1px solid #E0E7FF',
                borderRadius: 12,
                padding: '18px 22px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E52A0F', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Salary Generated — {MONTHS[month - 1]} {year}
                  </p>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {detailEmployee.item.breakdown ? fmtCurrency(detailEmployee.item.breakdown.grossSalary) : fmtCurrency(0)}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    { label: 'Base Salary', val: fmtCurrency(detailEmployee.emp.hourlyRate) + '/mo' },
                    { label: 'Full Days', val: String(detailEmployee.item.breakdown?.fullDays ?? 0) },
                    { label: 'Half Days', val: String(detailEmployee.item.breakdown?.halfDays ?? 0) },
                    { label: 'Leads', val: String(detailEmployee.item.totalLeadsAssigned ?? 0) },
                    { label: 'Sales Revenue', val: fmtCurrency(detailEmployee.item.totalSalesRevenue ?? 0) },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', marginTop: 2 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attendance Calendar */}
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14 }}>
                Attendance — {MONTHS[month - 1]} {year}
              </h4>

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading attendance...</div>
              ) : (
                <>
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                    {[
                      { color: '#DCFCE7', border: '#86EFAC', text: '#15803D', label: 'Present' },
                      { color: '#FEF9C3', border: '#FDE047', text: '#854D0E', label: 'Half Day' },
                      { color: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C', label: 'Absent' },
                      { color: '#F1F5F9', border: '#CBD5E1', text: '#475569', label: 'Weekend' },
                    ].map(({ color, border, text, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${border}` }} />
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                    {DAY_LABELS.map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  {(() => {
                    const firstDay = new Date(year, month - 1, 1).getDay();
                    const daysInMonth = new Date(year, month, 0).getDate();
                    const cells: React.ReactNode[] = [];

                    // Build attendance lookup by day
                    const byDay: Record<number, AttendanceRecord> = {};
                    detailAttendance.forEach(r => {
                      const d = new Date(r.date).getDate();
                      byDay[d] = r;
                    });

                    // Empty leading cells
                    for (let i = 0; i < firstDay; i++) {
                      cells.push(<div key={`empty-${i}`} />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const rec = byDay[day];
                      const dateObj = new Date(year, month - 1, day);
                      const dow = dateObj.getDay();
                      const isWeekend = dow === 0; // Only Sunday is a holiday
                      const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

                      let bg = '#F8FAFC', border = '#E2E8F0', color = '#94A3B8';
                      let statusLabel = '';

                      if (isWeekend) {
                        bg = '#F1F5F9'; border = '#CBD5E1'; color = '#CBD5E1';
                      } else if (rec) {
                        if (rec.status === 'PRESENT') { bg = '#DCFCE7'; border = '#86EFAC'; color = '#15803D'; statusLabel = rec.isLate ? 'Late' : 'Present'; }
                        else if (rec.status === 'HALF_DAY') { bg = '#FEF9C3'; border = '#FDE047'; color = '#854D0E'; statusLabel = 'Half Day'; }
                        else if (rec.status === 'ON_LEAVE') { bg = '#EDE9FE'; border = '#C4B5FD'; color = '#6D28D9'; statusLabel = 'Leave'; }
                      } else if (!isWeekend && dateObj < new Date()) {
                        bg = '#FEE2E2'; border = '#FCA5A5'; color = '#B91C1C'; statusLabel = 'Absent';
                      }

                      cells.push(
                        <div
                          key={day}
                          title={rec ? `In: ${fmtTime(rec.clockIn)} | Out: ${fmtTime(rec.clockOut)}${rec.salesRevenue != null ? ` | Sales: ₹${rec.salesRevenue}` : ''}` : statusLabel}
                          style={{
                            background: bg,
                            border: `1px solid ${border}`,
                            borderRadius: 8,
                            padding: '6px 3px 5px',
                            textAlign: 'center',
                            outline: isToday ? '2px solid #E52A0F' : 'none',
                            outlineOffset: 2,
                            transition: 'transform 0.1s',
                            minHeight: 56,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color }}>{day}</div>
                          {statusLabel && (
                            <div style={{ fontSize: 9, fontWeight: 600, color, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {statusLabel}
                            </div>
                          )}
                          {rec && rec.salesRevenue != null && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                color: rec.salesRevenue > 0 ? '#047857' : '#64748B',
                                background: rec.salesRevenue > 0 ? '#D1FAE5' : '#F1F5F9',
                                padding: '1px 5px',
                                borderRadius: 4,
                                marginTop: 2,
                                border: rec.salesRevenue > 0 ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ₹{rec.salesRevenue.toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                        {cells}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Add New User</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="modal-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alice Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="alice@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as any)}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Monthly Base Salary (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={hourlyRate}
                    onChange={e => setHourlyRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Office WiFi SSID</label>
                <input
                  type="text"
                  required
                  value={officeSsid}
                  onChange={e => setOfficeSsid(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Edit User Details</h2>
              <button className="modal-close" onClick={() => setEditingUser(null)}>✕</button>
            </div>

            <form onSubmit={handleUpdateUser} className="modal-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as any)}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Monthly Base Salary (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={hourlyRate}
                    onChange={e => setHourlyRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Office WiFi SSID</label>
                <input
                  type="text"
                  required
                  value={officeSsid}
                  onChange={e => setOfficeSsid(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
