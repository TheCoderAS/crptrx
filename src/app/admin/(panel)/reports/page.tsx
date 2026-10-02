import { Download, FileClock } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { adminOrLogin } from "@/server/auth/pages";
import { DownloadForm } from "@/components/DownloadForm";

export default async function Reports() {
  await adminOrLogin("SUPER_ADMIN");
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() + 330 * 60_000 - 30 * 86400_000).toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="CSV exports for your CA and records." icon={<FileClock className="size-6" />} tile="tile-emerald" />
      <DownloadForm action="/api/admin/reports" className="card space-y-4">
        <div>
          <label className="label" htmlFor="report-kind">Report</label>
          <select id="report-kind" name="kind" className="input">
            <option value="orders">Orders report</option>
            <option value="tax">Tax report (per user per month, paid orders)</option>
            <option value="audit">History log export</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="report-from">From (IST date)</label><input id="report-from" type="date" name="from" defaultValue={monthAgo} className="input" /></div>
          <div><label className="label" htmlFor="report-to">To (IST date)</label><input id="report-to" type="date" name="to" defaultValue={today} className="input" /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="muted">Exports contain full PAN numbers. Every export is logged.</p>
          <button className="btn-primary"><Download className="size-4" aria-hidden /> Download CSV</button>
        </div>
      </DownloadForm>
    </div>
  );
}
