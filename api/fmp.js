// api/fmp.js — Vercel Serverless Function
// Proxies FMP API calls server-side — no CORS issues
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FMP_KEY = process.env.VITE_FMP_KEY;
  if (!FMP_KEY) {
    return res.status(500).json({ error: "VITE_FMP_KEY not set in environment" });
  }

  // path param: e.g. "profile/AAPL" or "ratios-ttm/AAPL"
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path parameter" });

  const url = `https://financialmodelingprep.com/api/v3/${path}?apikey=${FMP_KEY}`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Forward the response
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
