// The web app plus live support chat (WebSocket at /ws) on one port.
// Next.js can't hold WebSocket connections by itself, so this small server
// runs Next and adds the chat socket. Started by `npm run dev`, `npm start`
// and the Docker entrypoint.
import { createServer } from "node:http";
import next from "next";
import { attachChat } from "./src/server/chat/ws";

async function main() {
  const dev = process.env.NODE_ENV !== "production";
  const port = Number(process.env.PORT ?? 3000);
  const app = next({ dev, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = createServer((req, res) => void handle(req, res));
  // Anything that isn't /ws (Next's own dev reload socket) goes to Next.
  attachChat(server, app.getUpgradeHandler());
  server.listen(port, () => console.log(`Ready on port ${port}${dev ? " (dev)" : ""}`));
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
