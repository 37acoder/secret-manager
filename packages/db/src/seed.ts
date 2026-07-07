import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { name: "Demo Account" },
    update: {},
    create: { name: "Demo Account" }
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@example.test" },
    update: {},
    create: {
      accountId: account.id,
      email: "owner@example.test",
      passwordHash: "argon2id-demo-placeholder",
      role: "owner"
    }
  });

  const project = await prisma.project.upsert({
    where: { accountId_slug: { accountId: account.id, slug: "payments-demo" } },
    update: {},
    create: {
      accountId: account.id,
      name: "Payments Demo",
      slug: "payments-demo",
      createdByUserId: user.id
    }
  });

  await prisma.vault.upsert({
    where: {
      projectId_name_environment: {
        projectId: project.id,
        name: "payments-dev",
        environment: "dev"
      }
    },
    update: {},
    create: {
      projectId: project.id,
      name: "payments-dev",
      environment: "dev"
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
