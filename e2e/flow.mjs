// End-to-end walk through the whole R1 flow against a running stack (docker compose up).
// Usage: BASE_URL=http://localhost:3000 node e2e/flow.mjs
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "e2e-output";
fs.mkdirSync(OUT, { recursive: true });

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s) { let bits = 0, v = 0; const out = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, step) { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0"); }
let lastStep = 0;
async function freshCode(secret) { let step = Math.floor(Date.now() / 30000); while (step <= lastStep) { await new Promise((r) => setTimeout(r, 1000)); step = Math.floor(Date.now() / 30000); } lastStep = step; return totp(secret, step); }

// Tiny valid PNG
function png() { const sig = Buffer.from([137,80,78,71,13,10,26,10]); const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : 0); return Buffer.concat([l, td, c]); }; const ihdr = Buffer.from([0,0,0,1,0,0,0,1,8,2,0,0,0]); return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.from([0,255,0,0]))), chunk("IEND", Buffer.alloc(0))]); }
fs.writeFileSync(OUT + "/doc.png", png());

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const user = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const expectText = async (p, t) => { await p.getByText(t, { exact: false }).first().waitFor({ timeout: 15000 }); };

// 1. Admin login + 2FA setup
await admin.goto(BASE + "/admin/login");
await admin.fill("#email", "owner@example.com");
await admin.fill("#password", "change-me-now-please");
await admin.click("text=Next");
await admin.waitForURL("**/admin/2fa");
await expectText(admin, "Or enter this key");
const secret = (await admin.locator("code").first().innerText()).trim();
await shot(admin, "01-admin-2fa-setup");
await admin.fill("#code", await freshCode(secret));
await admin.click("text=Verify");
await admin.waitForURL(BASE + "/admin");
await shot(admin, "02-admin-dashboard");
console.log("admin logged in with 2FA");

// 2. User sign-in (test login), mobile OTP
await user.goto(BASE + "/login");
await user.fill("#email", "tester@example.com");
await user.click("text=Continue");
await user.waitForURL("**/account");
await user.fill("#mobile", "9876543210");
await user.click("text=Send code");
await expectText(user, "your code is");
const otp = (await user.getByText("your code is").innerText()).match(/(\d{6})/)[1];
await user.fill("#code", otp);
await user.click("button:has-text('Confirm')");
await user.waitForURL("**/kyc");
console.log("mobile verified");

// 3. KYC
await user.fill("#fullName", "Test Kumar Sharma");
await user.fill("#dob", "1990-05-17");
await user.fill("#pan", "ABCDE1234F");
await user.fill("#address", "12 MG Road, Bengaluru, Karnataka 560001");
for (const f of ["panDoc", "aadhaarFront", "aadhaarBack", "selfie"]) await user.setInputFiles("#" + f, OUT + "/doc.png");
await user.check("input[name=maskedConfirmed]");
await shot(user, "03-user-kyc-form");
await user.click("text=Submit for review");
await expectText(user, "Submitted, under review");
console.log("kyc submitted");

// Admin: needs changes, then approve after resubmission
await admin.goto(BASE + "/admin/kyc");
await admin.click("table a");
await expectText(admin, "Test Kumar Sharma");
const [doc] = await Promise.all([admin.waitForEvent("popup"), admin.click("text=PAN card")]);
await doc.waitForLoadState();
console.log("doc view opened:", doc.url().includes("/api/files?") ? "signed link" : doc.url());
await doc.close();
await admin.fill("input[name=reason]", "Selfie is blurry");
await admin.click("button:has-text('Send')");
await admin.waitForURL("**/admin/kyc");
await user.reload();
await expectText(user, "Selfie is blurry");
await user.fill("#pan", "ABCDE1234F");
await user.setInputFiles("#selfie", OUT + "/doc.png");
await user.check("input[name=maskedConfirmed]");
await user.click("text=Submit for review");
await expectText(user, "Submitted, under review");
await admin.goto(BASE + "/admin/kyc");
await admin.click("table a");
await admin.click("button:has-text('Approve')");
await admin.waitForURL("**/admin/kyc");
console.log("kyc: needs changes -> resubmit -> approved");

