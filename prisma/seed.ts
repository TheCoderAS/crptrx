/**
 * Idempotent first-run setup. Creates the super admin (if no admin exists)
 * and, for test phases, fills Test-mode deposit addresses and a starting rate
 * from environment settings when they're empty. Never touches Live settings.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function setIfMissing(key: string, value: unknown) {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return false;
  await prisma.setting.create({ data: { key, value: value as never, updatedBy: "seed" } });
  await prisma.settingsHistory.create({ data: { key, newValue: value as never, changedBy: "seed" } });
  return true;
}

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if ((await prisma.admin.count()) === 0) {
    if (!email || !password || password.length < 10) {
      console.log("[seed] No admin yet. Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD (10+ chars) to create one.");
    } else {
      await prisma.admin.create({ data: { name: "Owner", email, passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" } });
      await prisma.auditLog.create({ data: { actorType: "SYSTEM", action: "ADMIN_CREATED", details: { email, role: "SUPER_ADMIN", by: "seed" } } });
      console.log(`[seed] Super admin created: ${email}. Set up the authenticator app at first login.`);
    }
  }
  const tron = process.env.SEED_TEST_DEPOSIT_TRON ?? "";
  const bsc = process.env.SEED_TEST_DEPOSIT_BSC ?? "";
  if (tron || bsc) {
    if (await setIfMissing("deposit_address", { TEST: { TRON: tron, BSC: bsc }, LIVE: { TRON: "", BSC: "" } }))
      console.log("[seed] Test deposit addresses set from environment.");
  }
  if (process.env.SEED_RATE && (await setIfMissing("rate", process.env.SEED_RATE))) console.log(`[seed] Starting rate set to ${process.env.SEED_RATE}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
