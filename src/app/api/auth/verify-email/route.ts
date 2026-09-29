import { api, body } from "@/server/http";
import { currentUser } from "@/server/auth/session";
import { verifyEmail } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const { token } = await body<{ token: string }>(req);
  await verifyEmail(token);
  return { redirect: (await currentUser()) ? "/dashboard" : "/login", message: "Email confirmed." };
});
