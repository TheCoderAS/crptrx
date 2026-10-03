import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { requestAddressChange } from "@/server/deposit";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { notifyAllAdmins } from "@/server/notify";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<{ network: NetworkCode; address: string; confirmNetwork: string; totp: string }>(req);
  if (!NETWORK_INFO[b.network]) throw new AppError("Choose a network.");
  // The confirmation step makes the admin re-type the network code, so the wrong field can't be changed by mistake.
  if (String(b.confirmNetwork ?? "").trim().toUpperCase() !== b.network) throw new AppError(`Type ${b.network} to confirm which network you are changing.`);
  await recheck2fa(a, b.totp, "deposit_address");
  const { change, token, immediate } = await requestAddressChange(b.network, String(b.address ?? ""), a.actor, a.ip);
  const name = NETWORK_INFO[b.network].name;
  if (immediate) {
    await notifyAllAdmins(
      `SECURITY: ${name} deposit address set`,
      `${a.admin.name} (${a.admin.email}) set the ${name} deposit address (${change.networkMode} mode).\n\nOld: ${change.oldAddress ?? "(none)"}\nNew: ${change.newAddress}\n\nIt is active now. If you did not expect this, sign in and set the correct address.`,
      "/admin/settings",
    );
    return { message: `Saved. The ${name} address is active now.` };
  }
  await notifyAllAdmins(
    `SECURITY: ${name} deposit address change requested`,
    `${a.admin.name} (${a.admin.email}) asked to change the ${name} deposit address (${change.networkMode} mode).\n\nOld: ${change.oldAddress ?? "(none)"}\nNew: ${change.newAddress}\n\nIt takes effect at ${fmtIST(change.effectiveAt)} (in ${Math.round((change.effectiveAt.getTime() - Date.now()) / 60000)} minutes).\n\nIf you did not expect this, cancel it now:\n${env.appUrl}/admin/address-change/cancel?token=${token}`,
    "/admin/settings",
  );
  return { message: `Requested. The new ${name} address takes effect at ${fmtIST(change.effectiveAt)}. All admins were alerted.` };
});
