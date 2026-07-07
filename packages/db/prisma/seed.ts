import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { id: "demo-account" },
    update: {},
    create: {
      id: "demo-account",
      name: "Demo Account"
    }
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@example.test" },
    update: {},
    create: {
      accountId: account.id,
      email: "demo@example.test",
      passwordHash: "fake-argon2id-hash-for-local-demo-only",
      role: "owner"
    }
  });

  const project = await prisma.project.upsert({
    where: { accountId_slug: { accountId: account.id, slug: "demo" } },
    update: {},
    create: {
      accountId: account.id,
      name: "Demo Project",
      slug: "demo",
      createdByUserId: user.id
    }
  });

  await prisma.vault.create({
    data: {
      projectId: project.id,
      name: "Development",
      environment: "dev",
      grants: {
        create: {
          userId: user.id,
          role: "owner",
          createdByUserId: user.id
        }
      }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
