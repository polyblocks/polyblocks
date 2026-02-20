import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import CryptoMarketPicker from "./CryptoMarketPicker";

type Market = {
  conditionId: string;
  question: string;
  slug?: string;
  groupItemTitle?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  clobTokenIds?: string[];
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
};

function makeResponse(json: unknown, ok = true) {
  return {
    ok,
    async json() {
      return json;
    },
  } as unknown as Response;
}

function Wrapper({
  initialConfig,
}: {
  initialConfig: Record<string, unknown>;
}) {
  const [config, setConfig] = useState<Record<string, unknown>>(initialConfig);
  return (
    <div>
      <div data-testid="conditionId">{String(config.conditionId || "")}</div>
      <CryptoMarketPicker
        config={config}
        onConfigChange={(key, value) => setConfig((c) => ({ ...c, [key]: value }))}
      />
    </div>
  );
}

describe("CryptoMarketPicker (Latest Crypto Market)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T12:03:10.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("auto-selects the currently active market and shows live midpoints", async () => {
    const markets: Market[] = [
      {
        conditionId: "btc_old",
        question: "BTC 5m 12:55 – 1:00",
        slug: "btc-5m-old",
        clobTokenIds: ["yes_old", "no_old"],
        startDate: "2026-02-19T12:55:00.000Z",
        endDate: "2026-02-19T13:00:00.000Z",
        active: true,
        closed: false,
      },
      {
        conditionId: "btc_active",
        question: "BTC 5m 12:00 – 12:05",
        slug: "btc-5m-active",
        clobTokenIds: ["yes_active", "no_active"],
        startDate: "2026-02-19T12:00:00.000Z",
        endDate: "2026-02-19T12:05:00.000Z",
        active: true,
        closed: false,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/markets/search")) return makeResponse(markets);
      if (url.includes("/api/markets/midpoint") && url.includes("yes_active")) return makeResponse({ mid: "0.52" });
      if (url.includes("/api/markets/midpoint") && url.includes("no_active")) return makeResponse({ mid: "0.48" });
      return makeResponse({ error: "Unexpected request" }, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Wrapper initialConfig={{ cryptoSymbol: "BTC", timeframe: "5m" }} />);

    await waitFor(() => {
      expect(screen.getByTestId("conditionId")).toHaveTextContent("btc_active");
    });
    await waitFor(() => {
      expect(screen.getByText("52.0%")).toBeInTheDocument();
      expect(screen.getByText("48.0%")).toBeInTheDocument();
    });
  });

  it("refreshes on the next timeframe boundary and updates trend", async () => {
    const markets: Market[] = [
      {
        conditionId: "btc_active",
        question: "BTC 5m 12:00 – 12:05",
        slug: "btc-5m-active",
        clobTokenIds: ["yes_active", "no_active"],
        startDate: "2026-02-19T12:00:00.000Z",
        endDate: "2026-02-19T12:05:00.000Z",
        active: true,
        closed: false,
      },
    ];

    let refreshIndex = 0;
    const yesSeq = ["0.52", "0.55"];
    const noSeq = ["0.48", "0.45"];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/markets/search")) {
        refreshIndex += 1;
        return makeResponse(markets);
      }
      if (url.includes("/api/markets/midpoint") && url.includes("yes_active")) {
        const mid = yesSeq[Math.min(refreshIndex - 1, yesSeq.length - 1)];
        return makeResponse({ mid });
      }
      if (url.includes("/api/markets/midpoint") && url.includes("no_active")) {
        const mid = noSeq[Math.min(refreshIndex - 1, noSeq.length - 1)];
        return makeResponse({ mid });
      }
      return makeResponse({ error: "Unexpected request" }, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Wrapper initialConfig={{ cryptoSymbol: "BTC", timeframe: "5m" }} />);

    await waitFor(() => {
      expect(screen.getByText("52.0%")).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(111_000);

    await waitFor(() => {
      const searchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/markets/search"));
      expect(searchCalls.length).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(screen.getByText("55.0%")).toBeInTheDocument();
      expect(screen.getByText("+3pp")).toBeInTheDocument();
    });
  });

  it("updates selection when switching crypto symbol", async () => {
    const markets: Market[] = [
      {
        conditionId: "btc_active",
        question: "BTC 5m 12:00 – 12:05",
        slug: "btc-5m-active",
        clobTokenIds: ["yes_btc", "no_btc"],
        startDate: "2026-02-19T12:00:00.000Z",
        endDate: "2026-02-19T12:05:00.000Z",
        active: true,
        closed: false,
      },
      {
        conditionId: "eth_active",
        question: "ETH 5m 12:00 – 12:05",
        slug: "eth-5m-active",
        clobTokenIds: ["yes_eth", "no_eth"],
        startDate: "2026-02-19T12:00:00.000Z",
        endDate: "2026-02-19T12:05:00.000Z",
        active: true,
        closed: false,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/markets/search")) return makeResponse(markets);
      if (url.includes("/api/markets/midpoint") && url.includes("yes_btc")) return makeResponse({ mid: "0.52" });
      if (url.includes("/api/markets/midpoint") && url.includes("no_btc")) return makeResponse({ mid: "0.48" });
      if (url.includes("/api/markets/midpoint") && url.includes("yes_eth")) return makeResponse({ mid: "0.61" });
      if (url.includes("/api/markets/midpoint") && url.includes("no_eth")) return makeResponse({ mid: "0.39" });
      return makeResponse({ error: "Unexpected request" }, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    render(<Wrapper initialConfig={{ cryptoSymbol: "BTC", timeframe: "5m" }} />);

    await waitFor(() => {
      expect(screen.getByTestId("conditionId")).toHaveTextContent("btc_active");
    });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "ETH");

    await waitFor(() => {
      expect(screen.getByTestId("conditionId")).toHaveTextContent("eth_active");
      expect(screen.getByText("61.0%")).toBeInTheDocument();
    });
  });
});

