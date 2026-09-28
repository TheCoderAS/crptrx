process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/usdt_test";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0".repeat(64);
process.env.EMAIL_PROVIDER = "console";
process.env.SMS_PROVIDER = "console";
// Keep test output readable.
const origLog = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === "string" && (args[0].startsWith("[email]") || args[0].startsWith("[sms]"))) return;
  origLog(...args);
};
