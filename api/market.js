export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FINNHUB_KEY = process.env.VITE_FINNHUB_KEY;
  const FMP_KEY     = process.env.VITE_FMP_KEY;
  const { type, ticker, range, interval, q } = req.query;

  const fetchWithTimeout = (url, opts = {}, ms = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opts, signal: controller.signal })
      .finally(() => clearTimeout(id));
  };

  try {
    switch (type) {

      case "quote": {
        const r = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`
        );
        return res.json(await r.json());
      }

      case "search": {
        const r = await fetchWithTimeout(
          `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`
        );
        return res.json(await r.json());
      }

      case "chart": {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range||"3mo"}&interval=${interval||"1d"}&events=div&includePrePost=false`;
        const r = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://finance.yahoo.com",
          }
        });
        return res.json(await r.json());
      }

      case "div": {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=3mo&events=div&includePrePost=false`;
        const r = await fetchWithTimeout(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://finance.yahoo.com",
          }
        });
        return res.json(await r.json());
      }

      case "fundamentals": {
        if (!FMP_KEY) return res.json({ ok: false, error: "FMP key missing" });

        const base = ticker.split(".")[0];
        const tryTickers = ticker.includes(".") ? [base, ticker] : [ticker];

        for (const t of tryTickers) {
          try {
            const [pRes, rRes, aRes] = await Promise.all([
              fetchWithTimeout(`https://financialmodelingprep.com/stable/profile?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
              fetchWithTimeout(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
              fetchWithTimeout(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
            ]);

            const [profile, ratios, analyst] = await Promise.all([
              pRes.json().catch(() => null),
              rRes.json().catch(() => null),
              aRes.json().catch(() => null),
            ]);

            if (profile?.["Error Message"]) continue;

            const p = Array.isArray(profile) ? profile[0] : (profile?.symbol ? profile : null);
            if (!p?.symbol) continue;

            const r = Array.isArray(ratios)  ? ratios[0]  : (ratios || {});
            const a = Array.isArray(analyst) ? analyst[0] : (analyst || {});

            return res.json({ ok: true, ticker: t, profile: p, ratios: r, analyst: a });
          } catch (e) {
            // Timeout or error for this ticker — try next
            continue;
          }
        }

        // Return empty but ok so the app doesn't hang
        return res.json({ ok: false, error: "Not found" });
      }

      default:
        return res.status(400).json({ error: "Unknown type: " + type });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}