/**
 * src/lib/shiftUtils.ts
 *
 * Business logic and time window rules for First Shift (Morning) & Second Shift (Evening).
 *
 * Timings:
 *  - First Shift (Morning): 6:00 AM to 10:00 AM
 *    • Clock-in opens at 5:55 AM
 *    • On-time window: 5:55 AM – 6:25 AM -> PRESENT
 *    • Half-day window: 6:26 AM – 6:59 AM -> HALF_DAY
 *    • After 7:00 AM -> ABSENT (Clock-in locked)
 *    • Clock-out opens at 9:55 AM
 *    • No clock-in by 10:30 AM -> Manager Approval Request
 *
 *  - Second Shift (Evening): 4:00 PM to 9:00 PM (16:00 – 21:00)
 *    • Clock-in opens at 3:55 PM (15:55)
 *    • On-time window: 3:55 PM – 4:18 PM (15:55 – 16:18) -> PRESENT
 *    • Half-day window: 4:19 PM – 4:59 PM (16:19 – 16:59) -> HALF_DAY
 *    • After 5:00 PM (17:00) -> ABSENT (Clock-in locked)
 *    • Clock-out opens at 8:55 PM (20:55)
 *    • No clock-in by 9:30 PM (21:30) -> Manager Approval Request
 */

import { getISTTimeParts } from './dateUtils';

export type ShiftType = 'FIRST_SHIFT' | 'SECOND_SHIFT';

export interface ShiftConfig {
  type: ShiftType;
  name: string;
  shiftHoursLabel: string;
  clockInOpenLabel: string;
  onTimeCutoffLabel: string;
  absentCutoffLabel: string;
  clockOutOpenLabel: string;
  approvalTriggerLabel: string;
  clockInOpenMin: number;
  onTimeCutoffMin: number;
  absentCutoffMin: number;
  clockOutOpenMin: number;
  approvalTriggerMin: number;
}

export const SHIFT_CONFIGS: Record<ShiftType, ShiftConfig> = {
  FIRST_SHIFT: {
    type: 'FIRST_SHIFT',
    name: 'Morning Shift',
    shiftHoursLabel: '6:00 AM – 10:00 AM',
    clockInOpenLabel: '5:55 AM',
    onTimeCutoffLabel: '6:25 AM',
    absentCutoffLabel: '7:00 AM',
    clockOutOpenLabel: '9:55 AM',
    approvalTriggerLabel: '10:30 AM',
    clockInOpenMin: 5 * 60 + 55,       // 355 mins (5:55 AM)
    onTimeCutoffMin: 6 * 60 + 25,      // 385 mins (6:25 AM)
    absentCutoffMin: 7 * 60,           // 420 mins (7:00 AM)
    clockOutOpenMin: 9 * 60 + 55,      // 595 mins (9:55 AM)
    approvalTriggerMin: 10 * 60 + 30,  // 630 mins (10:30 AM)
  },
  SECOND_SHIFT: {
    type: 'SECOND_SHIFT',
    name: 'Evening Shift',
    shiftHoursLabel: '4:00 PM – 9:00 PM',
    clockInOpenLabel: '3:55 PM',
    onTimeCutoffLabel: '4:18 PM',
    absentCutoffLabel: '5:00 PM',
    clockOutOpenLabel: '8:55 PM',
    approvalTriggerLabel: '9:30 PM',
    clockInOpenMin: 15 * 60 + 55,      // 955 mins (3:55 PM)
    onTimeCutoffMin: 16 * 60 + 18,     // 978 mins (4:18 PM)
    absentCutoffMin: 17 * 60,          // 1020 mins (5:00 PM)
    clockOutOpenMin: 20 * 60 + 55,     // 1255 mins (8:55 PM)
    approvalTriggerMin: 21 * 60 + 30,  // 1290 mins (9:30 PM)
  },
};

/**
 * Determines active shift based on current time.
 * Morning (00:00 to 14:59) -> FIRST_SHIFT
 * Evening (15:00 to 23:59) -> SECOND_SHIFT
 */
export function getActiveShift(date: Date = new Date()): ShiftType {
  const { hour } = getISTTimeParts(date);
  return hour >= 15 ? 'SECOND_SHIFT' : 'FIRST_SHIFT';
}

/**
 * Returns shift config.
 */
export function getShiftConfig(shift?: ShiftType | string | null): ShiftConfig {
  if (shift === 'SECOND_SHIFT') return SHIFT_CONFIGS.SECOND_SHIFT;
  return SHIFT_CONFIGS.FIRST_SHIFT;
}

/**
 * Evaluates whether clock-in is allowed and calculates attendance status.
 */
export function evaluateClockIn(now: Date = new Date(), shift?: ShiftType) {
  const activeShift = shift || getActiveShift(now);
  const cfg = getShiftConfig(activeShift);
  const { totalMinutes } = getISTTimeParts(now);

  // Before clock-in window opens
  if (totalMinutes < cfg.clockInOpenMin) {
    return {
      allowed: false,
      isAbsent: false,
      reason: `Clock-in opens at ${cfg.clockInOpenLabel} for ${cfg.name}.`,
      status: 'ABSENT' as const,
      shift: activeShift,
    };
  }

  // After Absent cutoff
  if (totalMinutes >= cfg.absentCutoffMin) {
    return {
      allowed: false,
      isAbsent: true,
      reason: `Clock-in closed at ${cfg.absentCutoffLabel} for ${cfg.name}. Marked Absent.`,
      status: 'ABSENT' as const,
      shift: activeShift,
    };
  }

  // Half-day window
  if (totalMinutes > cfg.onTimeCutoffMin) {
    return {
      allowed: true,
      isAbsent: false,
      reason: `Clocked in after ${cfg.onTimeCutoffLabel} — marked Half Day.`,
      status: 'HALF_DAY' as const,
      shift: activeShift,
    };
  }

  // On-time window
  return {
    allowed: true,
    isAbsent: false,
    reason: `Clocked in on time for ${cfg.name} ✓`,
    status: 'PRESENT' as const,
    shift: activeShift,
  };
}

/**
 * Evaluates whether clock-out is allowed.
 */
export function evaluateClockOut(now: Date = new Date(), shift?: ShiftType) {
  const activeShift = shift || getActiveShift(now);
  const cfg = getShiftConfig(activeShift);
  const { totalMinutes } = getISTTimeParts(now);

  if (totalMinutes < cfg.clockOutOpenMin) {
    return {
      allowed: false,
      reason: `Clock-out opens at ${cfg.clockOutOpenLabel} for ${cfg.name}.`,
      shift: activeShift,
    };
  }

  return {
    allowed: true,
    reason: `Clock-out open for ${cfg.name} ✓`,
    shift: activeShift,
  };
}

/**
 * Checks if Manager Approval trigger is activated
 */
export function isApprovalTriggered(now: Date = new Date(), shift?: ShiftType): boolean {
  const activeShift = shift || getActiveShift(now);
  const cfg = getShiftConfig(activeShift);
  const { totalMinutes } = getISTTimeParts(now);
  return totalMinutes >= cfg.approvalTriggerMin;
}
