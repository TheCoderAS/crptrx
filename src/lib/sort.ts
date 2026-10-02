/** The sort key from the URL, or the default when it's missing or unknown. */
export function pickSort<K extends string>(value: string | undefined, allowed: readonly K[], fallback: K): K {
  return allowed.includes(value as K) ? (value as K) : fallback;
}
