import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate, getISTTimeParts } from '@/lib/dateUtils';
import { getActiveShift, getShiftConfig, isApprovalTriggered, ShiftType } from '@/lib/shiftUtils';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const searchParams = req.nextUrl.searchParams;
  const requestedShift = (searchParams.get('shift') as ShiftType) || null;

  const now = new Date();
  const today = getTodayISTDate(now);
  const { hour: currentHour } = getISTTimeParts(now);

  const activeShift = requestedShift || getActiveShift(now);
  const shiftConfig = getShiftConfig(activeShift);

  try {
    let attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.userId, date: today } },
    });

    // Rule 1: If Early Leave request is still PENDING past 6 PM (18:00), automatically mark ABSENT
    if (attendance && attendance.halfDayApproval === 'PENDING' && currentHour >= 18) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          status: 'ABSENT',
          halfDayApproval: 'REJECTED',
          halfDayReason: 'Request expired after 6:00 PM without Admin approval',
        },
      });
    }

    // Rule 2: Missed Clock-Out Manager Approval Trigger
    // Triggered when user HAS clocked in, but DOES NOT clock out by cutoff (11:00 AM for Shift 1, 9:30 PM for Shift 2)
    const isClockedInNoOut = !!(attendance?.clockIn && !attendance?.clockOut);
    const approvalNeeded = isApprovalTriggered(now, activeShift);

    if (isClockedInNoOut && approvalNeeded && attendance && attendance.managerApproval === 'NONE') {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          shift: activeShift,
          managerApproval: 'PENDING',
          approvalReason: `Clocked in but did not clock out by ${shiftConfig.approvalTriggerLabel} for ${shiftConfig.name}. Awaiting Manager Approval.`,
        },
      });
    }

    return Response.json({
      success: true,
      attendance: attendance || null,
      activeShift,
      shiftConfig,
    });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch today record', details: String(err) }, { status: 500 });
  }
}
