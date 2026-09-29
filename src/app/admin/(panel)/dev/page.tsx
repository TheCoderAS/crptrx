import { FlaskConical } from "lucide-react";
import { redirect } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { Banner, PageHeader } from "@/components/ui";

/** Test-phase helpers. Hidden unless DEV_TOOLS_ENABLED=true and the app is in Test mode. */
export default async function DevTools() {
  await adminOrLogin("SUPER_ADMIN");
  const s = await getSettings();
  if (!env.devToolsEnabled || s.network_mode !== "TEST") redirect("/admin");
  const mail = await prisma.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <div className="space-y-4">
      <PageHeader title="Test tools" icon={<FlaskConical className="size-6" />} tile="tile-amber" />
      <Banner tone="warn">Only available in Test mode with DEV_TOOLS_ENABLED=true. Turn it off before launch.</Banner>
      <ApiForm action="/api/dev/simulate-transfer" className="card space-y-3">
        <h2 className="h2">Simulate an incoming USDT payment</h2>
        <p className="muted">Pretends the watcher saw a final transfer, then runs the normal matching. Use the exact amount from an order to confirm it.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="network" className="input"><option value="TRON">Tron (TRC-20)</option><option value="BSC">BNB Smart Chain (BEP-20)</option></select>
          <input name="amount" required className="input" placeholder="e.g. 100.37" />
          <input name="to" className="input" placeholder="To address (default: active)" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wrongToken" /> Send as a fake look-alike token</label>
        <button className="btn-primary">Simulate</button>
      </ApiForm>
      <div className="card overflow-x-auto">
        <h2 className="h2 mb-2">Outbox (emails and SMS sent by the app)</h2>
        <table className="table">
          <thead><tr><th>Time</th><th>To</th><th>Subject / text</th><th>Status</th></tr></thead>
          <tbody>
            {mail.map((m) => (
              <tr key={m.id}><td className="whitespace-nowrap">{fmtIST(m.createdAt)}</td><td>{m.to}</td><td><b>{m.subject}</b><pre className="max-w-xl text-xs whitespace-pre-wrap">{m.body}</pre></td><td>{m.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
