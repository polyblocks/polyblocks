# Polyblocks CLOB Proxy (Cloudflare Worker)

Transparent reverse proxy that forwards Polymarket CLOB API requests from an EU edge (Ireland) to bypass US geoblocking.

## Why?
Polymarket blocks CLOB API requests from US IPs. This worker runs on Cloudflare's EU edge and forwards requests to `clob.polymarket.com`.

## Setup (one-time, ~5 minutes)

### 1. Create a free Cloudflare account
Go to https://dash.cloudflare.com/sign-up

### 2. Install Wrangler CLI
```bash
npm install -g wrangler
```

### 3. Login to Cloudflare
```bash
wrangler login
```

### 4. Deploy the worker
```bash
cd proxy/clob-proxy-worker
npm install
npm run deploy
```

After deploy, you'll get a URL like:
```
https://polyblocks-clob-proxy.<your-account>.workers.dev
```

### 5. (Optional) Secure with an API key
```bash
wrangler secret put API_KEY
# Enter a random secret, e.g.: openssl rand -hex 32
```

Then set the same key on Heroku:
```bash
heroku config:set CLOB_PROXY_KEY=<same-secret>
```

### 6. Update your environment
Set `POLYMARKET_CLOB_HOST` to your worker URL:

**Local `.env`:**
```
POLYMARKET_CLOB_HOST=https://polyblocks-clob-proxy.<your-account>.workers.dev
```

**Heroku:**
```bash
heroku config:set POLYMARKET_CLOB_HOST=https://polyblocks-clob-proxy.<your-account>.workers.dev
```

That's it! All CLOB API calls now route through Ireland. ☘️

## Free tier limits
- **100,000 requests/day** (way more than you'll need for trading)
- **10ms CPU time per request** (proxying is well within this)
- No credit card required

## Testing
```bash
curl https://polyblocks-clob-proxy.<your-account>.workers.dev/time
```
Should return the CLOB server time, same as `https://clob.polymarket.com/time`.
