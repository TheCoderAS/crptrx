// Runs once when the server starts. Checks APP_MODE up front so a live service
// with the setting missing stops at deploy (Render then keeps the previous
// version running) instead of serving pages that all fail.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  try {
    const mode = env.appMode; // throws when missing or invalid in production
    console.log(`[startup] APP_MODE=${mode ?? "(not set: development, using the stored mode)"}`);
  } catch (e) {
    console.error(`[startup] ${(e as Error).message}`);
    process.exit(1);
  }
}
