import { PrismaClient, Role } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed providers (gyms)
  const ifitness = await db.provider.upsert({
    where: { gymCode: 'GYM-001' },
    update: {},
    create: {
      gymCode: 'GYM-001',
      gymName: 'iFitness Lekki',
      phone: '+2348100000001',
      email: 'lekki@ifitness.com',
      location: '14 Admiralty Way, Lekki Phase 1',
      lga: 'Eti-Osa',
      state: 'Lagos',
    },
  });

  await db.provider.upsert({
    where: { gymCode: 'GYM-002' },
    update: {},
    create: {
      gymCode: 'GYM-002',
      gymName: 'EkoFit V.I.',
      phone: '+2348100000002',
      email: 'vi@ekofit.com',
      location: '5 Akin Adesola St, Victoria Island',
      lga: 'Eti-Osa',
      state: 'Lagos',
    },
  });

  await db.provider.upsert({
    where: { gymCode: 'GYM-003' },
    update: {},
    create: {
      gymCode: 'GYM-003',
      gymName: 'FitnessOne Ikeja',
      phone: '+2348100000003',
      email: 'ikeja@fitnessone.com',
      location: '12 Awolowo Way, Ikeja GRA',
      lga: 'Ikeja',
      state: 'Lagos',
    },
  });

  // Seed enrollee member (demo)
  const member = await db.member.upsert({
    where: { memberRef: '21000645/0' },
    update: {},
    create: {
      memberRef: '21000645/0',
      firstName: 'Favour',
      lastName: 'Komoni',
      phone: '+2348012345678',
      email: 'favour.komoni@example.com',
      role: Role.ENROLLEE,
      sessionsPerMonth: 12,
      sessionsUsed: 6,
      resetDate: new Date('2026-05-01'),
    },
  });

  // Seed advocate
  await db.member.upsert({
    where: { memberRef: 'ADV-001' },
    update: {},
    create: {
      memberRef: 'ADV-001',
      firstName: 'Demo',
      lastName: 'Advocate',
      phone: '+2348099999999',
      email: 'advocate@leadway.com',
      role: Role.ADVOCATE,
      sessionsPerMonth: 0,
      sessionsUsed: 0,
    },
  });

  // Seed FWA case
  await db.fwaCase.upsert({
    where: { caseRef: 'FWA-2026-041' },
    update: {},
    create: {
      caseRef: 'FWA-2026-041',
      memberId: member.id,
      providerId: ifitness.id,
      flagType: 'MEMBER_DENIED_VISIT',
      status: 'OPEN',
      description: 'Member denied visit via WhatsApp confirmation. Provider claims session occurred.',
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
