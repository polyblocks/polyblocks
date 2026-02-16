/**
 * Builder API Configuration
 *
 * Paste your Polymarket Builder API credentials below.
 * Every order placed through Polyblocks (by any user) will be attributed
 * to YOUR builder account, earning you builder fees on matched trades.
 *
 * Get your builder credentials at:
 *   https://polymarket.com/settings?tab=builder
 *
 * View your earnings on the Builder Leaderboard:
 *   https://builders.polymarket.com/
 */

import { BuilderConfig } from "@polymarket/builder-signing-sdk";

// ─── YOUR BUILDER CREDENTIALS ──────────────────────────────────────────────
// Fill in all three fields, then restart the API server.

const BUILDER_API_KEY = "019c634a-416b-7a82-b35b-f922ed820555";
const BUILDER_SECRET = "77FzUM-c3WJLl-K1Qtp4ja2hQCgEXW2wiPAVO_hLwX4=";
const BUILDER_PASSPHRASE = "206bdbf416a6fecee3be5937500e8370b6f7fce7f0b723da3b3458c9ef7ae764";

// ────────────────────────────────────────────────────────────────────────────

const isConfigured =
  BUILDER_API_KEY.length > 0 &&
  BUILDER_SECRET.length > 0 &&
  BUILDER_PASSPHRASE.length > 0;

/**
 * Pre-built BuilderConfig instance that gets passed to every ClobClient.
 * Returns `undefined` if credentials are not filled in (orders will still
 * work, they just won't be attributed to your builder account).
 */
export const builderConfig: BuilderConfig | undefined = isConfigured
  ? new BuilderConfig({
      localBuilderCreds: {
        key: BUILDER_API_KEY,
        secret: BUILDER_SECRET,
        passphrase: BUILDER_PASSPHRASE,
      },
    })
  : undefined;

/** Whether builder fee attribution is active */
export const builderEnabled = isConfigured;
