"use client";
import { useEffect, useState } from "react";

export function TotpSetup() {
  const [data, setData] = useState<{ secret: string; qr: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/auth/totp")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="card space-y-2 text-center">
      <p className="text-sm">First sign-in: scan this with Google Authenticator, Microsoft Authenticator or similar.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qr} alt="Authenticator QR code" className="mx-auto h-48 w-48" />
      <p className="muted">Or enter this key: <code className="break-all">{data.secret}</code></p>
    </div>
  );
}
