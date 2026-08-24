import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { getMonthBounds } from '@/lib/dateUtils';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);
  try {
    const { start, end } = getMonthBounds(year, month);
    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { date: 'asc' },
    });
    let totalSalesRevenue = 0, totalLeadsAssigned = 0, totalPresentDays = 0, totalLateDays = 0, totalHalfDays = 0, totalNormalDays = 0;
    const dailySalesMap: Record<string, number> = {};
    records.forEach(r => {
      totalSalesRevenue += r.salesRevenue ?? 0;
      totalLeadsAssigned += r.leadsAssigned ?? 0;
      const dayKey = r.date.toISOString().split('T')[0];
      dailySalesMap[dayKey] = (dailySalesMap[dayKey] ?? 0) + (r.salesRevenue ?? 0);
      totalPresentDays++;
      if (r.isLate) totalLateDays++;
      if (r.status === 'HALF_DAY' || r.halfDayApproval === 'APPROVED') totalHalfDays++;
      if (r.status === 'PRESENT' && !r.isLate) totalNormalDays++;
    });
    return Response.json({ success: true, totalSalesRevenue: parseFloat(totalSalesRevenue.toFixed(2)), totalLeadsAssigned, attendanceBreakdown: { totalPresentDays, totalNormalDays, totalLateDays, totalHalfDays }, dailySalesTrend: Object.entries(dailySalesMap).map(([date, revenue]) => ({ date, revenue })) });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch analytics', details: String(err) }, { status: 500 });
  }
}
