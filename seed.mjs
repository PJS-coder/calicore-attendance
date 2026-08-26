/**
 * seed.mjs
 * Wipes all data from the database and creates the Admin account and specified Employee accounts.
 * Run: node seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMPLOYEES = [
  { name: 'Tanushree', email: 'tanushree@calicore.gmail.com', pass: 'tanushree@calicore' },
  { name: 'Rohit',     email: 'rohit@calicore.gmail.com',     pass: 'rohit@calicore' },
  { name: 'Kunal',     email: 'kunal@calicore.gmail.com',     pass: 'kunal@calicore' },
  { name: 'Manish',    email: 'manish@calicore.gmail.com',    pass: 'manish@calicore' },
  { name: 'Subhash',   email: 'subhash@calicore.gmail.com',   pass: 'subhash@calicore' },
  { name: 'PJS',       email: 'pjs@calicore.gmail.com',       pass: 'pjs@calicore' },
];

async function main() {
  console.log('🗑️  Wiping all existing data (Attendance, SalaryRules, Users)...');

  // Delete in dependency order
  await prisma.attendance.deleteMany();
  await prisma.salaryRule.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ All old data cleared.');

  // Create Admin (Jitesh Admin)
  const adminHashedPassword = await bcrypt.hash('jitesh@001calicore', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'jitesh001@calicore.gmail.com',
      password: adminHashedPassword,
      name: 'Jitesh Admin',
      role: 'ADMIN',
      officeSsid: 'RH-2.4G-EDE610',
      hourlyRate: 0,
      salaryRules: {
        create: {
          baseSalary: 0,
          overtimeMultiplier: 1.5,
          latePenaltyPerMin: 1.0,
          officeStartTime: '09:00',
          workingHoursPerDay: 8.0,
        },
      },
    },
  });

  console.log(`✅ Admin created: ${admin.email}`);

  // Create Employees
  console.log('👤 Creating new employee accounts...');
  for (const emp of EMPLOYEES) {
    const hashedPassword = await bcrypt.hash(emp.pass, 10);
    const user = await prisma.user.create({
      data: {
        email: emp.email,
        password: hashedPassword,
        name: emp.name,
        role: 'EMPLOYEE',
        officeSsid: 'RH-2.4G-EDE610',
        hourlyRate: 100,
        salaryRules: {
          create: {
            baseSalary: 16000,
            overtimeMultiplier: 1.5,
            latePenaltyPerMin: 1.0,
            officeStartTime: '07:00',
            workingHoursPerDay: 8.0,
          },
        },
      },
    });
    console.log(`   - ${user.name} (${user.email}) [Pass: ${emp.pass}]`);
  }

  console.log('\n🚀 Done! All old accounts removed and new employees seeded successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

