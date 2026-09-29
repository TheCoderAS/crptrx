# Stage 2: real Google login + real test coins

Goal: run the app on your computer with real Google sign-in, and watch it detect a real USDT test transfer on each network. Total time is about 45 minutes. It's free: test coins have no value.

You need Docker Desktop, a Google account, and a phone with an authenticator app.

---

## Step 1: Firebase (Google sign-in), about 10 min
1. Go to https://console.firebase.google.com → **Add project** → any name → you can turn Analytics off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Project settings (gear icon) → General → Your apps → Web (`</>`)** → register any nickname (no hosting needed).
4. Copy these values from the config it shows:
   `apiKey`, `authDomain`, `projectId`, `appId`.
5. `localhost` is already an authorized domain, so nothing else is needed for testing on your computer.

## Step 2: Two test wallets, about 10 min
Use test wallets only. Never put real funds in them, and never share the recovery phrase with anyone, including me.

**Tron Nile**
1. Install the **TronLink** browser extension and create a wallet.
2. Switch its network to **Nile Testnet**.
3. Copy your address (starts with `T`).
4. Get free test TRX (pays network fees) and test USDT from the Nile faucet: https://nileex.io/join/getJoinPage

**BNB Smart Chain Testnet**
1. In **MetaMask**, add the network: BNB Smart Chain Testnet, chain ID `97`, RPC `https://bsc-testnet-rpc.publicnode.com`, symbol `tBNB`, explorer `https://testnet.bscscan.com`.
2. Copy your address (starts with `0x`).
3. Get free test BNB from https://www.bnbchain.org/en/testnet-faucet. It also offers test USDT (BEP-20 "USDT" peg token).

You need **two wallets per network**: one acts as the company deposit address, the other as the customer who pays. Create a second account in each extension.

**Check the test USDT token address.** In each wallet, look up the contract address of the test USDT you received. The app's defaults are:
- Tron Nile: `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`
- BSC Testnet: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`

If yours differ, use yours in Step 3.

## Step 3: Settings file, about 5 min
In the project folder, create a file named `.env`:

```
FIREBASE_API_KEY=paste apiKey
FIREBASE_AUTH_DOMAIN=paste authDomain
FIREBASE_PROJECT_ID=paste projectId
FIREBASE_APP_ID=paste appId

# Company deposit wallets (the "receiving" accounts from Step 2)
SEED_TEST_DEPOSIT_TRON=T...your Nile address
SEED_TEST_DEPOSIT_BSC=0x...your BSC testnet address

# Optional but recommended: free key from https://www.trongrid.io
TRONGRID_API_KEY=
```

## Step 4: Start fresh, about 5 min
```
docker compose down -v            # wipes old test data, so the addresses above are used right away
docker compose up -d --build
```
Open http://localhost:3000. You should now see **Continue with Google** above the test sign-in.

If your test USDT token addresses differ from the defaults: go to Admin → Settings → USDT token contracts → paste yours → Save (needs your 2FA code).

## Step 5: The real test, about 15 min
1. **Admin** (http://localhost:3000/admin): log in and scan the 2FA QR code. In Settings, set the rate if the banner says it is stale.
2. **Customer:** Continue with Google → confirm mobile (the code is shown on screen) → submit KYC → the admin approves it → add a bank/UPI → the admin approves it.
3. **Customer → Sell:** pick **Tron (TRC-20)**, 10 USDT → Get quote → Confirm. Note the exact amount (e.g. `10.37`).
4. From your **other** Tron wallet, send exactly that amount of test USDT to the deposit address shown.
5. Within about 1–2 minutes the order should change to **Payment received**. Nothing to click; the page refreshes itself.
6. Repeat steps 3–5 with **BNB Smart Chain (BEP-20)**.
7. Also try pasting the transaction ID into "I've sent it". It should match faster.

### If a payment isn't detected
- **Admin → Dashboard → Blockchain checks** shows the last success or error per network.
- `docker compose logs worker --tail 50` shows what the watcher is doing.
- The most common cause is the wrong test token address (Step 2), then a wrong amount (for example, an exchange deducting a fee).
- Send me the worker log lines and the transaction ID; that's enough to fix it.

## Let others test it (optional)
To let someone outside your computer try it without a server, run a free tunnel such as `cloudflared tunnel --url http://localhost:3000`. Then:
- set `APP_URL` in `.env` to the tunnel address, and
- add that domain in Firebase → Authentication → Settings → **Authorized domains**.

Treat it as temporary. For a real shared test server, see "Going live" in the README.
