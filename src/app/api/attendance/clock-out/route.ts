import { NextRequest } from 'next/server';
import { z } from 'zod';
import { differenceInMinutes, parseISO } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate } from '@/lib/dateUtils';
import { evaluateClockOut, getShiftConfig, ShiftType } from '@/lib/shiftUtils';

const Schema = z.object({
  timestamp: z.string().datetime(),
  isEarlyLeave: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const userId = authUser.userId;
  const { timestamp, isEarlyLeave, reason } = parsed.data;
  const now = parseISO(timestamp);
  const today = getTodayISTDate(now);

  try {
    const record = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (!record?.clockIn) return Response.json({ error: 'You have not clocked in today' }, { status: 400 });
    if (record.clockOut) return Response.json({ error: 'Already clocked out for today' }, { status: 400 });

    const totalMinutes = differenceInMinutes(now, record.clockIn);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

    const recordShift = (record.shift as ShiftType) || 'FIRST_SHIFT';
    const shiftConfig = getShiftConfig(recordShift);
    const evalClockOut = evaluateClockOut(now, recordShift);

    const isEarlyDeparture = !evalClockOut.allowed || isEarlyLeave;

    // Block clock-out if before clock-out window unless early leave is explicitly requested
    if (!evalClockOut.allowed && !isEarlyLeave) {
      return Response.json(
        { error: `Clock-out opens at ${shiftConfig.clockOutOpenLabel} for ${shiftConfig.name}. Use "Request Early Leave" to submit request.` },
        { status: 400 }
      );
    }

    let halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'NONE';
    let status = record.status;
    let message = 'Clocked out successfully!';

    if (isEarlyDeparture) {
      halfDayApproval = 'PENDING';
      message = 'Early leave request submitted to Admin! Pending approval.';
    }

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        totalHours,
        status,
        halfDayApproval,
        halfDayReason: isEarlyDeparture ? (reason || `Requested early leave before ${shiftConfig.clockOutOpenLabel}`) : null,
      },
    });

    return Response.json({
      success: true,
      attendance: updated,
      isEarlyDeparture,
      message,
    });
  } catch (err) {
    return Response.json({ error: 'Failed to clock out', details: String(err) }, { status: 500 });
  }
}
