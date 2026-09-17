import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const acme = await prisma.program.upsert({
    where: { platform_handle: { platform: 'HACKERONE', handle: 'acme' } },
    update: {},
    create: {
      platform: 'HACKERONE',
      handle: 'acme',
      name: 'Acme Corp',
      policyRaw:
        'In scope: *.acme.com, api.acme.com. Out of scope: blog.acme.com. ' +
        'No DoS, no social engineering. Rewards: Critical $5000, High $2000.',
      parsedScope: {
        inScope: ['*.acme.com', 'api.acme.com'],
        outOfScope: ['blog.acme.com'],
        prohibited: ['DoS', 'social engineering'],
      },
      parseConfidence: 0.86,
      ambiguityFlags: ['wildcard *.acme.com needs human confirmation'],
      maxBountyUsd: 5000,
      score: 0.72,
      active: false,
    },
  });

  await prisma.program.upsert({
    where: { platform_handle: { platform: 'BUGCROWD', handle: 'globex' } },
    update: {},
    create: {
      platform: 'BUGCROWD',
      handle: 'globex',
      name: 'Globex',
      policyRaw:
        'Scope: app.globex.io, 203.0.113.0/24. Prohibited: automated scanning ' +
        'without approval. Rewards up to $3000.',
      parsedScope: {
        inScope: ['app.globex.io', '203.0.113.0/24'],
        outOfScope: [],
        prohibited: ['automated scanning without approval'],
      },
      parseConfidence: 0.91,
      ambiguityFlags: [],
      maxBountyUsd: 3000,
      score: 0.64,
      active: false,
    },
  });

  console.log(`seeded programs (acme=${acme.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
