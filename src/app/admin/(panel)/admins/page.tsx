import { KeyRound, Plus, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { ApiForm } from "@/components/ApiForm";
import { ModalForm } from "@/components/Modal";
import { PageHeader, StatusPill } from "@/components/ui";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export default async function Admins() {
  const me = await adminOrLogin("SUPER_ADMIN");
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin accounts"
        subtitle="Admins can't be deleted, only disabled, so their history stays linked to them."
        icon={<Users className="size-6" />}
        tile="tile-violet"
        action={
          <ModalForm
            button={<><Plus className="size-4" aria-hidden /> Add admin</>}
            title="Add an admin"
            description="They sign in with this password, then set up their authenticator app."
            action="/api/admin/admins"
            submitLabel="Create admin"
          >
            <div><label className="label" htmlFor="admin-name">Name</label><input id="admin-name" name="name" required className="input" /></div>
            <div><label className="label" htmlFor="admin-email">Email</label><input id="admin-email" name="email" type="email" required className="input" /></div>
            <div>
              <label className="label" htmlFor="admin-password">Temporary password</label>
              <input id="admin-password" name="password" type="password" minLength={10} required className="input" autoComplete="new-password" />
              <p className="hint">At least 10 characters. Share it privately.</p>
            </div>
            <div>
              <label className="label" htmlFor="admin-role">Role</label>
              <select id="admin-role" name="role" className="input"><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin</option></select>
              <p className="hint">Super admins can also change settings and manage admins.</p>
            </div>
          </ModalForm>
        }
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {admins.map((a) => {
          const self = a.id === me.id;
          const off = a.status !== "ACTIVE";
          return (
            <li key={a.id} className={`card flex flex-col p-0 sm:p-0 ${off ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-3 p-4">
                <span className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold ${a.role === "SUPER_ADMIN" ? "tile-violet" : "tile-blue"} icon-tile`}>{initials(a.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold text-slate-900">{a.name}</p>
                    {self && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">You</span>}
                  </div>
                  <p className="truncate text-sm text-slate-500">{a.email}</p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <dl className="grid grid-cols-3 gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                <div><dt className="text-xs text-slate-500">Role</dt><dd className="font-medium text-slate-900">{a.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}</dd></div>
                <div>
                  <dt className="text-xs text-slate-500">2FA</dt>
                  <dd className={`flex items-center gap-1 font-medium ${a.totpEnabled ? "text-emerald-700" : "text-amber-700"}`}>
                    {a.totpEnabled ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
                    {a.totpEnabled ? "On" : "Pending"}
                  </dd>
                </div>
                <div><dt className="text-xs text-slate-500">Added</dt><dd className="font-medium text-slate-900">{dateFmt.format(a.createdAt)}</dd></div>
              </dl>
              <div className="mt-auto flex min-h-11 items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
                {self ? (
                  <p className="mr-auto px-1 text-xs text-slate-500">This is your account.</p>
                ) : (
                  <>
                    <ApiForm action={`/api/admin/admins/${a.id}`} confirm="Reset this admin's 2FA? They'll set it up again at next sign-in.">
                      <input type="hidden" name="action" value="reset_2fa" />
                      <button className="btn-ghost min-h-8 px-2.5 py-1 text-xs"><KeyRound className="size-3.5" aria-hidden /> Reset 2FA</button>
                    </ApiForm>
                    <ApiForm action={`/api/admin/admins/${a.id}`} confirm={off ? undefined : `Disable ${a.name}? They're signed out right away.`}>
                      <input type="hidden" name="action" value={off ? "enable" : "disable"} />
                      <button className={`btn-ghost min-h-8 px-2.5 py-1 text-xs ${off ? "text-emerald-700" : "text-rose-600 hover:bg-rose-50 hover:text-rose-700"}`}>{off ? "Enable" : "Disable"}</button>
                    </ApiForm>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
