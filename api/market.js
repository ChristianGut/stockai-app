// api/market.js — Vercel Serverless Function
// Handles ALL external API calls server-side — no CORS issues ever
// Endpoints:
//   /api/market?type=quote&ticker=AAPL
//   /api/market?type=chart&ticker=AAPL&range=3mo&interval=1d
//   /api/market?type=div&ticker=AAPL
//   /api/market?type=fundamentals&ticker=AAPL
//   /api/market?type=search&q=apple

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FINNHUB_KEY = process.env.VITE_FINNHUB_KEY;
  const FMP_KEY     = process.env.VITE_FMP_KEY;
  const { type, ticker, range, interval, q } = req.query;

  try {
    switch (type) {

      // ── Live quote from Finnhub ──────────────────────────────────────────────
      case "quote": {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`
        );
        return res.json(await r.json());
      }

      // ── Search from Finnhub ──────────────────────────────────────────────────
      case "search": {
        const r = await fetch(
          `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`
        );
        return res.json(await r.json());
      }

      // ── Chart candles from Yahoo Finance ────────────────────────────────────
      case "chart": {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range||"3mo"}&interval=${interval||"1d"}&events=div&includePrePost=false`;
        const r = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
          }
        });
        const data = await r.json();
        return res.json(data);
      }

      // ── Dividends — 2 year chart for frequency detection ────────────────────
      case "div": {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=3mo&events=div&includePrePost=false`;
        const r = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
          }
        });
        return res.json(await r.json());
      }

      // ── Fundamentals from FMP ────────────────────────────────────────────────
      case "fundamentals": {
        const base = ticker.split(".")[0]; // NESN.SW → NESN
        const tryTickers = ticker.includes(".") ? [base, ticker] : [ticker];

        for (const t of tryTickers) {
          const [profileRes, ratiosRes, analystRes] = await Promise.all([
            fetch(`https://financialmodelingprep.com/api/v3/profile/${t}?apikey=${FMP_KEY}`),
            fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${t}?apikey=${FMP_KEY}`),
            fetch(`https://financialmodelingprep.com/api/v3/price-target-consensus/${t}?apikey=${FMP_KEY}`),
          ]);

          const [profile, ratios, analyst] = await Promise.all([
            profileRes.json().catch(() => null),
            ratiosRes.json().catch(() => null),
            analystRes.json().catch(() => null),
          ]);

          const p = Array.isArray(profile) ? profile[0] : null;
          if (!p?.symbol) continue;

          const r = Array.isArray(ratios) ? ratios[0] : (ratios || {});
          const a = Array.isArray(analyst) ? analyst[0] : (analyst || {});

          return res.json({ ok: true, ticker: t, profile: p, ratios: r, analyst: a });
        }

        return res.json({ ok: false, error: "Ticker not found in FMP" });
      }

      default:
        return res.status(400).json({ error: "Unknown type: " + type });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
