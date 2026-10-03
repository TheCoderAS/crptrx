import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { sha256 } from "../crypto";
import { prisma } from "../db";
import { env } from "../env";
import { getSettings } from "../settings";
import { hub, INBOX, orderRoom, type ChatEvent } from "./hub";
import { chatOrder, markChatRead, type ChatViewer } from "./service";

// Live support chat at /ws. One socket follows one order's chat (?order=ID), or,
// for admins, the support inbox (?inbox=1). Messages are sent over HTTP (so
// uploads, rate limits and errors work as everywhere else) and arrive here live.

const USER_IDLE_MS = 7 * 24 * 3600_000;
const ADMIN_IDLE_MS = 30 * 60_000;
const PING_MS = 25_000;

function cookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** The visitor's IP, counted from the right like clientIp() in auth/session. */
function ipOf(req: IncomingMessage): string | null {
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 0);
  if (hops === 0) return null;
  const list = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list[list.length - hops] ?? null;
}

async function liveSession(token: string | null, subjectType: string, idleMs: number) {
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: sha256(token) } });
  const now = Date.now();
  if (!s || s.subjectType !== subjectType || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > idleMs) return null;
  return s;
}

/** Same rules as currentUser()/currentAdmin(), read from the upgrade request. */
export async function viewersFromRequest(req: IncomingMessage): Promise<{ user?: ChatViewer; admin?: ChatViewer }> {
  const out: { user?: ChatViewer; admin?: ChatViewer } = {};
  const us = await liveSession(cookie(req.headers.cookie, "sid"), "USER", USER_IDLE_MS);
  if (us) {
    const u = await prisma.user.findUnique({ where: { id: us.subjectId }, select: { status: true } });
    if (u?.status === "ACTIVE") out.user = { type: "USER", userId: us.subjectId };
  }
  const as = await liveSession(cookie(req.headers.cookie, "asid"), "ADMIN", ADMIN_IDLE_MS);
  if (as && as.stage === "FULL") {
    const a = await prisma.admin.findUnique({ where: { id: as.subjectId }, select: { status: true, totpEnabled: true } });
    const allow = (await getSettings()).admin_ip_allowlist;
    const ip = ipOf(req);
    if (a?.status === "ACTIVE" && a.totpEnabled && (allow.length === 0 || (ip && allow.includes(ip)))) out.admin = { type: "ADMIN", adminId: as.subjectId };
  }
  return out;
}

/** Only our own pages may open a chat socket (blocks other sites riding on the cookie). */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const o = new URL(origin);
    return o.host === req.headers.host || o.origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}

function reject(socket: Duplex, code: number, reason: string) {
  socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

type Upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => unknown;

/** Serve /ws on the app's HTTP server; any other upgrade (Next's dev reload) goes to `other`. */
export function attachChat(server: Server, other?: Upgrade) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return other ? other(req, socket, head) : socket.destroy();
    void (async () => {
      try {
        if (!sameOrigin(req)) return reject(socket, 403, "Forbidden");
        const { user, admin } = await viewersFromRequest(req);
        const orderId = url.searchParams.get("order");
        let viewer: ChatViewer | undefined;
        let room: string;
        if (url.searchParams.get("inbox") === "1") {
          if (!admin) return reject(socket, 401, "Unauthorized");
          viewer = admin;
          room = INBOX;
        } else if (orderId) {
          // Admin pages connect as the admin; customer pages as the customer.
          viewer = url.searchParams.get("as") === "admin" ? admin : user;
          if (!viewer) return reject(socket, 401, "Unauthorized");
          await chatOrder(orderId, viewer).catch(() => (viewer = undefined));
          if (!viewer) return reject(socket, 404, "Not Found");
          room = orderRoom(orderId);
        } else return reject(socket, 400, "Bad Request");
        wss.handleUpgrade(req, socket, head, (ws) => connected(ws, viewer!, room, orderId));
      } catch {
        reject(socket, 500, "Internal Server Error");
      }
    })();
  });

  // Close sockets that stopped answering (phone asleep, network gone).
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      const w = ws as WebSocket & { alive?: boolean };
      if (w.alive === false) w.terminate();
      else {
        w.alive = false;
        w.ping();
      }
    }
  }, PING_MS);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return wss;
}

function connected(ws: WebSocket & { alive?: boolean }, viewer: ChatViewer, room: string, orderId: string | null) {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  const forward = (e: ChatEvent | { orderId: string }) => {
    // Your own typing isn't echoed back to you.
    if ("type" in e && e.type === "typing" && e.from === viewer.type) return;
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
  };
  hub.on(room, forward);
  ws.on("close", () => hub.off(room, forward));

  let lastTyping = 0;
  let budget = 30; // incoming frames per minute
  const refill = setInterval(() => (budget = 30), 60_000);
  refill.unref();
  ws.on("close", () => clearInterval(refill));

  ws.on("message", (raw) => {
    if (--budget < 0 || !orderId) return;
    let msg: { type?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "typing") {
      if (Date.now() - lastTyping < 2000) return;
      lastTyping = Date.now();
      hub.emit(room, { type: "typing", from: viewer.type } satisfies ChatEvent);
    } else if (msg.type === "read") {
      void markChatRead(orderId, viewer).catch(() => undefined);
    }
  });
}
