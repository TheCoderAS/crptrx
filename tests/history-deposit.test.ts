import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { applyDueAddressChanges, cancelAddressChange, getActiveDepositAddress, requestAddressChange } from "@/server/deposit";
import { getSettings, setNetworkMode, updateSetting, writeSetting } from "@/server/settings";
import { ADDR, baseSettings, makeOrder, randBsc, randTron, resetDb } from "./helpers";

const SUPER = { type: "ADMIN" as const, id: "super-1" };

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

describe("append-only history (spec 9, M1)", () => {
  it("order_events, settings_history and audit_log reject updates and deletes", async () => {
    await makeOrder("TRON");
    for (const t of ["order_events", "settings_history", "audit_log"]) {
      await expect(prisma.$executeRawUnsafe(`UPDATE "${t}" SET "createdAt" = now()`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "${t}"`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`TRUNCATE "${t}"`)).rejects.toThrow(/append-only/);
    }
  });

  it("every setting change is logged with old and new value", async () => {
    await updateSetting("rate", "91.25", SUPER);
    const h = await prisma.settingsHistory.findMany({ where: { key: "rate" }, orderBy: { createdAt: "desc" }, take: 1 });
    expect(h[0].oldValue).toBe("90");
    expect(h[0].newValue).toBe("91.25");
    expect(h[0].changedBy).toBe("super-1");
    expect(await prisma.auditLog.count({ where: { action: "SETTING_CHANGED", actorId: "super-1" } })).toBe(1);
  });
});

describe("settings rules (spec 5.5)", () => {
  it("switching to Live needs the typed confirmation", async () => {
    await expect(setNetworkMode("LIVE", "yes", SUPER)).rejects.toThrow(/SWITCH TO LIVE/);
    await setNetworkMode("LIVE", "SWITCH TO LIVE", SUPER);
    expect((await getSettings()).network_mode).toBe("LIVE");
  });
  it("token contracts are editable only in Test mode, and never the mainnet contract", async () => {
    await expect(updateSetting("test_token_contract", { TRON: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", BSC: randBsc() }, SUPER)).rejects.toThrow(/mainnet/);
    await updateSetting("test_token_contract", { TRON: randTron(), BSC: randBsc() }, SUPER);
    await writeSetting("network_mode", "LIVE", SUPER);
    await expect(updateSetting("test_token_contract", { TRON: randTron(), BSC: randBsc() }, SUPER)).rejects.toThrow(/Test mode/);
  });
});

describe("deposit address protection (spec 10.3, M8)", () => {
  it("a Tron address in the BSC field is rejected, and vice versa", async () => {
    await expect(requestAddressChange("BSC", randTron(), SUPER)).rejects.toThrow(/Tron/);
    await expect(requestAddressChange("TRON", randBsc(), SUPER)).rejects.toThrow(/BNB Smart Chain/);
  });

  it("a BSC address with a broken checksum is rejected", async () => {
    const good = randBsc();
    const flipped = good.slice(0, 2) + [...good.slice(2)].map((c) => (/[a-f]/.test(c) ? c.toUpperCase() : /[A-F]/.test(c) ? c.toLowerCase() : c)).join("");
    if (flipped !== good && flipped.toLowerCase() !== flipped) await expect(requestAddressChange("BSC", flipped, SUPER)).rejects.toThrow();
  });

  it("applies at once by default (no wait set)", async () => {
    const newAddr = randBsc();
    const r = await requestAddressChange("BSC", newAddr, SUPER);
    expect(r.immediate).toBe(true);
    expect(await getActiveDepositAddress("BSC")).toBe(newAddr);
  });

  it("the first address applies at once even with a wait set", async () => {
    await writeSetting("address_change_delay_minutes", 60, { type: "SYSTEM", id: null });
    await writeSetting("deposit_address", { TEST: { TRON: ADDR.TRON, BSC: "" }, LIVE: { TRON: "", BSC: "" } }, { type: "SYSTEM", id: null });
    const newAddr = randBsc();
    expect((await requestAddressChange("BSC", newAddr, SUPER)).immediate).toBe(true);
    expect(await getActiveDepositAddress("BSC")).toBe(newAddr);
  });

  it("with a 60-minute wait: takes effect only after it, and the cancel link works", async () => {
    await writeSetting("address_change_delay_minutes", 60, { type: "SYSTEM", id: null });
    const newAddr = randBsc();
    const { change, token } = await requestAddressChange("BSC", newAddr, SUPER);
    expect(change.effectiveAt.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(await getActiveDepositAddress("BSC")).toBe(ADDR.BSC);
    // 61 minutes later
    await applyDueAddressChanges(new Date(Date.now() + 61 * 60_000));
    expect(await getActiveDepositAddress("BSC")).toBe(newAddr);

    const other = randBsc();
    const r2 = await requestAddressChange("BSC", other, SUPER);
    await cancelAddressChange({ token: r2.token }, SUPER);
    await applyDueAddressChanges(new Date(Date.now() + 61 * 60_000));
    expect(await getActiveDepositAddress("BSC")).toBe(newAddr);
    expect(token).toBeTruthy();
  });

  it("old orders keep their saved address", async () => {
    const { order } = await makeOrder("TRON");
    await requestAddressChange("TRON", randTron(), SUPER); // instant by default
    await applyDueAddressChanges(new Date(Date.now() + 61 * 60_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).depositAddress).toBe(ADDR.TRON);
  });
});
