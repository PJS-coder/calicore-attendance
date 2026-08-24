import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { calculateSalaryFromUserAndRecords } from '@/lib/salary';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);
  try {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const [employees, allRecords] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true, name: true, email: true, role: true, officeSsid: true,
          hourlyRate: true, createdAt: true,
          salaryRules: true,
        },
      }),
      prisma.attendance.findMany({
        where: { date: { gte: start, lte: end } },
        select: {
          userId: true, clockOut: true, totalHours: true, isLate: true,
          lateMinutes: true, status: true, leadsAssigned: true, salesRevenue: true,
        },
      }),
    ]);

    const recordsByUserId = new Map<string, typeof allRecords>();
    for (const rec of allRecords) {
      let list = recordsByUserId.get(rec.userId);
      if (!list) {
        list = [];
        recordsByUserId.set(rec.userId, list);
      }
      list.push(rec);
    }

    let totalSalaryPayable = 0, totalLeadsAssigned = 0;
    const employeePayrolls = [];

    for (const emp of employees) {
      try {
        const userRecs = recordsByUserId.get(emp.id) || [];
        const breakdown = calculateSalaryFromUserAndRecords(emp, userRecs, year, month);
        totalSalaryPayable += breakdown.grossSalary;

        let empLeads = 0;
        let empSales = 0;
        for (const r of userRecs) {
          empLeads += r.leadsAssigned || 0;
          empSales += r.salesRevenue || 0;
        }

        totalLeadsAssigned += empLeads;
        employeePayrolls.push({
          user: emp,
          totalLeadsAssigned: empLeads,
          totalSalesRevenue: parseFloat(empSales.toFixed(2)),
          breakdown,
        });
      } catch (err) {
        employeePayrolls.push({ user: emp, totalLeadsAssigned: 0, totalSalesRevenue: 0, breakdown: null, error: String(err) });
      }
    }

    return Response.json({
      success: true,
      year,
      month,
      totalSalaryPayable: parseFloat(totalSalaryPayable.toFixed(2)),
      totalLeadsAssigned,
      totalEmployees: employees.length,
      employees: employeePayrolls,
    });
  } catch (err) {
    return Response.json({ error: 'Failed to calculate payroll', details: String(err) }, { status: 500 });
  }
}
