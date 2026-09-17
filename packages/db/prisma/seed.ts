import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Demo program with REAL, live-verifiable hosts so the live ownership check
  // (TLS cert SAN + DNS) passes against authentic data. Policy text is
  // illustrative, not a real program's scope.
  const acme = await prisma.program.upsert({
    where: { platform_handle: { platform: 'HACKERONE', handle: 'example-demo' } },
    update: {},
    create: {
      platform: 'HACKERONE',
      handle: 'example-demo',
      name: 'Example Corp (demo)',
      policyRaw:
        'In scope: example.com, www.example.com. Out of scope: internal.example.com. ' +
        'No DoS, no social engineering. Rewards: Critical $5000, High $2000. (Illustrative demo policy.)',
      parsedScope: {
        inScope: ['example.com', 'www.example.com'],
        outOfScope: ['internal.example.com'],
        prohibited: ['DoS', 'social engineering'],
      },
      parseConfidence: 0.86,
      ambiguityFlags: [],
      maxBountyUsd: 5000,
      score: 0.72,
      active: false,
    },
  });

  await prisma.program.upsert({
    where: { platform_handle: { platform: 'BUGCROWD', handle: 'iana-demo' } },
    update: {},
    create: {
      platform: 'BUGCROWD',
      handle: 'iana-demo',
      name: 'IANA reserved (demo)',
      policyRaw:
        'In scope: iana.org, www.iana.org. Prohibited: automated scanning ' +
        'without approval. Rewards up to $3000. (Illustrative demo policy.)',
      parsedScope: {
        inScope: ['iana.org', 'www.iana.org'],
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
