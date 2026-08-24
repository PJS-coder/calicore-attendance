import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

/**
 * PUT /api/admin/shift-approvals/[attendanceId]
 * Body: { approval: 'APPROVED_PRESENT' | 'APPROVED_ABSENT' }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();

  const { attendanceId } = await params;
  const { approval, reason } = await req.json();

  if (!['APPROVED_PRESENT', 'APPROVED_ABSENT', 'REJECTED'].includes(approval)) {
    return Response.json(
      { error: 'Invalid approval status. Must be APPROVED_PRESENT, APPROVED_ABSENT, or REJECTED.' },
      { status: 400 }
    );
  }

  try {
    const newStatus = approval === 'APPROVED_PRESENT' ? 'PRESENT' : 'ABSENT';

    const record = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        managerApproval: approval,
        status: newStatus,
        approvalReason: reason || (approval === 'APPROVED_PRESENT' ? 'Approved Present by Manager' : 'Marked Absent by Manager'),
      },
    });

    return Response.json({ success: true, attendance: record });
  } catch (err) {
    return Response.json({ error: 'Failed to update shift approval', details: String(err) }, { status: 500 });
  }
}
