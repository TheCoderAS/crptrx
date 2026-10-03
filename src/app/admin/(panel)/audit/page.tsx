import { ListFilter, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { fmtISTShort } from "@/lib/time";
import { pickSort } from "@/lib/sort";
import { ListToolbar } from "@/components/ListToolbar";
import { ParamSelect } from "@/components/ParamSelect";

/** SETTING_CHANGED -> "Setting changed", KYC_DOC_VIEWED -> "KYC doc viewed" */
const KEEP = new Set(["KYC", "UTR", "TXID", "IP", "PAN", "USDT", "BSC", "UPI", "TOTP", "2FA"]);
const human = (action: string) =>
  action
    .split("_")
    .map((w, i) => (KEEP.has(w) ? w : i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
] as const;

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; type?: string; page?: string; sort?: string }> }) {
  await adminOrLogin();
  const sp = await searchParams;
  const q = (sp.q ?? sp.action)?.trim(); // ?action= kept for old links
  const sort = pickSort(sp.sort, SORTS.map((s) => s.value), "new");
  const p = Math.max(0, Number(sp.page ?? 0) || 0);
  // Search the action name (e.g. KYC_DOC), the target ID, or the IP.
  const type = sp.type?.trim() || null;
  const where: Prisma.AuditLogWhereInput = {
    ...(type ? { action: type } : {}),
    ...(q ? { OR: [{ action: { contains: q.toUpperCase().replace(/\s+/g, "_") } }, { targetId: { contains: q, mode: "insensitive" } }, { ip: { startsWith: q } }] } : {}),
  };
  const [rows, admins, actions] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: sort === "old" ? "asc" : "desc" }, skip: p * 100, take: 100 }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
    // Every action type that has happened, for the filter.
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
  ]);
  const types = [{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a.action, label: human(a.action), hint: String(a._count._all) }))];
  const pageHref = (n: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), ...(sort !== "new" ? { sort } : {}), page: String(n) })}`;
  const who = (t: string, id: string | null) => (t === "ADMIN" ? admins.find((a) => a.id === id)?.name ?? id : t === "USER" ? `user ${id?.slice(0, 8)}` : "system");
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" icon={<ScrollText className="size-6" />} tile="tile-slate" />
      <ListToolbar placeholder="Target ID, IP or action" sorts={[...SORTS]} defaultSort="new">
        <ParamSelect name="type" label="Action type" options={types} icon={<ListFilter className="size-4" aria-hidden />} className="w-60 max-w-full text-sm font-medium" />
      </ListToolbar>
      {rows.length === 0 && <p className="muted">Nothing matches.</p>}
      <div className="card overflow-hidden p-0 sm:p-0">
        <ul className="divide-y divide-slate-100 md:hidden">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold text-slate-900">{human(r.action)}</span>
                <span className="shrink-0 text-xs text-slate-500">{fmtISTShort(r.createdAt)}</span>
              </div>
              <p className="truncate text-xs text-slate-500">{who(r.actorType, r.actorId)}{r.targetType ? ` · ${r.targetType}${r.targetId ? `:${r.targetId}` : ""}` : ""}</p>
              {r.details && <p className="line-clamp-2 font-mono text-[11px] break-all text-slate-500">{JSON.stringify(r.details)}</p>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="table">
            <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtISTShort(r.createdAt)}</td>
                  <td>{who(r.actorType, r.actorId)}</td>
                  <td className="text-xs font-medium whitespace-nowrap">{human(r.action)}</td>
                  <td className="text-xs">{r.targetType}{r.targetId ? `:${r.targetId}` : ""}</td>
                  <td className="max-w-xs text-xs break-all">{r.details ? JSON.stringify(r.details) : ""}</td>
                  <td className="text-xs">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex gap-3 text-sm">
        {p > 0 && <a className="underline" href={pageHref(p - 1)}>{sort === "old" ? "Earlier" : "Newer"}</a>}
        {rows.length === 100 && <a className="underline" href={pageHref(p + 1)}>{sort === "old" ? "Later" : "Older"}</a>}
      </div>
    </div>
  );
}
