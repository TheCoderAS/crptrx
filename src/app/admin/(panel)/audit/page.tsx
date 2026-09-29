import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await adminOrLogin();
  const { action, page } = await searchParams;
  const p = Math.max(0, Number(page ?? 0) || 0);
  const [rows, admins] = await Promise.all([
    prisma.auditLog.findMany({ where: action ? { action: { contains: action.toUpperCase() } } : {}, orderBy: { createdAt: "desc" }, skip: p * 100, take: 100 }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
  ]);
  const who = (t: string, id: string | null) => (t === "ADMIN" ? admins.find((a) => a.id === id)?.name ?? id : t === "USER" ? `user ${id?.slice(0, 8)}` : "system");
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" icon={<ScrollText className="size-6" />} tile="tile-slate" />
      <p className="muted">Permanent record of logins, document views, admin actions, settings changes and exports. Entries can&apos;t be edited or deleted.</p>
      <form className="flex gap-2"><input name="action" defaultValue={action} className="input max-w-xs" placeholder="Filter by action, e.g. KYC_DOC" /><button className="btn-secondary">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtIST(r.createdAt)}</td>
                <td>{who(r.actorType, r.actorId)}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs">{r.targetType}{r.targetId ? `:${r.targetId}` : ""}</td>
                <td className="max-w-xs text-xs break-all">{r.details ? JSON.stringify(r.details) : ""}</td>
                <td className="text-xs">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-sm">
        {p > 0 && <a className="underline" href={`?action=${action ?? ""}&page=${p - 1}`}>Newer</a>}
        {rows.length === 100 && <a className="underline" href={`?action=${action ?? ""}&page=${p + 1}`}>Older</a>}
      </div>
    </div>
  );
}
