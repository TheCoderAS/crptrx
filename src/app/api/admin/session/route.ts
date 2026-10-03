import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { adminSessionTimes, touchAdminSession } from "@/server/auth/session";

const times = async () => {
  const t = (await adminSessionTimes())!;
  // Remaining time rather than clock times, so a wrong clock on the admin's computer doesn't matter.
  return { idleMs: t.idleEndsAt.getTime() - Date.now(), hardMs: t.hardEndsAt.getTime() - Date.now() };
};

/** How long until this admin session ends. Reading it doesn't count as activity. */
export const GET = api(async () => {
  await adminCtx();
  return times();
});

/** The admin did something (click, typing, opened a page): restart the 30-minute idle clock. */
export const POST = api(async () => {
  await adminCtx();
  await touchAdminSession();
  return times();
});
