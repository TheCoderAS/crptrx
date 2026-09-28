/** The "re-enter your 2FA code" field used on sensitive admin actions. */
export function TotpField({ label = "2FA code" }: { label?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="input w-32 tracking-widest" placeholder="123456" />
    </div>
  );
}
