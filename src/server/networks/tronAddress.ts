import { createHash } from "node:crypto";

// Tron addresses: base58check of 0x41 + 20-byte account id (34 chars, starts with T).
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sha = (b: Buffer) => createHash("sha256").update(b).digest();

function b58decode(s: string): Buffer | null {
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

function b58encode(buf: Buffer): string {
  let n = BigInt("0x" + (buf.toString("hex") || "0"));
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function isValidTronAddress(a: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false;
  const raw = b58decode(a);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const payload = raw.subarray(0, 21);
  const check = sha(sha(payload)).subarray(0, 4);
  return check.equals(raw.subarray(21));
}

/** Accepts 20-byte hex (with/without 0x) or 21-byte hex starting 41. */
export function tronHexToBase58(hex: string): string {
  let h = hex.replace(/^0x/i, "").toLowerCase();
  if (h.length === 64) h = h.slice(24); // 32-byte log topic, left-padded
  if (h.length === 40) h = "41" + h;
  if (h.length !== 42 || !h.startsWith("41")) throw new Error(`Not a Tron hex address: ${hex}`);
  const payload = Buffer.from(h, "hex");
  return b58encode(Buffer.concat([payload, sha(sha(payload)).subarray(0, 4)]));
}

export function tronBase58ToHex(a: string): string {
  const raw = b58decode(a);
  if (!raw || raw.length !== 25) throw new Error("Invalid Tron address");
  return raw.subarray(0, 21).toString("hex");
}
