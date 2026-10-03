// Central place for environment settings. Secrets live only in env, never in code.
function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment setting ${name}`);
  return v;
}
function opt(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

export const env = {
  get appUrl() {
    return req("APP_URL", "http://localhost:3000");
  },
  /** 32-byte key, base64 or hex. Encrypts PAN, account numbers, 2FA secrets. */
  get encryptionKey() {
    return req("ENCRYPTION_KEY");
  },
  /** Secret for signing short-lived file links. */
  get linkSigningSecret() {
    return req("LINK_SIGNING_SECRET", process.env.ENCRYPTION_KEY);
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  /**
   * LIVE (real networks, real money) or TEST, fixed per deployment: the live
   * service sets APP_MODE=LIVE, staging APP_MODE=TEST. Required when the app
   * runs in production, so a service with the setting missing fails at deploy
   * instead of quietly watching the wrong network. Unset in development and
   * tests: the mode stored in the database is used.
   */
  get appMode(): "LIVE" | "TEST" | null {
    const v = opt("APP_MODE")?.trim().toUpperCase();
    if (v === "LIVE" || v === "TEST") return v;
    if (v) throw new Error(`APP_MODE must be LIVE or TEST (it is "${v}")`);
    const building = process.env.NEXT_PHASE === "phase-production-build";
    if (process.env.NODE_ENV === "production" && !building) throw new Error("Missing environment setting APP_MODE: set it to LIVE on the live service, TEST on staging");
    return null;
  },
  /** Allows the "test login" form for users. Never on in Live, whatever the setting says. */
  get devLoginEnabled() {
    return process.env.DEV_LOGIN_ENABLED === "true" && this.appMode !== "LIVE";
  },
  /** Shows OTP codes on screen and enables the test-transfer simulator. Never on in Live. */
  get devToolsEnabled() {
    return process.env.DEV_TOOLS_ENABLED === "true" && this.appMode !== "LIVE";
  },
  get secureCookies() {
    return (process.env.SECURE_COOKIES ?? (this.appUrl.startsWith("https") ? "true" : "false")) === "true";
  },
  /** Read at request time (not baked into the build), so one Docker image works everywhere. */
  firebase: {
    get projectId() {
      return opt("FIREBASE_PROJECT_ID");
    },
    get webConfig() {
      const apiKey = opt("FIREBASE_API_KEY");
      const projectId = opt("FIREBASE_PROJECT_ID");
      if (!apiKey || !projectId) return null;
      return {
        apiKey,
        projectId,
        authDomain: opt("FIREBASE_AUTH_DOMAIN") ?? `${projectId}.firebaseapp.com`,
        appId: opt("FIREBASE_APP_ID"),
      };
    },
    /** Service account key (the JSON file, pasted as is or base64). Lets the server sign people into chat and send push. */
    get serviceAccount(): { project_id: string; client_email: string; private_key: string } | null {
      const raw = opt("FIREBASE_SERVICE_ACCOUNT");
      if (!raw) return null;
      try {
        return JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
      } catch {
        throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the key file's contents, or base64 of it)");
      }
    },
    /** Realtime Database address, e.g. https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app */
    get databaseUrl() {
      return opt("FIREBASE_DATABASE_URL");
    },
    get messagingSenderId() {
      return opt("FIREBASE_MESSAGING_SENDER_ID");
    },
    /** Web push key pair (public half), from Cloud Messaging > Web configuration. */
    get vapidKey() {
      return opt("FIREBASE_VAPID_KEY");
    },
  },
  /** The Android app (android/ in this repo). It reads these from /api/app/config, so one app file fits any server. */
  android: {
    /** OAuth "Web client" ID (Google Cloud > Credentials; Firebase creates it). The app's Google sign-in asks for a token for it. */
    get googleWebClientId() {
      return opt("GOOGLE_WEB_CLIENT_ID");
    },
    /** Firebase > Project settings > Your apps > the Android app's "App ID" (1:…:android:…). Needed for app push notifications. */
    get firebaseAppId() {
      return opt("FIREBASE_ANDROID_APP_ID");
    },
    /** GitHub repository whose releases hold the app files. */
    get releasesRepo() {
      return opt("ANDROID_RELEASES_REPO") ?? "TheCoderAS/crptrx";
    },
  },
  storage: {
    /** Supabase whenever it's configured, so a missing STORAGE_DRIVER can't send files to a disk that's wiped on redeploy. */
    get driver() {
      return (process.env.STORAGE_DRIVER ?? (process.env.SUPABASE_URL ? "supabase" : "local")) as "local" | "supabase";
    },
    get localDir() {
      return process.env.STORAGE_LOCAL_DIR ?? "./.data/uploads";
    },
    /** e.g. https://abcdefgh.supabase.co (Project Settings > API). */
    get supabaseUrl() {
      return req("SUPABASE_URL");
    },
    /** The service-role key: server only, full access. Never expose it to browsers. */
    get supabaseKey() {
      return req("SUPABASE_SERVICE_ROLE_KEY");
    },
    get supabaseBucket() {
      return process.env.SUPABASE_STORAGE_BUCKET ?? "kyc";
    },
  },
  email: {
    get provider() {
      return (process.env.EMAIL_PROVIDER ?? "console") as "console" | "resend";
    },
    get from() {
      return process.env.EMAIL_FROM ?? "no-reply@example.com";
    },
    get resendApiKey() {
      return req("RESEND_API_KEY");
    },
  },
  sms: {
    get provider() {
      return (process.env.SMS_PROVIDER ?? "console") as "console" | "msg91";
    },
    get msg91AuthKey() {
      return req("MSG91_AUTH_KEY");
    },
    get msg91TemplateId() {
      return req("MSG91_OTP_TEMPLATE_ID");
    },
  },
  /** WalletConnect (Reown) project ID: lets customers pay from any wallet app. Public by design; unset = only browser wallets. */
  get walletConnectProjectId() {
    return opt("WALLETCONNECT_PROJECT_ID");
  },
  tron: {
    get testApiUrl() {
      return process.env.TRON_TEST_API_URL ?? "https://nile.trongrid.io";
    },
    get liveApiUrl() {
      return process.env.TRON_LIVE_API_URL ?? "https://api.trongrid.io";
    },
    get apiKey() {
      return opt("TRONGRID_API_KEY");
    },
  },
  bsc: {
    get testRpcUrl() {
      // Verified by the testnet chain check to serve eth_getLogs and the "finalized" tag.
      // (bnbchain's own public data-seed nodes refuse eth_getLogs entirely.)
      return opt("BSC_TEST_RPC_URL") ?? "https://bsc-testnet-rpc.publicnode.com";
    },
    get testRpcBackupUrl() {
      return opt("BSC_TEST_RPC_BACKUP_URL");
    },
    get liveRpcUrl() {
      return opt("BSC_LIVE_RPC_URL");
    },
    get liveRpcBackupUrl() {
      return opt("BSC_LIVE_RPC_BACKUP_URL");
    },
  },
};
