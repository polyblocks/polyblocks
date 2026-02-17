/**
 * Polyblocks CLOB Proxy — Cloudflare Worker
 *
 * This worker runs in Cloudflare's EU edge (Dublin / eu-west-1) and
 * transparently proxies all requests to Polymarket's CLOB API.
 *
 * Why?  Polymarket geoblocks the US.  Our Heroku server is in the US.
 * This worker sits in Ireland (not blocked) and forwards CLOB requests.
 *
 * Usage:
 *   Instead of  https://clob.polymarket.com/...
 *   Point to    https://polyblocks-clob-proxy.<your-account>.workers.dev/...
 *
 * Security:
 *   Set the API_KEY secret via `wrangler secret put API_KEY`
 *   Then set CLOB_PROXY_KEY on your Heroku env to the same value.
 *   Requests without a matching X-Proxy-Key header are rejected.
 */

interface Env {
  CLOB_TARGET: string;   // "https://clob.polymarket.com"  (set in wrangler.toml)
  API_KEY?: string;       // optional secret — set via `wrangler secret put API_KEY`
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ── CORS preflight ────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ── Optional API-key gate ─────────────────────────────────────────
    if (env.API_KEY) {
      const provided = request.headers.get("X-Proxy-Key");
      if (provided !== env.API_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    // ── Build target URL ──────────────────────────────────────────────
    const url = new URL(request.url);
    const targetUrl = `${env.CLOB_TARGET}${url.pathname}${url.search}`;

    // ── Clone headers, remove CF / proxy-specific ones ────────────────
    const headers = new Headers(request.headers);
    headers.delete("X-Proxy-Key");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ray");
    headers.delete("cf-ipcountry");
    headers.delete("cf-visitor");
    // Ensure Host header matches target
    headers.set("Host", new URL(env.CLOB_TARGET).host);

    // ── Forward the request ───────────────────────────────────────────
    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
        redirect: "follow",
      });

      // Clone response and add CORS headers
      const responseHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders())) {
        responseHeaders.set(k, v);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy error", detail: String(err) }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }
  },
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}
