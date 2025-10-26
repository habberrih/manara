import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const password = bcrypt.hashSync(process.env.USERS_PASSWORD || 'password', 10);

export const userData: Prisma.UserCreateInput[] = [
  {
    id: 'ddeb9fad-5d6a-46b8-b73f-7d29e5c50703',
    name: 'Abdullah Habberrih',
    email: 'habberrih@manara.ly',
    password,
    createdAt: new Date('2025-10-27'),
    updatedAt: new Date('2025-10-27'),
  },
];

async function main() {
  console.log(`Start seeding...`);
  // Idempotent seed: insert missing rows; ignore duplicates on unique keys
  await prisma.user.createMany({
    data: userData,
    skipDuplicates: true,
  });
  console.log(`Users seeded (createMany with skipDuplicates).`);

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
