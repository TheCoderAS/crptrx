import { Users } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { PageHeader, StatusPill } from "@/components/ui";

export default async function Admins() {
  const me = await adminOrLogin("SUPER_ADMIN");
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader title="Admin accounts" icon={<Users className="size-6" />} tile="tile-violet" />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td><td>{a.email}</td><td>{a.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}</td>
                <td>{a.totpEnabled ? "On" : "Set up at next sign-in"}</td><td><StatusPill status={a.status} /></td><td>{fmtIST(a.createdAt)}</td>
                <td>
                  {a.id !== me.id && (
                    <div className="flex flex-col gap-2">
                      <ApiForm action={`/api/admin/admins/${a.id}`} className="flex items-end gap-2">
                        <input type="hidden" name="action" value={a.status === "ACTIVE" ? "disable" : "enable"} />
                        <button className="btn-secondary px-3 py-1.5">{a.status === "ACTIVE" ? "Disable" : "Enable"}</button>
                      </ApiForm>
                      <ApiForm action={`/api/admin/admins/${a.id}`} className="flex items-end gap-2" confirm="Reset this admin's 2FA? They'll set it up again at next sign-in.">
                        <input type="hidden" name="action" value="reset_2fa" />
                        <button className="btn-secondary px-3 py-1.5">Reset 2FA</button>
                      </ApiForm>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Admins can&apos;t be deleted, only disabled, so their history stays linked to them.</p>
      <ApiForm action="/api/admin/admins" className="card space-y-3" resetOnSuccess>
        <h2 className="h2">Add an admin</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Name</label><input aria-label="Name" name="name" required className="input" /></div>
          <div><label className="label">Email</label><input aria-label="Email" name="email" type="email" required className="input" /></div>
          <div><label className="label">Temporary password (10+ characters)</label><input aria-label="Temporary password (10+ characters)" name="password" type="password" minLength={10} required className="input" autoComplete="new-password" /></div>
          <div><label className="label">Role</label><select aria-label="Role" name="role" className="input"><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin</option></select></div>
        </div>
        <button className="btn-primary">Create admin</button>
      </ApiForm>
    </div>
  );
}
