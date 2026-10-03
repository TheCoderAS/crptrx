// Checks the live-chat access rules and the server's Firebase code against the
// local Firebase emulator (no real project, no network):
//   npx firebase-tools emulators:exec --project demo-chat "npx tsx scripts/check-chat-rules.ts"
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";

process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const project = "demo-chat";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: project, client_email: `test@${project}.iam.gserviceaccount.com`, private_key: privateKey });
process.env.FIREBASE_DATABASE_URL = `http://127.0.0.1:9000?ns=${project}-default-rtdb`;
process.env.FIREBASE_API_KEY = "demo-key";
process.env.FIREBASE_PROJECT_ID = project;

async function main() {
  const { chatToken, signalChat } = await import("../src/server/firebase/chatSignal");
  const { initializeApp } = await import("firebase/app");
  const { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithCustomToken } = await import("firebase/auth");
  const { connectDatabaseEmulator, get, getDatabase, ref, serverTimestamp, set } = await import("firebase/database");

  let n = 0;
  async function as(v: { type: "USER"; userId: string } | { type: "ADMIN"; adminId: string } | null) {
    const app = initializeApp({ apiKey: "demo-key", projectId: project, databaseURL: `http://127.0.0.1:9000?ns=${project}-default-rtdb` }, `t${n++}`);
    const db = getDatabase(app);
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
    if (v) {
      const auth = initializeAuth(app, { persistence: inMemoryPersistence });
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      const t = await chatToken(v);
      assert.ok(t, "chat token");
      await signInWithCustomToken(auth, t.token);
    }
    return db;
  }
  const can = (p: Promise<unknown>) => p.then(() => true, () => false);

  signalChat("alice", "ORD-1", "message", "ADMIN");
  await new Promise((r) => setTimeout(r, 500));

  const alice = await as({ type: "USER", userId: "alice" });
  const bob = await as({ type: "USER", userId: "bob" });
  const staff = await as({ type: "ADMIN", adminId: "adm1" });
  const nobody = await as(null);

  // The server's signal arrived, and carries no message text.
  const sig = (await get(ref(alice, "chat/u/alice/ORD-1/sig"))).val();
  assert.deepEqual(Object.keys(sig).sort(), ["at", "by", "kind"]);
  assert.equal(sig.kind, "message");
  assert.equal((await get(ref(staff, "chat/inbox"))).val().orderId, "ORD-1");

  // Reading
  assert.equal(await can(get(ref(alice, "chat/u/alice/ORD-1"))), true, "owner reads own order");
  assert.equal(await can(get(ref(bob, "chat/u/alice/ORD-1"))), false, "other customer can't read");
  assert.equal(await can(get(ref(bob, "chat/u/alice"))), false, "can't list someone's orders");
  assert.equal(await can(get(ref(nobody, "chat/u/alice/ORD-1"))), false, "signed-out can't read");
  assert.equal(await can(get(ref(staff, "chat/u/alice/ORD-1"))), true, "admin reads");
  assert.equal(await can(get(ref(alice, "chat/inbox"))), false, "customer can't read the inbox");
  assert.equal(await can(get(ref(alice, "chat"))), false, "nobody reads everything");

  // Writing: only your own typing mark, only a time.
  assert.equal(await can(set(ref(alice, "chat/u/alice/ORD-1/typing/user"), serverTimestamp())), true, "owner types");
  assert.equal(await can(set(ref(alice, "chat/u/alice/ORD-1/typing/admin"), serverTimestamp())), false, "customer can't fake support typing");
  assert.equal(await can(set(ref(bob, "chat/u/alice/ORD-1/typing/user"), serverTimestamp())), false, "other customer can't type there");
  assert.equal(await can(set(ref(alice, "chat/u/alice/ORD-1/typing/user"), "hello")), false, "typing mark holds only a time");
  assert.equal(await can(set(ref(alice, "chat/u/alice/ORD-1/sig"), { at: 1, by: "ADMIN", kind: "message" })), false, "customer can't fake a signal");
  assert.equal(await can(set(ref(alice, "chat/u/alice/ORD-1/note"), "x")), false, "no other data");
  assert.equal(await can(set(ref(staff, "chat/u/alice/ORD-1/typing/admin"), serverTimestamp())), true, "admin types");
  assert.equal(await can(set(ref(staff, "chat/inbox"), { at: 1 })), false, "admin page can't write the inbox");

  console.log("chat rules: all checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
