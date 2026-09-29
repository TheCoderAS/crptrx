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
  /** Secret for signing short-lived file links (local storage driver). */
  get linkSigningSecret() {
    return req("LINK_SIGNING_SECRET", process.env.ENCRYPTION_KEY);
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  /** Allows the "test login" form for users when Firebase is not configured. Never enable in production. */
  get devLoginEnabled() {
    return process.env.DEV_LOGIN_ENABLED === "true";
  },
  /** Shows OTP codes on screen and enables the test-transfer simulator. Test phases only. */
  get devToolsEnabled() {
    return process.env.DEV_TOOLS_ENABLED === "true";
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
  },
  storage: {
    get driver() {
      return (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3";
    },
    get localDir() {
      return process.env.STORAGE_LOCAL_DIR ?? "./.data/uploads";
    },
    get s3Bucket() {
      return req("S3_BUCKET");
    },
    get s3Region() {
      return process.env.S3_REGION ?? "ap-south-1";
    },
    get s3Endpoint() {
      return opt("S3_ENDPOINT");
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
