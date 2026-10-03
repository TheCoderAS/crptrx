import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { cancelAddressChange } from "@/server/deposit";
import { notifyAllAdmins } from "@/server/notify";

/** Any active admin can cancel (with the emailed token or from the settings page). */
export const POST = api(async (req: Request) => {
  const a = await adminCtx();
  const b = await body<{ token?: string; id?: string }>(req);
  const c = await cancelAddressChange({ token: b.token || undefined, id: b.id || undefined }, a.actor, a.ip);
  await notifyAllAdmins(`Deposit address change cancelled`, `${a.admin.name} cancelled the ${c.network} deposit address change to ${c.newAddress}.`, "/admin/settings");
  return { message: "Cancelled. The address was not changed.", redirect: "/admin/settings" };
});
