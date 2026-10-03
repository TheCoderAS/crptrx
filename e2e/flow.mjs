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
// Tiny valid one-page PDF
function pdf() {
  const stream = "BT /F1 24 Tf 40 100 Td (Test PDF) Tj ET";
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
fs.writeFileSync(OUT + "/doc.pdf", pdf());

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
// Confirmations are in-app dialogs: press their confirm button when one appears.
const confirmIfAsked = async (p) => {
  const ok = p.locator("[data-confirm-ok]");
  try { await ok.waitFor({ timeout: 2000 }); await ok.click(); } catch { /* this action didn't ask */ }
};
const user = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
// Only visible matches: some screens render a phone layout and a desktop layout, one of them hidden.
const expectText = async (p, t) => { await p.getByText(t, { exact: false }).locator("visible=true").first().waitFor({ timeout: 15000 }); };

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
// Test sign-in is folded away when real sign-in methods are on.
if (await user.locator("summary:has-text('Test sign-in')").count()) await user.click("summary:has-text('Test sign-in')");
await user.fill("#dev-email", "tester@example.com");
await user.click("text=Continue with test sign-in");
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
for (const f of ["panDoc", "aadhaarFront", "aadhaarBack", "selfie"]) await user.setInputFiles("#" + f, OUT + (f === "aadhaarBack" ? "/doc.pdf" : "/doc.png"));
await user.check("input[name=maskedConfirmed]");
await shot(user, "03-user-kyc-form");
await user.click("text=Submit for review");
await expectText(user, "Submitted, under review");
console.log("kyc submitted");

// Admin: needs changes, then approve after resubmission
await admin.goto(BASE + "/admin/reviews?tab=kyc");
await admin.click("table a");
await expectText(admin, "Test Kumar Sharma");
// Documents open in an in-app viewer, on a signed link that actually loads.
await admin.click("button:has-text('PAN card')");
const docImg = admin.locator("[role=dialog] img");
await docImg.waitFor();
await admin.waitForFunction(() => { const i = document.querySelector("[role=dialog] img"); return i && i.complete && i.naturalWidth > 0; });
console.log("doc view opened:", (await docImg.getAttribute("src")).startsWith("/api/files?") ? "signed link, in app" : await docImg.getAttribute("src"));
await admin.keyboard.press("Escape");
// PDFs are drawn in the app (PDF.js), so they show on phones too.
await admin.click("button:has-text('Masked Aadhaar back')");
await admin.waitForFunction(() => { const c = document.querySelector("[role=dialog] canvas"); return c && c.width > 0; }, null, { timeout: 20000 });
await shot(admin, "03b-admin-pdf-preview");
console.log("pdf preview drawn in app");
await admin.keyboard.press("Escape");
await admin.fill("#reason-changes", "Selfie is blurry");
await admin.click("button:has-text('Ask for changes')");
await admin.waitForURL("**/admin/reviews?tab=kyc");
await user.reload();
await expectText(user, "Selfie is blurry");
await user.fill("#pan", "ABCDE1234F");
await user.setInputFiles("#selfie", OUT + "/doc.png");
await user.check("input[name=maskedConfirmed]");
await user.click("text=Submit for review");
await expectText(user, "Submitted, under review");
await admin.goto(BASE + "/admin/reviews?tab=kyc");
await admin.click("table a");
await admin.click("button:has-text('Approve')");
await admin.waitForURL("**/admin/reviews?tab=kyc");
console.log("kyc: needs changes -> resubmit -> approved");

// 4. Payout method (the link opens the add dialog)
await user.goto(BASE + "/payout-methods?add=1");
await user.fill("#holderName", "Test K Sharma");
await user.fill("#accountNumber", "123456789012");
await user.fill("#accountNumberConfirm", "123456789012");
await user.fill("#ifsc", "HDFC0001234");
await user.click("text=Save for review");
await expectText(user, "Pending review");
await admin.goto(BASE + "/admin/reviews?tab=payout");
await expectText(admin, "ID says:");
await shot(admin, "04-admin-payout-name-mismatch");
await admin.click("button:has-text('Approve')");
await confirmIfAsked(admin);
await expectText(admin, "All clear");
console.log("payout method approved (mismatch highlighted)");

// 5. Sell
await user.goto(BASE + "/sell");
await user.click("label:has-text('Tron (TRC-20)')");
await user.fill("input[name=amount]", "100");
await shot(user, "05-user-sell");
await user.click("button:has-text('Get my quote'):visible");
await user.waitForURL("**step=quote");
await shot(user, "06-user-quote");
await user.click("text=Confirm and get deposit address");
await expectText(user, "Deposit address");
await user.waitForURL((u) => !u.search.includes("step=quote")); // the order's own address, read below
const amount = (await user.locator("text=/^\\d+\\.\\d+ USDT$/").first().innerText()).replace(" USDT", "");
await shot(user, "07-user-deposit");
const orderUrl = user.url();
const orderId = orderUrl.split("/orders/")[1];
console.log("order", orderId, "amount", amount);

// 6. Simulated payment
await admin.goto(BASE + "/admin/dev");
// Network defaults to Tron in the (in-app) dropdown.
await admin.fill("input[name=amount]", amount);
await admin.click("button:has-text('Simulate')");
await expectText(admin, "CONFIRMED");
console.log("payment simulated and matched");
await user.goto(orderUrl);
await expectText(user, "Payment received");

// A payment no order matches lands in Unmatched with its reason.
await admin.goto(BASE + "/admin/dev");
await admin.fill("input[name=amount]", "77.77");
await admin.click("button:has-text('Simulate')");
await expectText(admin, "no order matched");
await admin.goto(BASE + "/admin/unmatched");
await expectText(admin, "No open order for exactly 77.77 USDT");
await shot(admin, "07b-admin-unmatched");
console.log("unmatched payment explains why");

// Support chat on the order: customer asks, support answers in the inbox/order page, customer sees it.
await user.goto(orderUrl);
await user.click("button[aria-label='Chat with support']");
await expectText(user, "Send us a message");
await user.fill("[role=dialog] textarea[aria-label=Message]", "Is my payment okay?");
await user.click("[role=dialog] button[aria-label=Send]");
await expectText(user, "Is my payment okay?");
// An image: thumbnail in the bubble, full view inside the app (no new tab).
await user.setInputFiles("[role=dialog] input[type=file]", OUT + "/doc.png");
await user.locator("[role=dialog] img[alt='Image to send']").waitFor();
await user.click("[role=dialog] button[aria-label=Send]");
await user.locator("[role=dialog] button[aria-label='Open image'] img").waitFor();
await user.click("[role=dialog] button[aria-label='Open image']");
await user.locator("[role=dialog][aria-label='Image'] img").waitFor();
await user.click("button[aria-label='Close image']");
if (await user.getByRole("dialog", { name: "Image" }).count()) throw new Error("image viewer didn't close");
// PDFs can't be sent in chat.
await user.setInputFiles("[role=dialog] input[type=file]", OUT + "/doc.pdf");
await expectText(user, "Only JPG or PNG images can be sent.");
await shot(user, "07e-user-chat");
await admin.goto(BASE + "/admin/support");
await expectText(admin, "tester@example.com");
await shot(admin, "07f-admin-support-inbox");
await admin.click(`a[href='/admin/orders/${orderId}']`);
const adminChat = "[role=dialog][aria-label='Chat with customer']";
await admin.click("button[aria-label='Chat with customer']");
await expectText(admin, "Is my payment okay?");
await admin.fill(`${adminChat} textarea`, "Yes, received. Reviewing now.");
await admin.click(`${adminChat} button[aria-label=Send]`);
await expectText(admin, "Yes, received. Reviewing now.");
await expectText(user, "Yes, received. Reviewing now.");
await expectText(user, "Seen");
await shot(user, "07g-user-chat-reply");
await admin.screenshot({ path: `${OUT}/07h-admin-order-chat.png` });
await admin.click(`${adminChat} button:has-text('Resolve')`);
await expectText(admin, "Reopen");
await admin.click(`${adminChat} button[aria-label='Close chat with customer']`);
await admin.goto(BASE + "/admin/support?view=resolved");
await expectText(admin, "tester@example.com");
console.log("support chat round trip works");

// 7. Admin workflow
await admin.goto(`${BASE}/admin/orders/${orderId}`);
await admin.click("button:has-text('Start review')");
await expectText(admin, "In review");
await shot(admin, "07c-admin-review");
// The wallet check is optional: approve straight away (recorded as clean).
await expectText(admin, "Wallet: clean");
await admin.click("button:has-text('Approve')");
await confirmIfAsked(admin);
await expectText(admin, "Mark as paid");
await shot(admin, "07d-admin-approved");
const net = await admin.getAttribute("input[name=amount]", "placeholder");
// UTR left empty: it's optional.
await admin.fill("input[name=amount]", (Number(net) + 1).toFixed(2));
await admin.click("button:has-text('Mark as paid')");
await confirmIfAsked(admin);
await expectText(admin, "must equal");
console.log("wrong paid amount blocked");
await admin.fill("input[name=amount]", net);
await admin.click("button:has-text('Mark as paid')");
await confirmIfAsked(admin);
// The 2FA code from login covers 15 minutes; after that the app asks for a code once.
if (await admin.getByText("Confirm it's you").isVisible({ timeout: 2000 }).catch(() => false)) {
  await admin.fill("input[aria-label='2FA code']", await freshCode(secret));
  await admin.click("[role=dialog] button:has-text('Confirm')");
}
await expectText(admin, "Receipt PDF");
await shot(admin, "08-admin-order-paid");
console.log("marked paid");

// 8. User sees paid + receipt
await user.goto(orderUrl);
await expectText(user, "Download receipt");
if (await user.getByText("Bank reference (UTR)").count()) throw new Error("UTR row shown although no UTR was entered");
await shot(user, "09-user-order-paid");
const r = await user.request.get(`${BASE}/api/orders/${orderId}/receipt`);
console.log("receipt", r.status(), r.headers()["content-type"], (await r.body()).length, "bytes");
fs.writeFileSync(OUT + "/receipt.pdf", await r.body());

// 9. A payment that wasn't matched shows up on the order, and the admin confirms it there.
await admin.goto(BASE + "/admin/dev");
await admin.fill("input[name=amount]", "55");
await admin.click("button:has-text('Simulate')");
await expectText(admin, "no order matched"); // arrives before the order exists
await user.goto(BASE + "/sell");
await user.click("label:has-text('Tron (TRC-20)')");
await user.fill("input[name=amount]", "55");
await user.click("button:has-text('Get my quote'):visible");
await user.waitForURL("**step=quote");
await user.click("text=Confirm and get deposit address");
await expectText(user, "Deposit address");
const order2 = user.url().split("/orders/")[1];
await admin.goto(`${BASE}/admin/orders?status=QUOTE_READY`);
await expectText(admin, "Possible payment found");
await admin.goto(`${BASE}/admin/orders/${order2}`);
await expectText(admin, "may be this order's");
await shot(admin, "10-admin-possible-payment");
await admin.click("button:has-text('Confirm for this order')");
await admin.fill("[role=dialog] textarea[name=note]", "Customer confirmed the wallet; amount matches");
await admin.click("[role=dialog] button:has-text('Confirm payment')");
await expectText(admin, "Start review");
console.log("unmatched payment confirmed from the order page");

// Audit log shows doc views
await admin.goto(BASE + "/admin/audit?cat=customers");
await expectText(admin, "KYC doc viewed");
await shot(admin, "10b-admin-audit-filter");
console.log("doc view logged");
// Admin lists at phone width: cards, not squeezed tables.
await admin.setViewportSize({ width: 390, height: 844 });
for (const [path, name] of [["/admin/orders", "orders"], ["/admin/users", "users"], ["/admin/reviews", "reviews"], ["/admin/audit", "audit"]]) {
  await admin.goto(BASE + path);
  await shot(admin, `11-admin-${name}-phone`);
}
await admin.setViewportSize({ width: 1280, height: 900 });
await admin.goto(BASE + "/admin/orders");
await shot(admin, "12-admin-orders-desktop");
await browser.close();
console.log("E2E OK");
