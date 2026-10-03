import type { NextConfig } from "next";

// Content-Security-Policy. Next.js needs inline scripts/styles (no nonces here).
// Google sign-in loads from apis.google.com and uses the Firebase auth domain
// (<project>.firebaseapp.com) in a hidden frame. A custom auth domain must be added here.
// "Pay with a wallet app" (WalletConnect/Reown) talks to its relay and API, shows wallet
// logos from its image service, and loads its anti-phishing check in a frame; the wallet
// also reads the BSC network directly.
const WALLETCONNECT = "https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com https://*.web3modal.org https://*.web3modal.com";
const WALLETCONNECT_WS = "wss://*.walletconnect.com wss://*.walletconnect.org wss://*.reown.com";
const BSC_RPC = "https://bsc-testnet-rpc.publicnode.com https://bsc-dataseed.bnbchain.org";
// Live support chat listens to Firebase Realtime Database (older projects use
// firebaseio.com, newer ones firebasedatabase.app); push sign-up uses *.googleapis.com.
const FIREBASE_DB = "https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://apis.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://lh3.googleusercontent.com ${WALLETCONNECT}`,
  "font-src 'self' data: https://fonts.reown.com",
  `connect-src 'self' https://*.googleapis.com ${FIREBASE_DB} ${WALLETCONNECT} ${WALLETCONNECT_WS} ${BSC_RPC}`,
  "frame-src 'self' https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://apis.google.com https://verify.walletconnect.com https://verify.walletconnect.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [
      { source: "/((?!api/files$).*)", headers: securityHeaders },
      // Private files open inside the app's own preview (PDFs in a frame), so only
      // our own pages may frame them. The page itself runs nothing.
      {
        source: "/api/files",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ...securityHeaders.filter((h) => !["Content-Security-Policy", "X-Frame-Options"].includes(h.key)),
        ],
      },
    ];
  },
};

export default config;
