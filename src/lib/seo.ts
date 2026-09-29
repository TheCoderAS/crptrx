/** Public base URL for canonical links, sitemap and share previews. */
export const siteUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
