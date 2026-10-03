import { getAuth } from "firebase-admin/auth";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { env } from "../env";
import { firebaseApp, liveChatReady, logFirebaseError } from "./admin";

// Live chat runs on our own database; Firebase only rings the bell. When a
// message is saved, read or resolved, the server writes a tiny "order X changed"
// note to Firebase. The open chat hears it at once and fetches the new state
// from our API. No message text or files ever go to Firebase.
//
// Layout (access rules: firebase/database.rules.json):
//   chat/u/<userId>/<orderId>/sig            { at, by, kind }   written by the server
//   chat/u/<userId>/<orderId>/typing/<side>  time              written by that side
//   chat/inbox                               { at, orderId }    written by the server, read by admins

export type ChatSignalKind = "message" | "read" | "thread";

export const chatUid = (v: { type: "USER"; userId: string } | { type: "ADMIN"; adminId: string }) => (v.type === "USER" ? `u_${v.userId}` : `a_${v.adminId}`);

/** Tell open chats that this order's chat changed. Never throws, never delays the caller. */
export function signalChat(userId: string, orderId: string, kind: ChatSignalKind, by: "USER" | "ADMIN") {
  if (!liveChatReady()) return;
  const app = firebaseApp()!;
  const db = getDatabase(app);
  const at = ServerValue.TIMESTAMP;
  void Promise.all([
    db.ref(`chat/u/${userId}/${orderId}/sig`).set({ at, by, kind }),
    db.ref("chat/inbox").set({ at, orderId }),
  ]).catch((e) => logFirebaseError("chat signal", e));
}

/** A one-off sign-in for the chat listener: customers may read only their own orders, admins all. */
export async function chatToken(v: { type: "USER"; userId: string } | { type: "ADMIN"; adminId: string }) {
  if (!liveChatReady()) return null;
  const token = await getAuth(firebaseApp()!).createCustomToken(chatUid(v), v.type === "ADMIN" ? { staff: true } : {});
  return {
    token,
    config: { ...env.firebase.webConfig!, databaseURL: env.firebase.databaseUrl!, messagingSenderId: env.firebase.messagingSenderId },
  };
}
