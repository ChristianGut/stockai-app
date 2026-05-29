// api/fmp.js — Vercel Serverless Function
// Proxies requests to Financial Modeling Prep API
// This runs on the server so there are no CORS issues
export default async function handler(req, res) {
  // Allow requests from our own domain
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path" });

  const FMP_KEY = process.env.VITE_FMP_KEY;
  if (!FMP_KEY) return res.status(500).json({ error: "FMP key not configured" });

  const url = `https://financialmodelingprep.com/api/v3/${path}?apikey=${FMP_KEY}`;

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "StockAI/1.0" },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
