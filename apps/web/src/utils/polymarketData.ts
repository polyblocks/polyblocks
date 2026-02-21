
export interface WalletStats {
  profit: string;
  volume: string;
  winRate: number;
  trades: number;
  equityCurve: number[];
}

export async function fetchWalletStats(address: string): Promise<WalletStats | null> {
  const addr = address.trim();
  if (!addr) return null;
  
  try {
    const res = await fetch(`/api/positions/trader-stats?address=${addr}`);
    if (!res.ok) return null;
    const data = await res.json();
    
    return {
      profit: data.profit >= 0 ? `+$${data.profit.toLocaleString()}` : `-$${Math.abs(data.profit).toLocaleString()}`,
      volume: `~$${data.volume.toLocaleString()}`,
      winRate: Math.round(data.winRate * 100),
      trades: data.trades,
      equityCurve: data.equityCurve || [100, 100],
    };
  } catch (err) {
    console.error("Failed to fetch wallet stats:", err);
    return null;
  }
}
