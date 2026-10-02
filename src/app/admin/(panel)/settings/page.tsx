import {
  ArrowLeftRight,
  BadgeCheck,
  Blocks,
  Coins,
  FileText,
  Gauge,
  History,
  Landmark,
  LockKeyhole,
  Network,
  Palette,
  Percent,
  Phone,
  RadioTower,
  ShieldAlert,
  Signal,
  UserCheck,
  Wallet,
} from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { logoSrc } from "@/server/brand";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import { rateFeedState } from "@/server/rateFeed";
import { getSettings, isRealValue, LIVE_CONFIRM_PHRASE, rateIsStale, tokenContractFor } from "@/server/settings";
import { NETWORK_CODES, NETWORK_INFO } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { ColorField } from "@/components/ColorField";
import { SettingsForm } from "@/components/SettingsForm";
import { Group, Segmented, SettingRow, Switch, TextInput, UnitInput } from "@/components/SettingsUi";
import { Tabs } from "@/components/Tabs";
import { Banner, Logo, NetworkMark, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await adminOrLogin("SUPER_ADMIN");
  const [s, pending, history, feed, autoKycToReview] = await Promise.all([
    getSettings(),
    prisma.depositAddressChange.findMany({ where: { appliedAt: null, cancelledAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.settingsHistory.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    rateFeedState(),
    prisma.kycSubmission.count({ where: { autoApproved: true, postReviewedAt: null, status: "APPROVED" } }),
  ]);
  const mode = s.network_mode;
  const auto = s.rate_mode === "AUTO";
  const firebaseReady = !!env.firebase.webConfig;
  const real = (v: string) => (isRealValue(v) ? v : "");
  const sources = (feed?.sources ?? []) as { source: string; price?: string; error?: string }[];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Changes are logged. Risky ones ask for your 2FA code." icon={<Gauge className="size-5" />} tile="tile-slate" />
      <Tabs
        layout="side"
        tabs={[
          {
            id: "rate",
            label: "Rate",
            icon: <ArrowLeftRight />,
            alert: rateIsStale(s),
            content: (
              <>
                {rateIsStale(s) && <Banner tone="danger">The rate is out of date, so new quotes are blocked.</Banner>}
                <div className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Current rate</p>
                    <p className="money text-2xl text-slate-900">₹{s.rate} <span className="text-sm font-normal text-slate-500">/ USDT</span></p>
                    <p className="text-xs text-slate-500">{auto ? "Auto" : "Manual"} · updated {fmtIST(s.rateUpdatedAt)}</p>
                  </div>
                  {auto && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {sources.map((r) => (
                        <span key={r.source} className={`rounded-lg px-2.5 py-1 ${r.price ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`} title={r.error}>
                          {r.source} {r.price ? `₹${Number(r.price).toFixed(2)}` : "failed"}
                        </span>
                      ))}
                      <ApiForm action="/api/admin/rate/refresh"><button className="btn-secondary px-3 py-1.5 text-xs">Fetch now</button></ApiForm>
                    </div>
                  )}
                </div>
                {feed?.lastError && auto && (
                  <Banner tone="warn" title={`Feed problem · ${fmtIST(feed.lastErrorAt)}`}>
                    {feed.lastError}
                    {feed.lastError.includes("above your") && (
                      <ApiForm action="/api/admin/rate/accept" className="mt-2"><button className="btn-danger px-3 py-1.5 text-xs">Accept new market price</button></ApiForm>
                    )}
                  </Banner>
                )}
                <SettingsForm>
                  <Group title="How the rate is set" icon={<Coins />} tile="tile-blue">
                    <SettingRow label="Mode" hint="Manual: you type the rate. Auto: live market price minus your margin, refreshed every 2 minutes.">
                      <Segmented name="rate_mode" value={s.rate_mode} options={[{ value: "MANUAL", label: "Manual" }, { value: "AUTO", label: "Auto" }]} />
                    </SettingRow>
                    <SettingRow label="Manual rate" htmlFor="rate" hint="Applies to new quotes only. Ignored in Auto mode.">
                      <UnitInput name="rate" value={s.rate} prefix="₹" disabled={auto} />
                    </SettingRow>
                    <SettingRow label="Manual rate expires after" htmlFor="rate_max_age_hours" hint="Quotes stop if the manual rate isn't saved again within this time.">
                      <UnitInput name="rate_max_age_hours" value={s.rate_max_age_hours} unit="hours" type="number" />
                    </SettingRow>
                  </Group>
                  <Group title="Auto mode" icon={<Signal />} tile="tile-violet" note="Used only when the mode is Auto">
                    <SettingRow label="Your margin" htmlFor="rate_margin_percent" hint="Rate = market price × (1 − margin). Tax and fee still apply after this.">
                      <UnitInput name="rate_margin_percent" value={s.rate_margin_percent} unit="%" />
                    </SettingRow>
                    <SettingRow label="Lowest rate offered" htmlFor="rate_floor"><UnitInput name="rate_floor" value={s.rate_floor} prefix="₹" /></SettingRow>
                    <SettingRow label="Highest rate offered" htmlFor="rate_ceiling"><UnitInput name="rate_ceiling" value={s.rate_ceiling} prefix="₹" /></SettingRow>
                    <SettingRow label="Pause on a jump bigger than" htmlFor="rate_max_jump_percent" hint="Between two updates. You then accept the new price by hand.">
                      <UnitInput name="rate_max_jump_percent" value={s.rate_max_jump_percent} unit="%" />
                    </SettingRow>
                    <SettingRow label="Stop quotes if the feed fails for" htmlFor="rate_feed_max_age_minutes">
                      <UnitInput name="rate_feed_max_age_minutes" value={s.rate_feed_max_age_minutes} unit="min" type="number" />
                    </SettingRow>
                    <SettingRow label="Sources that must agree" htmlFor="rate_min_sources" hint="Prices must be within 2% of each other.">
                      <UnitInput name="rate_min_sources" value={s.rate_min_sources} type="number" />
                    </SettingRow>
                    <SettingRow label="Price sources" htmlFor="rate_sources" hint="Comma separated. Available: coindcx, wazirx, coingecko.">
                      <TextInput name="rate_sources" value={s.rate_sources.join(", ")} mono />
                    </SettingRow>
                  </Group>
                </SettingsForm>
              </>
            ),
          },
          {
            id: "fees",
            label: "Fees & limits",
            icon: <Percent />,
            content: (
              <SettingsForm>
                <Group title="Fees and tax" icon={<Percent />} tile="tile-emerald">
                  <SettingRow label="Platform fee" htmlFor="fee_percent"><UnitInput name="fee_percent" value={s.fee_percent} unit="%" /></SettingRow>
                  <SettingRow label="Tax held back (TDS)" htmlFor="tax_percent" hint="Change only after your CA confirms."><UnitInput name="tax_percent" value={s.tax_percent} unit="%" /></SettingRow>
                  <SettingRow label="Charge GST on the fee" htmlFor="gst_enabled"><Switch name="gst_enabled" checked={s.gst_enabled} label="Charge GST on the fee" /></SettingRow>
                  <SettingRow label="GST rate" htmlFor="gst_percent"><UnitInput name="gst_percent" value={s.gst_percent} unit="%" /></SettingRow>
                </Group>
                <Group title="Limits" icon={<Gauge />} tile="tile-amber" note="In USDT">
                  <SettingRow label="Minimum per order" htmlFor="limit_min_order_usdt"><UnitInput name="limit_min_order_usdt" value={s.limit_min_order_usdt} unit="USDT" /></SettingRow>
                  <SettingRow label="Maximum per order" htmlFor="limit_max_order_usdt"><UnitInput name="limit_max_order_usdt" value={s.limit_max_order_usdt} unit="USDT" /></SettingRow>
                  <SettingRow label="Per customer per day" htmlFor="limit_user_daily_usdt"><UnitInput name="limit_user_daily_usdt" value={s.limit_user_daily_usdt} unit="USDT" /></SettingRow>
                  <SettingRow label="Per customer per month" htmlFor="limit_user_monthly_usdt"><UnitInput name="limit_user_monthly_usdt" value={s.limit_user_monthly_usdt} unit="USDT" /></SettingRow>
                  <SettingRow label="Whole platform per day" htmlFor="limit_platform_daily_usdt"><UnitInput name="limit_platform_daily_usdt" value={s.limit_platform_daily_usdt} unit="USDT" /></SettingRow>
                </Group>
              </SettingsForm>
            ),
          },
          {
            id: "networks",
            label: "Networks",
            icon: <Network />,
            content: (
              <>
                <SettingsForm>
                  <Group title="Networks" icon={<Network />} tile="tile-blue" note="Off blocks new quotes only; open orders are still watched">
                    {NETWORK_CODES.map((n) => (
                      <SettingRow key={n} htmlFor={`network_enabled.${n}`} label={<span className="inline-flex items-center gap-2"><NetworkMark network={n} size={18} />{NETWORK_INFO[n].name}</span>}>
                        <Switch name={`network_enabled.${n}`} checked={s.network_enabled[n]} label={`${NETWORK_INFO[n].name} accepts quotes`} />
                      </SettingRow>
                    ))}
                  </Group>
                  <Group title="USDT token contracts" icon={<Blocks />} tile="tile-slate" note={mode === "LIVE" ? "Live mode uses the official contracts" : "Test tokens. Changing these asks for your 2FA code"}>
                    {NETWORK_CODES.map((n) => (
                      <SettingRow key={n} label={NETWORK_INFO[n].name} htmlFor={`test_token_contract.${n}`} wide>
                        {mode === "LIVE" ? (
                          <code className="block text-xs break-all text-slate-600">{tokenContractFor(s, n)}</code>
                        ) : (
                          <TextInput name={`test_token_contract.${n}`} value={s.test_token_contract[n]} mono />
                        )}
                      </SettingRow>
                    ))}
                  </Group>
                </SettingsForm>
                <ApiForm action="/api/admin/settings/mode" className={`card space-y-3 p-4 sm:p-4 ${mode === "TEST" ? "ring-1 ring-rose-200" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`icon-tile ${mode === "LIVE" ? "tile-rose" : "tile-amber"} size-8 rounded-lg [&_svg]:size-4`}><RadioTower /></span>
                    <div className="flex-1">
                      <h2 className="text-sm font-semibold text-slate-900">Mode: {mode === "LIVE" ? "Live" : "Test"}</h2>
                      <p className="text-xs text-slate-500">{mode === "LIVE" ? "Mainnets, real money" : "Tron Nile + BSC Testnet, no real money"}</p>
                    </div>
                  </div>
                  <input type="hidden" name="mode" value={mode === "LIVE" ? "TEST" : "LIVE"} />
                  {mode === "TEST" ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input name="confirm" aria-label="Type the confirmation phrase" required className="input py-2 text-sm" placeholder={`Type ${LIVE_CONFIRM_PHRASE}`} />
                      <button className="btn-danger shrink-0">Switch to Live</button>
                    </div>
                  ) : (
                    <>
                      <input type="hidden" name="confirm" value="" />
                      <button className="btn-secondary">Switch back to Test</button>
                    </>
                  )}
                </ApiForm>
              </>
            ),
          },
          {
            id: "address",
            label: "Deposit addresses",
            icon: <Wallet />,
            alert: pending.length > 0,
            content: (
              <>
                <Banner tone="warn">A wrong address sends payments to someone else. Changes take effect after 1 hour and every admin gets a cancel link.</Banner>
                {NETWORK_CODES.map((n) => (
                  <section key={n} className="card space-y-3 p-4 sm:p-4">
                    <div className="flex items-center gap-2">
                      <NetworkMark network={n} size={22} />
                      <h2 className="flex-1 text-sm font-semibold text-slate-900">{NETWORK_INFO[n].name}</h2>
                      <span className="text-xs text-slate-500">{mode === "LIVE" ? "Live" : "Test"}</span>
                    </div>
                    <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-800">{s.deposit_address[mode][n] || "Not set"}</p>
                    {pending.filter((p) => p.network === n && p.networkMode === mode).map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <span className="flex-1">Changing to <code className="break-all">{p.newAddress}</code> at {fmtIST(p.effectiveAt)}</span>
                        <ApiForm action="/api/admin/deposit-address/cancel"><input type="hidden" name="id" value={p.id} /><button className="btn-danger px-3 py-1.5 text-xs">Cancel</button></ApiForm>
                      </div>
                    ))}
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-medium text-brand-700">Change address</summary>
                      <ApiForm action="/api/admin/deposit-address" className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_auto]" confirm={`Change the ${NETWORK_INFO[n].name} deposit address? It takes effect in 1 hour.`}>
                        <input type="hidden" name="network" value={n} />
                        <input name="address" aria-label={`New ${n} deposit address`} required className="input py-2 font-mono text-sm" placeholder={n === "TRON" ? "T…" : "0x…"} />
                        <input name="confirmNetwork" aria-label="Type the network to confirm" required className="input py-2 text-sm" placeholder={`Type ${n}`} />
                        <button className="btn-danger">Request</button>
                      </ApiForm>
                    </details>
                  </section>
                ))}
              </>
            ),
          },
          {
            id: "onboarding",
            label: "Sign-in & onboarding",
            icon: <UserCheck />,
            alert: s.auth_google_enabled && !firebaseReady,
            content: (
              <SettingsForm>
                <Group title="Sign-in methods" icon={<LockKeyhole />} tile="tile-blue" note="At least one must stay on">
                  <SettingRow label="Google" htmlFor="auth_google_enabled" warn={!firebaseReady ? "Firebase isn't set up on the server" : undefined}>
                    <Switch name="auth_google_enabled" checked={s.auth_google_enabled} label="Google sign-in" />
                  </SettingRow>
                  <SettingRow label="Email and password" htmlFor="auth_email_enabled"><Switch name="auth_email_enabled" checked={s.auth_email_enabled} label="Email and password" /></SettingRow>
                  <SettingRow label="Require a confirmed email" htmlFor="auth_email_verification_required" hint="New email sign-ups must click the emailed link first. Google accounts are already confirmed.">
                    <Switch name="auth_email_verification_required" checked={s.auth_email_verification_required} label="Require a confirmed email" />
                  </SettingRow>
                </Group>
                <Group title="Onboarding" icon={<BadgeCheck />} tile="tile-violet" note="Applies at once, also to people halfway through">
                  <SettingRow label="Confirm mobile number" htmlFor="onboarding_mobile_required" hint="One-time code by SMS."><Switch name="onboarding_mobile_required" checked={s.onboarding_mobile_required} label="Confirm mobile number" /></SettingRow>
                  <SettingRow label="Identity check (KYC)" htmlFor="kyc_required" hint="PAN, masked Aadhaar and a selfie before adding a bank account." warn={!s.kyc_required && mode === "LIVE" ? "Off in Live mode: TDS needs PANs" : undefined}>
                    <Switch name="kyc_required" checked={s.kyc_required} label="Identity check required" />
                  </SettingRow>
                  <SettingRow label="Auto-approve identity checks" htmlFor="kyc_auto_approve" hint="Approves once the basic checks pass. Each one still goes to Reviews → Auto-approved for a person to look at." warn={s.kyc_auto_approve && autoKycToReview ? `${autoKycToReview} waiting to be checked` : undefined}>
                    <Switch name="kyc_auto_approve" checked={s.kyc_auto_approve} label="Auto-approve identity checks" />
                  </SettingRow>
                  <SettingRow label="Auto-approve bank / UPI on name match" htmlFor="payout_auto_approve_on_name_match" hint="Only when the holder name matches the approved ID.">
                    <Switch name="payout_auto_approve_on_name_match" checked={s.payout_auto_approve_on_name_match} label="Auto-approve bank or UPI on name match" />
                  </SettingRow>
                  <SettingRow label="Customer sending wallets" htmlFor="wallet_registration" hint="Required: new orders need a saved wallet, and payments from other wallets are held. Exchange withdrawals will be held.">
                    <select id="wallet_registration" name="wallet_registration" defaultValue={s.wallet_registration} className="input py-2 text-sm">
                      <option value="OFF">Off</option>
                      <option value="OPTIONAL">Optional</option>
                      <option value="REQUIRED">Required</option>
                    </select>
                  </SettingRow>
                </Group>
              </SettingsForm>
            ),
          },
          {
            id: "brand",
            label: "Brand & contact",
            icon: <Palette />,
            content: (
              <>
                <section className="card flex flex-wrap items-center gap-4 p-4 sm:p-4">
                  <Logo name={s.brand_name} src={logoSrc(s)} size="lg" />
                  <span className="theme-lock rounded-lg bg-slate-900 px-3 py-2"><Logo name={s.brand_name} src={logoSrc(s)} inverted /></span>
                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <ApiForm action="/api/admin/brand/logo" className="flex items-center gap-2" resetOnSuccess>
                      <input id="logo" name="logo" type="file" required aria-label="Logo file (PNG, JPG or SVG, up to 300 KB)" accept="image/png,image/jpeg,image/svg+xml" className="max-w-52 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-medium file:text-brand-700" />
                      <button className="btn-primary px-3 py-1.5 text-xs">Upload</button>
                    </ApiForm>
                    {s.brand_logo_version && (
                      <ApiForm action="/api/admin/brand/logo" confirm="Remove the logo?">
                        <input type="hidden" name="remove" value="1" />
                        <button className="btn-ghost px-3 py-1.5 text-xs text-rose-600">Remove</button>
                      </ApiForm>
                    )}
                  </div>
                </section>
                <SettingsForm>
                  <Group title="Name and colours" icon={<Palette />} tile="tile-violet">
                    <SettingRow label="App name" htmlFor="brand_name"><TextInput name="brand_name" value={s.brand_name} /></SettingRow>
                    <SettingRow label="Main colour" htmlFor="brand_primary_color" hint="Buttons and links. Pick one dark enough for white text."><ColorField name="brand_primary_color" value={s.brand_primary_color} /></SettingRow>
                    <SettingRow label="Second colour" htmlFor="brand_accent_color" hint="Blended into gradients."><ColorField name="brand_accent_color" value={s.brand_accent_color} /></SettingRow>
                  </Group>
                  <Group title="Contact" icon={<Phone />} tile="tile-emerald" note="Shown to customers">
                    <SettingRow label="Support email" htmlFor="support_email"><TextInput name="support_email" value={real(s.support_email)} placeholder="help@yourdomain.in" /></SettingRow>
                    <SettingRow label="Phone" htmlFor="support_phone"><TextInput name="support_phone" value={s.support_phone} placeholder="Optional" /></SettingRow>
                    <SettingRow label="WhatsApp" htmlFor="support_whatsapp"><TextInput name="support_whatsapp" value={s.support_whatsapp} placeholder="+91 98765 43210" /></SettingRow>
                    <SettingRow label="Business hours" htmlFor="business_hours_text"><TextInput name="business_hours_text" value={s.business_hours_text} /></SettingRow>
                  </Group>
                  <Group title="Company" icon={<Landmark />} tile="tile-slate" note="On receipts and the site footer">
                    <SettingRow label="Legal name" htmlFor="company_name"><TextInput name="company_name" value={real(s.company_name)} /></SettingRow>
                    <SettingRow label="Address" htmlFor="company_address"><TextInput name="company_address" value={real(s.company_address)} /></SettingRow>
                    <SettingRow label="GSTIN" htmlFor="company_gstin"><TextInput name="company_gstin" value={real(s.company_gstin)} mono /></SettingRow>
                    <SettingRow label="FIU registration no." htmlFor="company_fiu_reg"><TextInput name="company_fiu_reg" value={real(s.company_fiu_reg)} mono /></SettingRow>
                  </Group>
                </SettingsForm>
              </>
            ),
          },
          {
            id: "company",
            label: "Messages & legal",
            icon: <FileText />,
            content: (
              <SettingsForm>
                <Group title="Messages" icon={<Phone />} tile="tile-blue">
                  <SettingRow label="Typical review time" htmlFor="review_hours" hint="Shown to customers while an order is reviewed."><UnitInput name="review_hours" value={s.review_hours} unit="hours" type="number" /></SettingRow>
                  <SettingRow label="Also send SMS updates" htmlFor="sms_notifications_enabled" hint="Needs an SMS provider with approved templates."><Switch name="sms_notifications_enabled" checked={s.sms_notifications_enabled} label="Send SMS updates" /></SettingRow>
                </Group>
                <Group title="Terms and privacy" icon={<FileText />} tile="tile-slate" note="Blank line = new paragraph · start a line with ## for a heading">
                  <SettingRow label="Terms of service" htmlFor="terms_text" wide>
                    <textarea id="terms_text" name="terms_text" rows={6} className="input font-mono text-xs" defaultValue={s.terms_text} />
                  </SettingRow>
                  <SettingRow label="Privacy policy" htmlFor="privacy_text" wide>
                    <textarea id="privacy_text" name="privacy_text" rows={6} className="input font-mono text-xs" defaultValue={s.privacy_text} />
                  </SettingRow>
                </Group>
              </SettingsForm>
            ),
          },
          {
            id: "security",
            label: "Holds & access",
            icon: <ShieldAlert />,
            content: (
              <SettingsForm>
                <Group title="Hold reasons" icon={<ShieldAlert />} tile="tile-amber" note="One per line; shown to customers">
                  <SettingRow label="Reasons" htmlFor="hold_reasons" wide>
                    <textarea id="hold_reasons" name="hold_reasons" rows={6} className="input text-sm" defaultValue={s.hold_reasons.join("\n")} />
                  </SettingRow>
                </Group>
                <Group title="Admin IP allow-list" icon={<LockKeyhole />} tile="tile-rose" note="Empty = any address. Changing it asks for your 2FA code">
                  <SettingRow label="IP addresses" htmlFor="admin_ip_allowlist" wide>
                    <textarea id="admin_ip_allowlist" name="admin_ip_allowlist" rows={3} className="input font-mono text-sm" defaultValue={s.admin_ip_allowlist.join("\n")} placeholder="One per line" />
                  </SettingRow>
                </Group>
              </SettingsForm>
            ),
          },
          {
            id: "advanced",
            label: "Advanced",
            icon: <Blocks />,
            content: (
              <SettingsForm>
                <Group title="Blockchain reading" icon={<Blocks />} tile="tile-slate" note="Leave as is unless support asks">
                  <SettingRow label="BSC: blocks to wait without 'finalized'" htmlFor="bsc_finality_fallback_blocks" hint="Minimum 15."><UnitInput name="bsc_finality_fallback_blocks" value={s.bsc_finality_fallback_blocks} unit="blocks" type="number" /></SettingRow>
                  <SettingRow label="BSC: blocks per request" htmlFor="bsc_scan_range"><UnitInput name="bsc_scan_range" value={s.bsc_scan_range} unit="blocks" type="number" /></SettingRow>
                  <SettingRow label="BSC: look back on first start" htmlFor="bsc_initial_lookback_blocks"><UnitInput name="bsc_initial_lookback_blocks" value={s.bsc_initial_lookback_blocks} unit="blocks" type="number" /></SettingRow>
                  <SettingRow label="Tron: look back on first start" htmlFor="tron_initial_lookback_seconds"><UnitInput name="tron_initial_lookback_seconds" value={s.tron_initial_lookback_seconds} unit="sec" type="number" /></SettingRow>
                </Group>
              </SettingsForm>
            ),
          },
          {
            id: "history",
            label: "History",
            icon: <History />,
            content: (
              <div className="card overflow-x-auto p-0 sm:p-0">
                <table className="table">
                  <thead><tr><th>When</th><th>Setting</th><th>From</th><th>To</th><th>By</th></tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap text-slate-500">{fmtIST(h.createdAt)}</td>
                        <td className="font-medium">{h.key}</td>
                        <td className="max-w-48 truncate font-mono text-xs text-slate-500" title={JSON.stringify(h.oldValue)}>{JSON.stringify(h.oldValue)}</td>
                        <td className="max-w-48 truncate font-mono text-xs" title={JSON.stringify(h.newValue)}>{JSON.stringify(h.newValue)}</td>
                        <td className="text-xs text-slate-500">{h.changedBy ?? "system"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
