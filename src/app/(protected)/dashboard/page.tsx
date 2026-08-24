// apps/web/src/app/(protected)/dashboard/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, extractError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { useLocationVerification } from '../../../hooks/useLocationVerification';
import { AttendanceRecord } from '../../../types';
import {
  getActiveShift,
  getShiftConfig,
  evaluateClockIn,
  evaluateClockOut,
  isApprovalTriggered,
  ShiftType,
  SHIFT_CONFIGS,
} from '../../../lib/shiftUtils';

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

export default function DashboardPage() {
  const { user } = useAuth();
  const { success, error: toastError, info, ToastContainer } = useToast();

  const [record, setRecord]         = useState<AttendanceRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setAction]  = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [currentHour, setCurrentHour] = useState<number>(0);
  const [currentMinute, setCurrentMinute] = useState<number>(0);

  // Active shift selection
  const [selectedShift, setSelectedShift] = useState<ShiftType>('FIRST_SHIFT');

  // GPS Geofencing + IP Whitelist verification
  const location = useLocationVerification();

  const [earlyLeaveReason, setEarlyLeaveReason] = useState<string>('');
  const [showEarlyLeaveModal, setShowEarlyLeaveModal] = useState(false);

  // Initialize active shift based on current time
  useEffect(() => {
    const active = getActiveShift();
    setSelectedShift(active);
  }, []);

  // Live time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));
      setCurrentHour(now.getHours());
      setCurrentMinute(now.getMinutes());
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        success: boolean;
        attendance: AttendanceRecord | null;
        activeShift: ShiftType;
      }>('/attendance/today', { params: { shift: selectedShift } });

      setRecord(res.data.attendance);
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedShift, toastError]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const shiftConfig = getShiftConfig(selectedShift);
  const evalIn     = evaluateClockIn(new Date(), selectedShift);
  const evalOut    = evaluateClockOut(new Date(), selectedShift);

  const isClockedIn   = !!(record?.clockIn && !record.clockOut);
  const isClockedOut  = !!(record?.clockIn && record.clockOut);

  // Manager Approval is pending ONLY when user has clocked in, but has not clocked out past the cutoff (10:30 AM for Shift 1 / 9:30 PM for Shift 2)
  const isApprovalPending = isClockedIn && (
    record?.managerApproval === 'PENDING' || isApprovalTriggered(new Date(), selectedShift)
  );

  const handleClockIn = async () => {
    if (isApprovalPending) {
      toastError(`Clock-in closed. No clock-in by ${shiftConfig.approvalTriggerLabel}. Call your manager for approval.`);
      return;
    }
    if (!evalIn.allowed) {
      toastError(evalIn.reason);
      return;
    }
    if (location.status === 'checking') {
      toastError('Verifying your location, please wait…');
      return;
    }
    if (!location.canClockIn || location.status !== 'gps_ok') {
      toastError(location.label || 'You are outside office range. Clock-in is only allowed at the office.');
      return;
    }

    setAction(true);
    try {
      const payload: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        method:    'gps',
        lat:       location.coords?.lat,
        lng:       location.coords?.lng,
        shift:     selectedShift,
      };
      const res = await api.post('/attendance/clock-in', payload);
      setRecord(res.data.attendance);
      success(res.data.message || 'Clocked In successfully!');
      if (res.data.attendance.status === 'HALF_DAY') {
        info(`⚠️ Clocked in after ${shiftConfig.onTimeCutoffLabel} — marked Half Day`);
      }
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  const handleClockOut = async () => {
    if (!evalOut.allowed) {
      toastError(`Clock-out opens at ${shiftConfig.clockOutOpenLabel}. Use "Request Early Leave" for an early exit.`);
      return;
    }

    setAction(true);
    try {
      const res = await api.post('/attendance/clock-out', {
        timestamp: new Date().toISOString(),
      });
      setRecord(res.data.attendance);
      success(res.data.message || 'Clocked Out successfully!');
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  const submitEarlyLeave = async () => {
    setAction(true);
    try {
      const res = await api.post('/attendance/clock-out', {
        timestamp: new Date().toISOString(),
        isEarlyLeave: true,
        reason: earlyLeaveReason || `Early Leave request before ${shiftConfig.clockOutOpenLabel}`,
      });
      setRecord(res.data.attendance);
      setShowEarlyLeaveModal(false);
      success('Early Leave Request submitted to Admin Panel!');
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  return (
    <div className="page">
      <ToastContainer />

      {/* ── Location Permission Modal Popup ────────────────────────── */}
      {location.gpsPermission === 'denied' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-modal-title"
          className="location-modal-backdrop"
        >
          <div className="location-modal-card">
            <div className="location-modal-icon-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>

            <h3 id="location-modal-title" className="location-modal-title">
              Turn On Location Access
            </h3>

            <p className="location-modal-desc">
              GPS verification is required to clock in & out for your shift. Please turn on location access to continue.
            </p>

            <button onClick={location.refresh} className="location-modal-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Turn On Location
            </button>

            <div className="location-modal-hint">
              🔒 If blocked: Tap lock icon in address bar → Allow Location
            </div>
          </div>
        </div>
      )}

      {/* Main Full Page Card */}
      <div className="fullpage-clock-card">

        {/* Shift Selection Pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
          {(['FIRST_SHIFT', 'SECOND_SHIFT'] as ShiftType[]).map((st) => {
            const cfg = SHIFT_CONFIGS[st];
            const isSelected = selectedShift === st;
            return (
              <button
                key={st}
                onClick={() => setSelectedShift(st)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 20,
                  fontSize: 12.5,
                  fontWeight: 700,
                  border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                  background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  color: isSelected ? '#1D4ED8' : '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{st === 'FIRST_SHIFT' ? '🌅' : '🌆'}</span>
                <span>{cfg.name}</span>
                <span style={{ fontSize: 11, opacity: 0.85 }}>({cfg.shiftHoursLabel})</span>
              </button>
            );
          })}
        </div>
        
        {/* Top Time & Date */}
        <div className="clock-time-display">{currentTime || '06:00 AM'}</div>
        <div className="clock-date-display">{currentDate || 'Today'}</div>

        {/* Manager Approval Banner / Attendance Status */}
        {isApprovalPending ? (
          <div className="completed-attendance-wrapper" style={{ margin: '20px auto' }}>
            <div
              className="completed-orb-badge"
              style={{
                background: '#FEF2F2',
                borderColor: '#FCA5A5',
                padding: '24px 20px',
                maxWidth: 420,
                borderRadius: 24,
                boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.15)',
              }}
            >
              <div
                className="completed-icon-circle"
                style={{ background: '#DC2626', width: 64, height: 64 }}
              >
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>

              <span className="completed-badge-title" style={{ color: '#991B1B', fontSize: 18, marginTop: 12, display: 'block' }}>
                CALL YOUR MANAGER FOR APPROVAL
              </span>

              <p style={{ fontSize: 13.5, color: '#B91C1C', fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
                Clocked in, but no clock-out detected by <strong>{shiftConfig.approvalTriggerLabel}</strong> for {shiftConfig.name}.
              </p>

              <p style={{ fontSize: 12, color: '#7F1D1D', marginTop: 6 }}>
                An attendance approval request has been sent to the Admin Panel. Please contact your manager to approve your attendance as Present or Absent.
              </p>

              <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={fetchToday}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 20,
                    background: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>🔄</span> Refresh Status
                </button>
              </div>
            </div>
          </div>
        ) : isClockedOut ? (
          record?.halfDayApproval === 'PENDING' ? (
            <div className="completed-attendance-wrapper">
              <div className="completed-orb-badge pending-approval-orb">
                <div className="completed-icon-circle pending-circle-pulse">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <span className="completed-badge-title pending-title">PENDING APPROVAL</span>
                <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600, marginTop: 4 }}>
                  Early leave request submitted to Admin
                </p>
                <p style={{ fontSize: 11.5, color: '#B45309', fontWeight: 500, marginTop: 2 }}>
                  Awaiting Admin response. Unapproved requests will be marked Absent.
                </p>
              </div>
            </div>
          ) : (
            <div className="completed-attendance-wrapper">
              <div className="completed-orb-badge">
                <div className="completed-icon-circle">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="completed-badge-title">
                  {record?.status === 'HALF_DAY'
                    ? 'HALF DAY'
                    : record?.status === 'ABSENT'
                    ? 'ABSENT'
                    : 'DAY COMPLETED'}
                </span>
                <p style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginTop: 4 }}>
                  Shift Completed: {shiftConfig.name}
                </p>
              </div>
            </div>
          )
        ) : (
          <>
            {/* Shift timing notice pill */}
            {!evalIn.allowed && evalIn.isAbsent && !isClockedIn && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 800, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🚫</span> Clock-in closed at {shiftConfig.absentCutoffLabel} — You are marked <span style={{ marginLeft: 4, background: '#DC2626', color: '#fff', borderRadius: 6, padding: '1px 7px', fontSize: 11 }}>ABSENT</span>
              </div>
            )}

            {!evalIn.allowed && !evalIn.isAbsent && !isClockedIn && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Shift Clock-In Opens at {shiftConfig.clockInOpenLabel}
              </div>
            )}

            {/* Half day warning pill */}
            {evalIn.allowed && evalIn.status === 'HALF_DAY' && !isClockedIn && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> After {shiftConfig.onTimeCutoffLabel} — clocking in now will mark Half Day
              </div>
            )}

            {/* Clock-out timing notice */}
            {isClockedIn && !evalOut.allowed && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#B45309', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Clock-Out Opens at {shiftConfig.clockOutOpenLabel}
              </div>
            )}

            <button
              className={`center-orb-button ${isClockedIn ? 'clock-out' : ''}`}
              onClick={isClockedIn ? handleClockOut : handleClockIn}
              disabled={loading || actionLoading}
              title={
                !evalIn.allowed && !isClockedIn
                  ? `Shift opens at ${shiftConfig.clockInOpenLabel}`
                  : !isClockedIn && (!location.canClockIn || location.status !== 'gps_ok')
                  ? location.label
                  : (isClockedIn && !evalOut.allowed ? `Clock-out opens at ${shiftConfig.clockOutOpenLabel}. Use Request Early Leave for an early exit.` : '')
              }
            >
              {actionLoading ? (
                <span className="spinner" style={{ width: 32, height: 32 }} />
              ) : (
                <>
                  <svg className="orb-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                    <path d="M18 8a2 2 0 0 1 2 2v4a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.8-5.6-2.4l-2.7-4c-.4-.6-.4-1.4.1-1.9v0c.5-.5 1.4-.5 1.9-.1L7 11.5" />
                  </svg>
                  <span className="orb-text">{isClockedIn ? 'CLOCK OUT' : 'CLOCK IN'}</span>
                </>
              )}
            </button>
          </>
        )}

        {/* ── Location Verification Badge ─────────────────────────────── */}
        {(() => {
          const s = location.status;
          const bgColor   = s === 'gps_ok'       ? '#ECFDF5'
                          : s === 'checking'     ? '#F8FAFC'
                          : '#FEF2F2';
          const dotColor  = s === 'gps_ok'       ? '#059669'
                          : s === 'checking'     ? '#94A3B8'
                          : '#DC2626';
          const dotShadow = s === 'gps_ok'       ? '0 0 0 3px rgba(5,150,105,0.2)'
                          : s === 'checking'     ? '0 0 0 3px rgba(148,163,184,0.2)'
                          : '0 0 0 3px rgba(220,38,38,0.2)';
          const borderColor = s === 'gps_ok'     ? '#A7F3D0'
                            : s === 'checking'   ? '#E2E8F0'
                            : '#FCA5A5';
          const textColor = s === 'gps_ok'       ? '#047857'
                          : s === 'checking'     ? '#64748B'
                          : '#B91C1C';

          const dotAnim = s === 'checking' ? 'pulse 1.2s ease-in-out infinite' : 'none';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: 12 }}>
              <div
                className="location-tag"
                style={{ background: bgColor, borderColor, padding: '8px 16px', gap: 8 }}
              >
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: dotColor,
                  boxShadow: dotShadow,
                  flexShrink: 0,
                  animation: dotAnim,
                }} />

                <span style={{ color: textColor, fontWeight: 800, fontSize: 12 }}>
                  {location.label}
                </span>

                <button
                  onClick={location.refresh}
                  disabled={s === 'checking'}
                  style={{
                    marginLeft: 4,
                    padding: '3px 9px',
                    borderRadius: 20,
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    cursor: s === 'checking' ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: s === 'checking' ? 0.55 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  title="Re-check location"
                >
                  <svg
                    width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.8"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: s === 'checking' ? 'spin 0.8s linear infinite' : 'none' }}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                    <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
                  </svg>
                  {s === 'checking' ? 'Checking…' : 'Refresh'}
                </button>
              </div>

              {(s === 'out_of_range' || s === 'error') && !isClockedIn && (
                <span style={{ fontSize: 10.5, color: '#991B1B', background: '#FEE2E2', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>
                  🚫 You must be inside the office location range to clock in
                </span>
              )}

              {s === 'gps_ok' && location.distanceMeters !== null && (
                <span style={{ fontSize: 10, color: '#059669', letterSpacing: 0.3, fontWeight: 700 }}>
                  {location.distanceMeters}m from office · GPS verified
                </span>
              )}
            </div>
          );
        })()}

        {/* Early Leave Request Option when clocked in before clock-out window */}
        {isClockedIn && !isClockedOut && !evalOut.allowed && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              type="button"
              className="early-leave-request-btn"
              onClick={() => setShowEarlyLeaveModal(true)}
            >
              <span>🏃‍♂️</span> Request Early Leave (Before {shiftConfig.clockOutOpenLabel})
            </button>
          </div>
        )}

        {/* 3 Stat Cards */}
        <div className="three-stats-grid" style={{ marginTop: 20 }}>
          <div className="stat-pill-card">
            <div className="stat-pill-icon">↙</div>
            <div className="stat-pill-time">{formatTime(record?.clockIn ?? null)}</div>
            <div className="stat-pill-label">Clock In</div>
          </div>

          <div className="stat-pill-card">
            <div className="stat-pill-icon">↗</div>
            <div className="stat-pill-time">{formatTime(record?.clockOut ?? null)}</div>
            <div className="stat-pill-label">Clock Out</div>
          </div>

          <div className="stat-pill-card">
            <div className="stat-pill-icon">⏱</div>
            <div className="stat-pill-time">{record?.totalHours != null ? `${record.totalHours} hrs` : (record?.status || '—')}</div>
            <div className="stat-pill-label">Total Hours</div>
          </div>
        </div>

      </div>

      {/* Early Leave Request Modal */}
      {showEarlyLeaveModal && (
        <div className="modal-backdrop" onClick={() => setShowEarlyLeaveModal(false)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
                Early Leave Request ({shiftConfig.name})
              </h3>
              <button className="modal-close" onClick={() => setShowEarlyLeaveModal(false)}>✕</button>
            </div>
            
            <div style={{ padding: '16px 0' }}>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
                You are logging out before <strong>{shiftConfig.clockOutOpenLabel}</strong>. This request will be sent to the Admin Panel for manager approval.
              </p>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Reason for Early Leave (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Medical appointment / Personal emergency"
                  value={earlyLeaveReason}
                  onChange={e => setEarlyLeaveReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowEarlyLeaveModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#D97706', borderColor: '#D97706' }}
                onClick={submitEarlyLeave}
                disabled={actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Submit Early Leave Request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