// 4. Payout method
await user.goto(BASE + "/payout-methods");
await user.fill("#holderName", "Test K Sharma");
await user.fill("#accountNumber", "123456789012");
await user.fill("#accountNumberConfirm", "123456789012");
await user.fill("#ifsc", "HDFC0001234");
await user.click("text=Save for review");
await expectText(user, "Pending review");
await admin.goto(BASE + "/admin/payout-methods");
await expectText(admin, "Names differ");
await shot(admin, "04-admin-payout-name-mismatch");
await admin.click("button:has-text('Approve')");
await expectText(admin, "Nothing waiting.");
console.log("payout method approved (mismatch highlighted)");

// 5. Sell
await user.goto(BASE + "/sell");
await user.click("label:has-text('Tron (TRC-20)')");
await user.fill("input[name=amount]", "100");
await shot(user, "05-user-sell");
await user.click("text=Get my quote");
await user.waitForURL("**step=quote");
await shot(user, "06-user-quote");
await user.click("text=Confirm and get deposit address");
await expectText(user, "Deposit address");
const amount = (await user.locator("text=/^\\d+\\.\\d+ USDT$/").first().innerText()).replace(" USDT", "");
await shot(user, "07-user-deposit");
const orderUrl = user.url();
const orderId = orderUrl.split("/orders/")[1];
console.log("order", orderId, "amount", amount);

// 6. Simulated payment
await admin.goto(BASE + "/admin/dev");
await admin.selectOption("select[name=network]", "TRON");
await admin.fill("input[name=amount]", amount);
await admin.click("button:has-text('Simulate')");
await expectText(admin, "CONFIRMED");
console.log("payment simulated and matched");
await user.goto(orderUrl);
await expectText(user, "Payment received");

// 7. Admin workflow
await admin.goto(`${BASE}/admin/orders/${orderId}`);
await admin.click("button:has-text('Start review')");
await expectText(admin, "In review");
admin.on("dialog", (d) => d.accept());
await admin.fill("textarea[name=note]", "Checked sender on scam tool: no flags");
await admin.check("input[value=CLEAN]");
await admin.click("text=Save wallet check");
await expectText(admin, "CLEAN");
await admin.click("button:has-text('Approve')");
await expectText(admin, "Mark as paid");
const net = (await admin.getByText(/Amount paid \(must be/).innerText()).match(/must be ([\d.]+)/)[1];
await admin.fill("input[name=utr]", "HDFCN52026092812");
await admin.fill("input[name=amount]", (Number(net) + 1).toFixed(2));
await admin.fill("input[name=totp]", await freshCode(secret));
await admin.click("button:has-text('Mark as paid')");
await expectText(admin, "must equal");
console.log("wrong paid amount blocked");
await admin.fill("input[name=amount]", net);
await admin.fill("input[name=totp]", await freshCode(secret));
await admin.click("button:has-text('Mark as paid')");
await expectText(admin, "Receipt PDF");
await shot(admin, "08-admin-order-paid");
console.log("marked paid");

// 8. User sees paid + receipt
await user.goto(orderUrl);
await expectText(user, "Bank reference: HDFCN52026092812");
await shot(user, "09-user-order-paid");
const r = await user.request.get(`${BASE}/api/orders/${orderId}/receipt`);
console.log("receipt", r.status(), r.headers()["content-type"], (await r.body()).length, "bytes");
fs.writeFileSync(OUT + "/receipt.pdf", await r.body());

// Audit log shows doc views
await admin.goto(BASE + "/admin/audit?action=KYC_DOC");
await expectText(admin, "KYC_DOC_VIEWED");
console.log("doc view logged");
await browser.close();
console.log("E2E OK");
