import {
  MembershipStatus,
  OrgRole,
  Plan,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const password = bcrypt.hashSync('password', 10);

const userData: Array<Omit<Prisma.UserCreateInput, 'memberships'>> = [
  {
    id: 'ddeb9fad-5d6a-46b8-b73f-7d29e5c50703',
    name: 'Abdullah Habberrih',
    email: 'habberrih@manara.ly',
    password,
    isSuperAdmin: true,
  },
  {
    id: '74e1900d-0ce4-4ab7-a4ad-74e28dbbb3cb',
    name: 'Layla Product',
    email: 'layla.product@manara.ly',
    password,
    isSuperAdmin: false,
  },
  {
    id: '1cb747c3-91de-4dca-87ef-3d233547f4b4',
    name: 'Omar Growth',
    email: 'omar.growth@manara.ly',
    password,
    isSuperAdmin: false,
  },
];

const organizationData: Array<
  Omit<
    Prisma.OrganizationCreateInput,
    'memberships' | 'subscriptions' | 'apiKeys'
  >
> = [
  {
    id: '5a1e0b32-6de9-4ec9-b41f-39d1df5a5f02',
    name: 'Minara Demo Org',
    slug: 'minara-demo',
    plan: Plan.PRO,
  },
  {
    id: 'b2d9c79f-4f5f-4a74-9a2b-6f4f3d3bffa6',
    name: 'Acme Collaboration Hub',
    slug: 'acme-collab',
    plan: Plan.FREE,
  },
];

const membershipData = [
  {
    userId: userData[0]?.id ?? '',
    organizationId: organizationData[0]?.id ?? '',
    role: OrgRole.OWNER,
    status: MembershipStatus.ACCEPTED,
  },
  {
    userId: userData[1]?.id ?? '',
    organizationId: organizationData[0]?.id ?? '',
    role: OrgRole.ADMIN,
    status: MembershipStatus.ACCEPTED,
  },
  {
    userId: userData[2]?.id ?? '',
    organizationId: organizationData[1]?.id ?? '',
    role: OrgRole.OWNER,
    status: MembershipStatus.ACCEPTED,
  },
  {
    userId: userData[1]?.id ?? '',
    organizationId: organizationData[1]?.id ?? '',
    role: OrgRole.MEMBER,
    status: MembershipStatus.PENDING,
  },
];

const apiKeySeeds = [
  {
    organizationId: organizationData[0]?.id ?? '',
    name: 'Demo Backend Key',
    rawSecret: 'manara_demo_backend_key_123',
  },
  {
    organizationId: organizationData[1]?.id ?? '',
    name: 'Acme Sandbox Key',
    rawSecret: 'acme_sandbox_key_456',
  },
];

async function main() {
  console.log(`Start seeding...`);
  // Users
  for (const user of userData) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        email: user.email,
        password: user.password,
        isSuperAdmin: user.isSuperAdmin ?? false,
        deletedAt: null,
      },
      create: user,
    });
  }
  console.log(`Users seeded.`);

  // Organizations
  for (const org of organizationData) {
    await prisma.organization.upsert({
      where: { id: org.id },
      update: {
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        deletedAt: null,
      },
      create: org,
    });
  }
  console.log(`Organizations seeded.`);

  // Memberships
  for (const membership of membershipData) {
    const { userId, organizationId, role, status } = membership;
    if (!userId || !organizationId) continue;

    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      update: {
        role,
        status,
        deletedAt: null,
      },
      create: membership,
    });
  }
  console.log(`Memberships seeded.`);

  // API Keys (hash secret before storing)
  for (const key of apiKeySeeds) {
    const { organizationId, name, rawSecret } = key;
    if (!organizationId) continue;
    const keyHash = createHash('sha256').update(rawSecret).digest('hex');
    await prisma.apiKey.upsert({
      where: { keyHash },
      update: {
        name,
        organizationId,
        deletedAt: null,
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        name,
        keyHash,
      },
    });
    console.log(`API key '${name}' secret: ${rawSecret}`);
  }
  console.log(`API keys seeded.`);

  console.log(`Seeding finished.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
