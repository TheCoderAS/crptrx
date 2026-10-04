import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, Download, ShieldCheck, Smartphone } from "lucide-react";
import { latestAppRelease } from "@/server/appRelease";
import { nativeAppVersion } from "@/server/appClient";
import icon from "@/assets/app-icon.png";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Android app", description: "Download the VisionPay app for Android.", alternates: { canonical: "/app" } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default async function AppPage() {
  const [r, inApp] = await Promise.all([latestAppRelease(), nativeAppVersion()]);
  const name = r?.channel === "test" || (!r && process.env.APP_MODE !== "LIVE") ? "VisionPay Test" : "VisionPay";
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <section className="card text-center">
        <Image src={icon} alt="" width={96} height={96} className="mx-auto rounded-[1.4rem] shadow-lg" priority />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{name} for Android</h1>
        {inApp ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> You&apos;re using the app (version {inApp}).</p>
        ) : r ? (
          <>
            <p className="mt-1 text-sm text-slate-500">Version {r.versionName} · {mb(r.size)} · {dateFmt.format(new Date(r.publishedAt))}</p>
            <a href={r.url} className="btn btn-lg bg-brand-gradient mt-6 w-full text-white hover:opacity-95" rel="nofollow">
              <Download className="size-5" aria-hidden /> Download for Android
            </a>
            <p className="mt-2 text-xs text-slate-500">Android 7 or newer. Free.</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">The app isn&apos;t available to download yet. Please check back soon.</p>
        )}
      </section>

      {!inApp && r && (
        <section className="card">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Smartphone className="size-4 text-brand-600" aria-hidden /> How to install</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Tap <strong>Download for Android</strong> and open the file when it finishes.</li>
            <li>If your phone asks, allow <strong>Install unknown apps</strong> for your browser. This is only needed once.</li>
            <li>Tap <strong>Install</strong>, then <strong>Open</strong>, and sign in as usual.</li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">The app tells you when a new version is ready.</p>
        </section>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Only download the app from this page. We never send the app file over WhatsApp, SMS or email.
      </p>
    </div>
  );
}
