const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const applications = await prisma.loanApplication.findMany();

  for (const app of applications) {
    const applicantParts = (app.applicantName || '').trim().split(' ');
    const guardianParts = (app.guardianName || '').trim().split(' ');

    await prisma.loanApplication.update({
      where: { id: app.id },
      data: {
        applicantFirstName: applicantParts[0] || null,
        applicantMiddleName:
          applicantParts.length > 2
            ? applicantParts.slice(1, -1).join(' ')
            : null,
        applicantLastName:
          applicantParts.length > 1
            ? applicantParts[applicantParts.length - 1]
            : null,

        guardianFirstName: guardianParts[0] || null,
        guardianMiddleName:
          guardianParts.length > 2
            ? guardianParts.slice(1, -1).join(' ')
            : null,
        guardianLastName:
          guardianParts.length > 1
            ? guardianParts[guardianParts.length - 1]
            : null,
      },
    });
  }

  console.log('Migration completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());