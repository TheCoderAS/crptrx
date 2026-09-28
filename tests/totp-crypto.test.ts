import { describe, expect, it } from "vitest";
import { base32Encode, totpAt, verifyTotp } from "@/server/totp";
import { decrypt, encrypt } from "@/server/crypto";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 test secret "12345678901234567890", SHA-1, T=59s -> 94287082 (8 digits) -> 287082 (6 digits)
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vector", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
  });
  it("accepts ±1 step and rejects others", () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, "081804", now)).not.toBeNull();
    expect(verifyTotp(secret, "000000", now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
});

describe("field encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("ABCDE1234F");
    const b = encrypt("ABCDE1234F");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("ABCDE1234F");
  });
  it("detects tampering", () => {
    const a = encrypt("123456789012");
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});
