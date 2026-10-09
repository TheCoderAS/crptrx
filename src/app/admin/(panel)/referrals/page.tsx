import { redirect } from "next/navigation";
import { Gift, Link2, Percent, UserRound } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { earningTotals } from "@/server/earnings";
import { fmtInr } from "@/server/money";
import Link from "next/link";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import { CopyButton } from "@/components/CopyButton";
import { ShareLink } from "@/components/ShareLink";
import { Banner, PageHeader } from "@/components/ui";

export const metadata = { title: "My invite" };

/** An admin's invite code, share link and profit share (set by the super admin). */
export default async function Referrals() {
  const admin = await adminOrLogin();
  if (admin.role === "SUPER_ADMIN") redirect("/admin/admins");
  const [me, customers, s, totals] = await Promise.all([
    prisma.admin.findUniqueOrThrow({ where: { id: admin.id }, select: { inviteCode: true, profitPercent: true } }),
    prisma.user.count({ where: { adminId: admin.id } }),
    getSettings(),
    earningTotals({ adminId: admin.id }),
  ]);
  const t = totals.get(admin.id);
  const link = me.inviteCode ? `${env.appUrl.replace(/\/$/, "")}/signup?ref=${me.inviteCode}` : null;
  return (
    <div className="space-y-4">
      <PageHeader title="My invite" subtitle="Customers who sign up with your code are yours." icon={<Gift className="size-6" />} tile="tile-violet" />
      {!me.inviteCode && <Banner tone="warn">You don&apos;t have an invite code yet. Ask the super admin to set one.</Banner>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Gift className="size-3.5" aria-hidden /> Invite code</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-mono text-2xl font-bold tracking-wider text-slate-900">{me.inviteCode ?? "—"}</p>
            {me.inviteCode && <CopyButton text={me.inviteCode} label="Copy code" />}
          </div>
        </div>
        <div className="card">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Percent className="size-3.5" aria-hidden /> Your profit share</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{me.profitPercent.toString()}%</p>
          <p className="text-xs text-slate-500">of the rate margin on your customers&apos; paid orders</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><UserRound className="size-3.5" aria-hidden /> Your customers</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{customers}</p>
        </div>
      </div>
      <Link href="/admin/earnings" className="card flex items-center justify-between gap-3 transition hover:bg-slate-50">
        <span>
          <span className="block text-xs font-medium text-slate-500">Owed to you</span>
          <span className="text-2xl font-bold text-slate-900">{fmtInr(t?.pending ?? 0)}</span>
        </span>
        <span className="text-right text-sm text-slate-600">Paid to you so far<br /><b className="text-slate-900">{fmtInr(t?.settled ?? 0)}</b></span>
      </Link>
      {link && (
        <div className="card space-y-3">
          <h2 className="h2 flex items-center gap-2"><Link2 className="size-5 text-brand-600" aria-hidden /> Invite link</h2>
          <p className="text-sm text-slate-600">Opening it fills in your code at sign-up for the rest of that visit.</p>
          <ShareLink url={link} text={`Sell USDT for rupees on ${s.brand_name}. Sign up with my invite:`} />
        </div>
      )}
    </div>
  );
}
