import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseISO } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate } from '@/lib/dateUtils';
import { getActiveShift, evaluateClockIn, ShiftType } from '@/lib/shiftUtils';

// ── Config ────────────────────────────────────────────────────────────────────
const OFFICE_LAT    = parseFloat(process.env.OFFICE_LAT            ?? '28.6345');
const OFFICE_LNG    = parseFloat(process.env.OFFICE_LNG            ?? '77.285549');
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS_METERS    ?? '150', 10);

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const Schema = z.object({
  timestamp: z.string().datetime(),
  method: z.enum(['gps']),
  lat: z.number({ required_error: 'GPS latitude is required' }),
  lng: z.number({ required_error: 'GPS longitude is required' }),
  shift: z.enum(['FIRST_SHIFT', 'SECOND_SHIFT']).optional(),
});

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Clock-in failed: Invalid payload.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { timestamp, lat, lng, shift: requestedShift } = parsed.data;
  const now   = parseISO(timestamp);
  const today = getTodayISTDate(now);

  const activeShift = (requestedShift as ShiftType) || getActiveShift(now);

  try {
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (!user) return Response.json({ error: 'User profile not found' }, { status: 404 });

    // ── 1. Evaluate clock-in window against active shift ────────────────────
    const evaluation = evaluateClockIn(now, activeShift);
    if (!evaluation.allowed) {
      if (evaluation.isAbsent) {
        try {
          await prisma.attendance.upsert({
            where:  { userId_date: { userId: authUser.userId, date: today } },
            update: { status: 'ABSENT', shift: activeShift },
            create: { userId: authUser.userId, date: today, status: 'ABSENT', shift: activeShift, isLate: false, lateMinutes: 0 },
          });
        } catch { /* ignore non-critical */ }
        return Response.json({ error: evaluation.reason, absent: true }, { status: 423 });
      }
      return Response.json({ error: evaluation.reason }, { status: 400 });
    }

    // ── 2. GPS radius verification ──────────────────────────────────────────
    const distance = haversineDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
    if (distance > OFFICE_RADIUS) {
      return Response.json(
        { error: `Clock-in failed: You are ${Math.round(distance)}m away from the office. You must be within ${OFFICE_RADIUS}m to clock in.` },
        { status: 400 }
      );
    }

    const verificationMethod = 'gps';
    const wifiVerified = true;

    // ── 3. Database operations ──────────────────────────────────────────────
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date: today } },
    });

    if (existing?.clockIn) {
      return Response.json({ error: 'Already clocked in today' }, { status: 400 });
    }

    if (existing?.managerApproval === 'PENDING') {
      return Response.json(
        { error: `Approval request pending. Please call your manager for attendance approval.` },
        { status: 400 }
      );
    }

    const attendance = await prisma.attendance.upsert({
      where:  { userId_date: { userId: authUser.userId, date: today } },
      update: {
        clockIn: now,
        status: evaluation.status,
        shift: activeShift,
        isLate: evaluation.status === 'HALF_DAY',
        lateMinutes: evaluation.status === 'HALF_DAY' ? 30 : 0,
        wifiVerified,
        verificationMethod,
      },
      create: {
        userId: authUser.userId,
        date: today,
        clockIn: now,
        status: evaluation.status,
        shift: activeShift,
        isLate: evaluation.status === 'HALF_DAY',
        lateMinutes: evaluation.status === 'HALF_DAY' ? 30 : 0,
        wifiVerified,
        verificationMethod,
      },
    });

    return Response.json({
      success: true,
      attendance,
      message: evaluation.reason,
      verificationMethod,
      shift: activeShift,
    });
  } catch (err) {
    return Response.json({ error: 'Clock-in failed', details: String(err) }, { status: 500 });
  }
}
