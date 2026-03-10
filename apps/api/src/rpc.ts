import { ethers } from "ethers";

const POLYGON_CHAIN_ID = 137;

const FALLBACK_RPCS = [
  "https://polygon.drpc.org",
  "https://polygon-bor-rpc.publicnode.com",
  "https://1rpc.io/matic",
  "https://polygon-rpc.com",
];

let cachedProvider: ethers.providers.JsonRpcProvider | null = null;
let cachedUrl: string | null = null;

function getRpcList(): string[] {
  const envUrl = process.env.POLYGON_RPC_URL;
  if (envUrl) return [envUrl, ...FALLBACK_RPCS];
  return FALLBACK_RPCS;
}

async function testProvider(
  provider: ethers.providers.JsonRpcProvider,
): Promise<boolean> {
  try {
    await provider.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

export async function getPolygonProvider(): Promise<ethers.providers.JsonRpcProvider> {
  if (cachedProvider && cachedUrl) {
    const ok = await testProvider(cachedProvider).catch(() => false);
    if (ok) return cachedProvider;
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
    } catch {
      // try next
    }
  }

  throw new Error(
    "All Polygon RPC endpoints are unreachable. Tried: " + rpcs.join(", "),
  );
}
