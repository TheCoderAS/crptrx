// The browser's background script for push notifications (chat replies come in
// from Firebase Cloud Messaging as data-only messages). Served from the site
// root so it covers every page.
const SCRIPT = `
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    return;
  }
  const d = payload.data || payload.notification || {};
  if (!d.title) return;
  const link = d.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Already looking at that order: the chat updates by itself.
      if (wins.some((w) => w.focused && new URL(w.url).pathname === link)) return;
      return self.registration.showNotification(d.title, { body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "/icon", data: { link } });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
`;

export function GET() {
  return new Response(SCRIPT, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
}
