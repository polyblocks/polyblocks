/**
 * MarketPicker — slug-based market lookup with multi-bin selection.
 * User pastes a Polymarket event slug → we fetch the event → show all bins.
 * Each bin is a selectable card with its own token_id, prices, etc.
 */

import { useState, useCallback } from "react";
import { Input } from "@polyblocks/ui";
import { Search, X, Loader, ChevronRight, ExternalLink, BarChart3 } from "lucide-react";

interface GammaBin {
  conditionId: string;
  question: string;
  slug: string;
  image: string;
  icon: string;
  groupItemTitle: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds: string[];
  volume: string | number;
  active: boolean;
  closed: boolean;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  spread: number;
  endDate?: string;
  negRisk: boolean;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  image: string;
  icon: string;
  description: string;
  volume: string | number;
  endDate?: string;
  active: boolean;
  closed: boolean;
  markets: GammaBin[];
}

interface MarketPickerProps {
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

export default function MarketPicker({ config, onConfigChange }: MarketPickerProps) {
  const [slugInput, setSlugInput] = useState("");
  const [event, setEvent] = useState<GammaEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedQuestion = config.question as string || "";
  const selectedTokenId = config.tokenId as string || "";
  const selectedOutcomes = (config.outcomes as string[]) || [];
  const selectedPrices = (config.outcomePrices as string[]) || [];
  const selectedBinTitle = config.groupItemTitle as string || "";
  const selectedEventTitle = config.eventTitle as string || "";
  const selectedImage = config.image as string || "";

  /** Normalize slug: extract from full URL or clean up whitespace */
  const normalizeSlug = (raw: string): string => {
    let s = raw.trim();
    // Handle full Polymarket URLs like https://polymarket.com/event/presidential-election-winner-2024
    if (s.includes("polymarket.com")) {
      const parts = s.split("/");
      s = parts[parts.length - 1] || parts[parts.length - 2] || s;
      // Remove query params
      s = s.split("?")[0];
    }
    return s;
  };

  const lookupSlug = useCallback(async () => {
    const slug = normalizeSlug(slugInput);
    if (!slug) return;

    setLoading(true);
    setError("");
    setEvent(null);

    try {
      const res = await fetch(`/api/markets/slug/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, string>;
        setError(data.error || `Not found (${res.status})`);
        return;
      }
      const data = await res.json() as GammaEvent;
      if (!data.markets?.length) {
        setError("No bins/markets found for this event");
        return;
      }
      setEvent(data);
    } catch (err) {
      setError("Failed to fetch — check the slug and try again");
      console.error("Slug lookup failed:", err);
    } finally {
      setLoading(false);
    }
  }, [slugInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupSlug();
    }
  };

  const selectBin = (bin: GammaBin) => {
    // Store the YES token_id as primary (first clobTokenId)
    const yesTokenId = bin.clobTokenIds?.[0] || "";
    onConfigChange("conditionId", bin.conditionId);
    onConfigChange("tokenId", yesTokenId);
    onConfigChange("question", bin.question);
    onConfigChange("groupItemTitle", bin.groupItemTitle || "");
    onConfigChange("eventTitle", event?.title || "");
    onConfigChange("eventSlug", event?.slug || "");
    onConfigChange("image", bin.image || event?.image || "");
    onConfigChange("outcomes", bin.outcomes);
    onConfigChange("outcomePrices", bin.outcomePrices);
    onConfigChange("clobTokenIds", bin.clobTokenIds);
  };

  const clearMarket = () => {
    onConfigChange("conditionId", "");
    onConfigChange("tokenId", "");
    onConfigChange("question", "");
    onConfigChange("groupItemTitle", "");
    onConfigChange("eventTitle", "");
    onConfigChange("eventSlug", "");
    onConfigChange("image", "");
    onConfigChange("outcomes", []);
    onConfigChange("outcomePrices", []);
    onConfigChange("clobTokenIds", []);
    setEvent(null);
    setSlugInput("");
    setError("");
  };

  const formatPrice = (price: string | number) => {
    const n = Number(price);
    return `${(n * 100).toFixed(0)}¢`;
  };

  const formatVolume = (vol: string | number) => {
    const n = Number(vol);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  // ── Selected market card ──────────────────────────────────────────────────
  if (selectedTokenId && selectedQuestion) {
    return (
      <div className="market-picker-selected">
        <div className="market-card-selected">
          {selectedImage && (
            <img
              src={selectedImage}
              alt=""
              className="market-card-img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="market-card-info">
            {selectedEventTitle && selectedEventTitle !== selectedQuestion && (
              <div className="market-card-event-title">{selectedEventTitle}</div>
            )}
            <div className="market-card-question">
              {selectedBinTitle || selectedQuestion}
            </div>
            {selectedOutcomes.length > 0 && (
              <div className="market-card-prices">
                {selectedOutcomes.map((outcome, i) => (
                  <span key={outcome} className={`market-outcome ${outcome.toLowerCase()}`}>
                    {outcome}: {selectedPrices[i] ? formatPrice(selectedPrices[i]) : "—"}
                  </span>
                ))}
              </div>
            )}
            <div className="market-card-token-id">
              Token: {selectedTokenId.slice(0, 8)}…{selectedTokenId.slice(-6)}
            </div>
          </div>
          <button className="market-card-clear" onClick={clearMarket} title="Clear market">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Slug input + bins list ────────────────────────────────────────────────
  return (
    <div className="market-picker">
      {/* Slug input */}
      <div className="slug-input-row">
        <div className="slug-input-field">
          <Search size={14} className="slug-input-icon" />
          <Input
            placeholder="Event slug or URL…"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className="slug-lookup-btn"
          onClick={lookupSlug}
          disabled={loading || !slugInput.trim()}
          title="Lookup"
        >
          {loading ? <Loader size={14} className="loading-spinner" /> : <ChevronRight size={14} />}
        </button>
      </div>

      <div className="slug-hint">
        Paste a Polymarket slug (e.g. <code>presidential-election-winner-2024</code>)
      </div>

      {/* Error */}
      {error && <div className="slug-error">{error}</div>}

      {/* Event + bins */}
      {event && (
        <div className="event-bins-container">
          {/* Event header */}
          <div className="event-header">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="event-header-img"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="event-header-info">
              <div className="event-header-title">{event.title}</div>
              <div className="event-header-meta">
                <span>{event.markets.length} bin{event.markets.length !== 1 ? "s" : ""}</span>
                {event.volume && (
                  <span className="event-header-volume">
                    <BarChart3 size={10} /> {formatVolume(event.volume)}
                  </span>
                )}
                <a
                  href={`https://polymarket.com/event/${event.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-header-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} /> View
                </a>
              </div>
            </div>
          </div>

          {/* Bins list */}
          <div className="bins-label">Select a bin:</div>
          <div className="bins-list">
            {event.markets.map((bin) => {
              const yesPrice = bin.outcomePrices?.[0];
              const noPrice = bin.outcomePrices?.[1];
              const title = bin.groupItemTitle || bin.question;

              return (
                <div
                  key={bin.conditionId}
                  className="bin-card"
                  onClick={() => selectBin(bin)}
                >
                  {bin.image && bin.image !== event.image && (
                    <img
                      src={bin.image}
                      alt=""
                      className="bin-card-img"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="bin-card-info">
                    <div className="bin-card-title">{title}</div>
                    <div className="bin-card-prices">
                      {yesPrice && (
                        <span className="market-outcome yes">
                          Yes: {formatPrice(yesPrice)}
                        </span>
                      )}
                      {noPrice && (
                        <span className="market-outcome no">
                          No: {formatPrice(noPrice)}
                        </span>
                      )}
                      {bin.volume && (
                        <span className="bin-card-volume">
                          <BarChart3 size={9} /> {formatVolume(bin.volume)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="bin-card-arrow" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
