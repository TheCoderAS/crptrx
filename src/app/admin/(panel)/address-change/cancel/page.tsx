import { ShieldAlert } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { sha256 } from "@/server/crypto";
import { prisma } from "@/server/db";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { Banner, PageHeader } from "@/components/ui";

/** Target of the "Cancel this change" link emailed to all admins. */
export default async function CancelChange({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await adminOrLogin();
  const { token } = await searchParams;
  const c = token ? await prisma.depositAddressChange.findUnique({ where: { cancelTokenHash: sha256(token) } }) : null;
  if (!c) return <Banner inline tone="danger">This cancel link is not valid.</Banner>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Cancel deposit address change?" icon={<ShieldAlert className="size-6" />} tile="tile-rose" />
      <div className="card space-y-2">
        <p className="text-2xl font-bold">{NETWORK_INFO[c.network as NetworkCode].name}</p>
        <p className="text-sm">Mode: {c.networkMode}</p>
        <p className="text-sm">Current: <code className="break-all">{c.oldAddress ?? "(none)"}</code></p>
        <p className="text-sm">Requested: <code className="break-all">{c.newAddress}</code></p>
        <p className="text-sm">Takes effect: {fmtIST(c.effectiveAt)}</p>
      </div>
      {c.cancelledAt ? <Banner inline tone="ok">Already cancelled.</Banner> : c.appliedAt ? <Banner inline tone="danger">This change already took effect at {fmtIST(c.appliedAt)}. Set the correct address again from Settings (also delayed 1 hour) and pause the network if needed.</Banner> : (
        <ApiForm action="/api/admin/deposit-address/cancel">
          <input type="hidden" name="token" value={token} />
          <button className="btn-danger w-full">Cancel this change</button>
        </ApiForm>
      )}
    </div>
  );
}
