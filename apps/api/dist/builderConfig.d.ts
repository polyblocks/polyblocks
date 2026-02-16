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
/**
 * Pre-built BuilderConfig instance that gets passed to every ClobClient.
 * Returns `undefined` if credentials are not filled in (orders will still
 * work, they just won't be attributed to your builder account).
 */
export declare const builderConfig: BuilderConfig | undefined;
/** Whether builder fee attribution is active */
export declare const builderEnabled: boolean;
//# sourceMappingURL=builderConfig.d.ts.map