/** fetch with timeout and a clear error. Retries are handled by the watcher loop. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}
