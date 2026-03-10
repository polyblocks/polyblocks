import { ethers } from "ethers";
const POLYGON_CHAIN_ID = 137;
const FALLBACK_RPCS = [
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
    "https://polygon-rpc.com",
];
let cachedProvider = null;
let cachedUrl = null;
function getRpcList() {
    const envUrl = process.env.POLYGON_RPC_URL;
    if (envUrl)
        return [envUrl, ...FALLBACK_RPCS];
    return FALLBACK_RPCS;
}
async function testProvider(provider) {
    try {
        await provider.getBlockNumber();
        return true;
    }
    catch {
        return false;
    }
}
export async function getPolygonProvider() {
    if (cachedProvider && cachedUrl) {
        const ok = await testProvider(cachedProvider).catch(() => false);
        if (ok)
            return cachedProvider;
        cachedProvider = null;
        cachedUrl = null;
    }
    const rpcs = getRpcList();
    for (const url of rpcs) {
        try {
            const p = new ethers.providers.JsonRpcProvider(url, POLYGON_CHAIN_ID);
            const ok = await testProvider(p);
            if (ok) {
                cachedProvider = p;
                cachedUrl = url;
                console.log(`[RPC] Connected to Polygon via ${url}`);
                return p;
            }
        }
        catch {
            // try next
        }
    }
    throw new Error("All Polygon RPC endpoints are unreachable. Tried: " + rpcs.join(", "));
}
// ─── Gas Price Helper ───────────────────────────────────────────────────────
// Polygon requires a minimum 25 Gwei tip. Fetch live fees and enforce a floor.
const MIN_TIP_GWEI = 30;
const MIN_TIP = ethers.utils.parseUnits(MIN_TIP_GWEI.toString(), "gwei");
export async function getGasOverrides(provider) {
    const feeData = await provider.getFeeData();
    let maxPriorityFee = feeData.maxPriorityFeePerGas ?? MIN_TIP;
    if (maxPriorityFee.lt(MIN_TIP))
        maxPriorityFee = MIN_TIP;
    let maxFee = feeData.maxFeePerGas ?? maxPriorityFee.mul(2);
    if (maxFee.lt(maxPriorityFee))
        maxFee = maxPriorityFee.mul(2);
    return { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPriorityFee };
}
//# sourceMappingURL=rpc.js.map