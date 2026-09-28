import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/usdt_test";
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
