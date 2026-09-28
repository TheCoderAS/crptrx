import { api } from "@/server/http";
import { destroySession } from "@/server/auth/session";

export const POST = api(async () => {
  await destroySession("USER");
  return { redirect: "/" };
});
