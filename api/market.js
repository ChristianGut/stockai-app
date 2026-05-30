export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FINNHUB_KEY   = process.env.VITE_FINNHUB_KEY;
  const FMP_KEY       = process.env.VITE_FMP_KEY;
  const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY;

  const { type, ticker, range, q } = req.query;

  const ft = (url, opts={}, ms=7000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
  };

  try {
    switch (type) {

      // ── Quote from Finnhub ─────────────────────────────────────────────────
      case "quote": {
        const r = await ft(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
        return res.json(await r.json());
      }

      // ── Search from Finnhub ────────────────────────────────────────────────
      case "search": {
        const r = await ft(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
        return res.json(await r.json());
      }

      // ── Chart candles from Finnhub ─────────────────────────────────────────
      // Resolution mapping for free plan:
      // 1D → 60min, 1W → D, 1M → D, 3M → D, 1Y → W, 5Y → M
      case "chart": {
        const now = Math.floor(Date.now() / 1000);
        const cfg = {
          "1d":  { from: now - 86400*2,    res: "60" },
          "5d":  { from: now - 86400*7,    res: "D"  },
          "1mo": { from: now - 86400*31,   res: "D"  },
          "3mo": { from: now - 86400*92,   res: "D"  },
          "1y":  { from: now - 86400*366,  res: "W"  },
          "5y":  { from: now - 86400*1830, res: "M"  },
        }[range] || { from: now - 86400*92, res: "D" };

        const sym = ticker.replace(".SW","").replace(".DE","").replace(".AS","").replace(".PA","").replace(".L","").replace(".MI","");

        const r = await ft(`https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=${cfg.res}&from=${cfg.from}&to=${now}&token=${FINNHUB_KEY}`);
        const d = await r.json();
        if (d.s !== "ok") return res.json({ ok: false, status: d.s });
        return res.json({ ok: true, c: d.c, t: d.t, v: d.v });
      }

      // ── Dividends from Finnhub ─────────────────────────────────────────────
      case "div": {
        const sym  = ticker.replace(".SW","").replace(".DE","").replace(".AS","").replace(".PA","");
        const from = new Date(Date.now() - 86400000*730).toISOString().split("T")[0];
        const to   = new Date().toISOString().split("T")[0];
        const r    = await ft(`https://finnhub.io/api/v1/stock/dividend?symbol=${sym}&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
        const d    = await r.json();
        return res.json({ ok: true, dividends: Array.isArray(d) ? d : [] });
      }

      // ── Fundamentals from FMP (stable endpoints) ───────────────────────────
      case "fundamentals": {
        if (!FMP_KEY) return res.json({ ok: false });
        const sym = ticker.split(".")[0];
        const tries = ticker.includes(".") ? [sym, ticker] : [ticker];
        for (const t of tries) {
          try {
            const [pR, rR, aR] = await Promise.all([
              ft(`https://financialmodelingprep.com/stable/profile?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
              ft(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
              ft(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${t}&apikey=${FMP_KEY}`, {}, 5000),
            ]);
            const [p, r, a] = await Promise.all([pR.json().catch(()=>null), rR.json().catch(()=>null), aR.json().catch(()=>null)]);
            const prof = Array.isArray(p) ? p[0] : (p?.symbol ? p : null);
            if (!prof?.symbol) continue;
            return res.json({ ok: true, profile: prof, ratios: Array.isArray(r)?r[0]:(r||{}), analyst: Array.isArray(a)?a[0]:(a||{}) });
          } catch { continue; }
        }
        return res.json({ ok: false });
      }

      // ── AI analysis proxied through server ────────────────────────────────
      case "ai": {
        const body = JSON.parse(req.body || "{}");
        const r = await ft("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        }, 30000);
        const d = await r.json();
        return res.json(d);
      }

      default:
        return res.status(400).json({ error: "Unknown type" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
