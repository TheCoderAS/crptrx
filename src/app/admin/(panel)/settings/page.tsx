import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { RATE_SOURCE_IDS, rateFeedState } from "@/server/rateFeed";
import { getSettings, LIVE_CONFIRM_PHRASE, rateIsStale, tokenContractFor } from "@/server/settings";
import { NETWORK_CODES, NETWORK_INFO } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { TotpField } from "@/components/Totp";
import { Banner } from "@/components/ui";

function Field({ name, label, value, hint, type = "text" }: { name: string; label: string; value: string | number; hint?: string; type?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={String(value)} className="input" />
      {hint && <p className="muted mt-1">{hint}</p>}
    </div>
  );
}

export default async function SettingsPage() {
  await adminOrLogin("SUPER_ADMIN");
  const s = await getSettings();
  const pending = await prisma.depositAddressChange.findMany({ where: { appliedAt: null, cancelledAt: null }, orderBy: { createdAt: "desc" } });
  const history = await prisma.settingsHistory.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const feed = await rateFeedState();
  const mode = s.network_mode;
  const group = (title: string, children: React.ReactNode, extra?: React.ReactNode) => (
    <ApiForm action="/api/admin/settings" className="card space-y-3">
      <h2 className="h2">{title}</h2>
      {extra}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      <div className="flex items-end gap-3"><TotpField /><button className="btn-primary">Save</button></div>
    </ApiForm>
  );
  return (
    <div className="space-y-6">
      <h1 className="h1">Settings</h1>

      <div className="card space-y-4">
        <ApiForm action="/api/admin/settings" className="space-y-3">
          <h2 className="h2">Rate (₹ per USDT)</h2>
          {rateIsStale(s) && <Banner tone="danger">The rate is stale or not set. New quotes are blocked until it is updated.</Banner>}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="rate_mode" value="MANUAL" defaultChecked={s.rate_mode === "MANUAL"} /> Manual: I type the rate</label>
            <label className="flex items-center gap-2"><input type="radio" name="rate_mode" value="AUTO" defaultChecked={s.rate_mode === "AUTO"} /> Auto: live market price minus my margin</label>
          </div>
          <p className="text-2xl font-bold">
            Current rate: ₹{s.rate} <span className="text-sm font-normal text-gray-500">({s.rate_mode === "AUTO" ? "auto" : "manual"}, updated {fmtIST(s.rateUpdatedAt)})</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rate">Manual rate</label>
              <input id="rate" name="rate" defaultValue={s.rate} disabled={s.rate_mode === "AUTO"} className="input disabled:bg-gray-100" />
              <p className="muted mt-1">{s.rate_mode === "AUTO" ? "Set automatically in Auto mode." : "Affects new quotes only."}</p>
            </div>
            <Field name="rate_max_age_hours" label="Manual: block quotes if the rate is older than (hours)" value={s.rate_max_age_hours} type="number" />
            <Field name="rate_margin_percent" label="Auto: my margin %" value={s.rate_margin_percent} hint="Rate = market price × (1 − margin%). Tax and fee still apply after this." />
            <Field name="rate_max_jump_percent" label="Auto: refuse a market move bigger than (%)" value={s.rate_max_jump_percent} hint="Checked between two updates (every 2 minutes)." />
            <Field name="rate_floor" label="Auto: never offer less than (₹)" value={s.rate_floor} />
            <Field name="rate_ceiling" label="Auto: never offer more than (₹)" value={s.rate_ceiling} />
            <Field name="rate_feed_max_age_minutes" label="Auto: block quotes if the feed fails for (minutes)" value={s.rate_feed_max_age_minutes} type="number" />
            <Field name="rate_min_sources" label="Auto: price sources that must agree" value={s.rate_min_sources} type="number" />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="rate_sources">Auto: price sources (one per line: {RATE_SOURCE_IDS.join(", ")})</label>
              <textarea id="rate_sources" name="rate_sources" rows={3} className="input font-mono" defaultValue={s.rate_sources.join("\n")} />
            </div>
          </div>
          <div className="flex items-end gap-3"><TotpField /><button className="btn-primary">Save</button></div>
        </ApiForm>

        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p className="font-semibold">Live price feed</p>
          {feed?.sources ? (
            <ul className="mt-1 space-y-0.5">
              {(feed.sources as { source: string; price?: string; error?: string }[]).map((r) => (
                <li key={r.source}>
                  {r.source}: {r.price ? `₹${Number(r.price).toFixed(2)}` : <span className="text-red-700">{r.error}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No reading yet.</p>
          )}
          {feed?.lastMarket && <p className="mt-1">Market (agreed): ₹{Number(feed.lastMarket).toFixed(2)} · last good update {fmtIST(feed.lastOkAt)}</p>}
          {feed?.lastError && <p className="mt-1 font-medium text-red-700">Last problem ({fmtIST(feed.lastErrorAt)}): {feed.lastError}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <ApiForm action="/api/admin/rate/refresh"><button className="btn-secondary">Fetch now</button></ApiForm>
            {feed?.lastError?.includes("above your") && (
              <ApiForm action="/api/admin/rate/accept" className="flex items-end gap-2">
                <TotpField />
                <button className="btn-danger">Accept new market price</button>
              </ApiForm>
            )}
          </div>
        </div>
      </div>

      {group(
        "Fees and tax",
        <>
          <Field name="fee_percent" label="Platform fee %" value={s.fee_percent} />
          <Field name="tax_percent" label="Tax held back %" value={s.tax_percent} hint="Default 1%. Change only after the owner and CA confirm." />
          <Field name="gst_percent" label="GST on fee %" value={s.gst_percent} />
          <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="gst_enabled" name="gst_enabled" value="true" defaultChecked={s.gst_enabled} /><label htmlFor="gst_enabled">Charge GST on the fee</label></div>
        </>,
      )}

      {group(
        "Limits (USDT)",
        <>
          <Field name="limit_min_order_usdt" label="Minimum per order" value={s.limit_min_order_usdt} />
          <Field name="limit_max_order_usdt" label="Maximum per order" value={s.limit_max_order_usdt} />
          <Field name="limit_user_daily_usdt" label="Per user per day" value={s.limit_user_daily_usdt} />
          <Field name="limit_user_monthly_usdt" label="Per user per month" value={s.limit_user_monthly_usdt} />
          <Field name="limit_platform_daily_usdt" label="Whole platform per day" value={s.limit_platform_daily_usdt} />
        </>,
      )}

      {group(
        "Networks on/off",
        <>
          {NETWORK_CODES.map((n) => (
            <div key={n} className="flex items-center gap-2">
              <input type="hidden" name={`network_enabled.${n}`} value="false" />
              <input type="checkbox" id={`ne-${n}`} name={`network_enabled.${n}`} value="true" defaultChecked={s.network_enabled[n]} />
              <label htmlFor={`ne-${n}`}>{NETWORK_INFO[n].name} accepts new quotes</label>
            </div>
          ))}
        </>,
        <p className="muted">Switching a network off blocks new quotes only. Open orders keep being watched.</p>,
      )}

      <div id="address" className="card space-y-4 ring-2 ring-red-300">
        <h2 className="h2">Deposit addresses ({mode} mode)</h2>
        <Banner tone="danger">If this address is wrong, every payment on that network goes to someone else. Changes need your 2FA code, take effect after 1 hour, and every admin is emailed a cancel link.</Banner>
        {NETWORK_CODES.map((n) => (
          <div key={n} className="rounded-lg p-3 ring-1 ring-gray-200">
            <p className="text-xl font-bold">{NETWORK_INFO[n].name}</p>
            <p className="muted">Active address:</p>
            <p className="font-mono text-sm break-all">{s.deposit_address[mode][n] || "(not set)"}</p>
            {pending.filter((p) => p.network === n && p.networkMode === mode).map((p) => (
              <div key={p.id} className="mt-2 rounded bg-orange-50 p-2 text-sm">
                Pending: <code className="break-all">{p.newAddress}</code> at {fmtIST(p.effectiveAt)}
                <ApiForm action="/api/admin/deposit-address/cancel" className="mt-1"><input type="hidden" name="id" value={p.id} /><button className="btn-danger px-3 py-1">Cancel this change</button></ApiForm>
              </div>
            ))}
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-red-700">Change the {NETWORK_INFO[n].name} address</summary>
              <ApiForm action="/api/admin/deposit-address" className="mt-2 space-y-2" confirm={`Change the ${NETWORK_INFO[n].name} deposit address? It takes effect in 1 hour.`}>
                <input type="hidden" name="network" value={n} />
                <input name="address" required className="input font-mono" placeholder={n === "TRON" ? "T…" : "0x… (checksummed)"} />
                <input name="confirmNetwork" required className="input" placeholder={`Type ${n} to confirm the network`} />
                <TotpField />
                <button className="btn-danger">Request change</button>
              </ApiForm>
            </details>
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        <h2 className="h2">USDT token contracts</h2>
        {NETWORK_CODES.map((n) => <p key={n} className="text-sm"><b>{NETWORK_INFO[n].name}:</b> <code className="break-all">{tokenContractFor(s, n) || "(not set)"}</code></p>)}
        {mode === "LIVE" ? <p className="muted">Live mode uses the official mainnet contracts. They can&apos;t be edited.</p> : (
          <ApiForm action="/api/admin/settings" className="space-y-2">
            <p className="muted">Test-mode tokens (Nile / BSC Testnet). Confirm these are the test USDT tokens you&apos;ll use. Mainnet contracts are refused here.</p>
            <input name="test_token_contract.TRON" defaultValue={s.test_token_contract.TRON} className="input font-mono" />
            <input name="test_token_contract.BSC" defaultValue={s.test_token_contract.BSC} className="input font-mono" />
            <div className="flex items-end gap-3"><TotpField /><button className="btn-primary">Save</button></div>
          </ApiForm>
        )}
      </div>

      <ApiForm action="/api/admin/settings/mode" className="card space-y-3">
        <h2 className="h2">Network mode: {mode === "LIVE" ? "LIVE (mainnets)" : "TEST (Tron Nile + BSC Testnet)"}</h2>
        <input type="hidden" name="mode" value={mode === "LIVE" ? "TEST" : "LIVE"} />
        {mode === "TEST" ? (
          <>
            <Banner tone="danger">Switching to Live means real USDT and real payouts. Set the Live deposit addresses first (they also take 1 hour).</Banner>
            <input name="confirm" required className="input" placeholder={`Type ${LIVE_CONFIRM_PHRASE}`} />
          </>
        ) : <input type="hidden" name="confirm" value="" />}
        <div className="flex items-end gap-3"><TotpField /><button className={mode === "TEST" ? "btn-danger" : "btn-secondary"}>{mode === "TEST" ? "Switch to Live" : "Switch back to Test"}</button></div>
      </ApiForm>

      {group(
        "Text shown to users and on receipts",
        <>
          <Field name="business_hours_text" label="Business hours" value={s.business_hours_text} />
          <Field name="review_hours" label="Typical review time (hours)" value={s.review_hours} type="number" />
          <Field name="company_name" label="Company legal name" value={s.company_name} />
          <Field name="company_address" label="Company address" value={s.company_address} />
          <Field name="company_fiu_reg" label="FIU registration number" value={s.company_fiu_reg} />
          <Field name="company_gstin" label="GSTIN" value={s.company_gstin} />
          <Field name="support_email" label="Support email" value={s.support_email} />
          <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="sms" name="sms_notifications_enabled" value="true" defaultChecked={s.sms_notifications_enabled} /><label htmlFor="sms">Also send SMS notifications</label></div>
        </>,
      )}

      <ApiForm action="/api/admin/settings" className="card space-y-3">
        <h2 className="h2">Hold reasons and admin IP allow-list</h2>
        <label className="label">Hold reasons (one per line)</label>
        <textarea name="hold_reasons" rows={8} className="input" defaultValue={s.hold_reasons.join("\n")} />
        <label className="label">Allowed admin IP addresses (one per line; empty = any)</label>
        <textarea name="admin_ip_allowlist" rows={3} className="input font-mono" defaultValue={s.admin_ip_allowlist.join("\n")} />
        <div className="flex items-end gap-3"><TotpField /><button className="btn-primary">Save</button></div>
      </ApiForm>

      {group(
        "Blockchain reading (advanced)",
        <>
          <Field name="bsc_finality_fallback_blocks" label="BSC: blocks to wait if the provider has no 'finalized' (min 15)" value={s.bsc_finality_fallback_blocks} type="number" />
          <Field name="bsc_scan_range" label="BSC: blocks per log request" value={s.bsc_scan_range} type="number" />
          <Field name="bsc_initial_lookback_blocks" label="BSC: blocks to look back on first start" value={s.bsc_initial_lookback_blocks} type="number" />
          <Field name="tron_initial_lookback_seconds" label="Tron: seconds to look back on first start" value={s.tron_initial_lookback_seconds} type="number" />
        </>,
      )}

      <div className="card overflow-x-auto">
        <h2 className="h2 mb-2">Recent setting changes</h2>
        <table className="table">
          <thead><tr><th>Time</th><th>Setting</th><th>Old</th><th>New</th><th>By</th></tr></thead>
          <tbody>
            {history.map((h) => <tr key={h.id}><td className="whitespace-nowrap">{fmtIST(h.createdAt)}</td><td>{h.key}</td><td className="text-xs break-all">{JSON.stringify(h.oldValue)}</td><td className="text-xs break-all">{JSON.stringify(h.newValue)}</td><td className="text-xs">{h.changedBy ?? "system"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
