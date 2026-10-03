import { api } from "@/server/http";
import { appChannel, latestAppRelease } from "@/server/appRelease";

/** The newest Android app file for this server (the app checks it on start and offers the update). */
export const GET = api(async () => {
  const r = await latestAppRelease();
  return r ?? { channel: appChannel(), versionName: null, versionCode: 0, url: null };
});
