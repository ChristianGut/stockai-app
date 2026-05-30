export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FINNHUB_KEY = process.env.VITE_FINNHUB_KEY;
  const FMP_KEY     = process.env.VITE_FMP_KEY;
  const { type, ticker, range, interval, q } = req.query;

  const YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
  };

  async function yahooFetch(path) {
    // Try query1 first, then query2 as fallback
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      try {
        const r = await fetch(`https://${host}${path}`, { headers: YAHOO_HEADERS });
        if (r.ok) {
          const d = await r.json();
          if (d?.chart?.result || d?.finance?.result) return d;
        }
      } catch { continue; }
    }
    return null;
  }

  try {
    switch (type) {

      case "quote": {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
        return res.json(await r.json());
      }

      case "search": {
        const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
        return res.json(await r.json());
      }

      case "chart": {
        const r = range || "3mo";
        const iv = interval || "1d";
        const d = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(ticker)}?range=${r}&interval=${iv}&events=div&includePrePost=false`);
        if (!d) return res.status(502).json({ error: "Yahoo unavailable" });
        return res.json(d);
      }

      case "div": {
        const d = await yahooFetch(`/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=3mo&events=div&includePrePost=false`);
        if (!d) return res.status(502).json({ error: "Yahoo unavailable" });
        return res.json(d);
      }

      case "fundamentals": {
        if (!FMP_KEY) return res.json({ ok: false, error: "FMP key missing" });

        const base = ticker.split(".")[0];
        const tryTickers = ticker.includes(".") ? [base, ticker] : [ticker];

        for (const t of tryTickers) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const [pRes, rRes, aRes] = await Promise.all([
              fetch(`https://financialmodelingprep.com/stable/profile?symbol=${t}&apikey=${FMP_KEY}`, { signal: controller.signal }),
              fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${t}&apikey=${FMP_KEY}`, { signal: controller.signal }),
              fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${t}&apikey=${FMP_KEY}`, { signal: controller.signal }),
            ]);
            clearTimeout(timeout);

            const [profile, ratios, analyst] = await Promise.all([
              pRes.json().catch(() => null),
              rRes.json().catch(() => null),
              aRes.json().catch(() => null),
            ]);

            if (profile?.["Error Message"] || profile?.["error"]) continue;

            const p = Array.isArray(profile) ? profile[0] : (profile?.symbol ? profile : null);
            if (!p?.symbol) continue;

            const r = Array.isArray(ratios)  ? ratios[0]  : (ratios || {});
            const a = Array.isArray(analyst) ? analyst[0] : (analyst || {});

            return res.json({ ok: true, ticker: t, profile: p, ratios: r, analyst: a });
          } catch { continue; }
        }
        return res.json({ ok: false, error: "Not found" });
      }

      default:
        return res.status(400).json({ error: "Unknown type: " + type });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
