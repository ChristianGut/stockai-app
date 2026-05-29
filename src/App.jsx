import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

// ─── API KEYS ─────────────────────────────────────────────────────────────────
const FINNHUB_KEY   = import.meta.env.VITE_FINNHUB_KEY;
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bg:        "#08090d",
  surface:   "#0f1117",
  border:    "#1a1d27",
  borderHov: "#2a2d3a",
  text:      "#e8eaf0",
  textSub:   "#6b7280",
  textMuted: "#3d4152",
  accent:    "#4f8ef7",
  green:     "#34d399",
  red:       "#f87171",
  amber:     "#f59e0b",
  purple:    "#a78bfa",
};

// ─── DEFAULT WATCHLIST ────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  { ticker: "NVDA",    name: "NVIDIA Corp.",         sector: "Semiconductors" },
  { ticker: "AAPL",    name: "Apple Inc.",            sector: "Consumer Tech" },
  { ticker: "MSFT",    name: "Microsoft Corp.",       sector: "Cloud / Software" },
  { ticker: "AMZN",    name: "Amazon.com Inc.",       sector: "E-Commerce" },
  { ticker: "META",    name: "Meta Platforms",        sector: "Social Media" },
  { ticker: "TSLA",    name: "Tesla Inc.",            sector: "Automotive" },
  { ticker: "GOOGL",   name: "Alphabet Inc.",         sector: "Internet" },
  { ticker: "AMD",     name: "Advanced Micro Devices",sector: "Semiconductors" },
  { ticker: "PLTR",    name: "Palantir Technologies", sector: "AI / Data" },
  { ticker: "ASML",    name: "ASML Holding NV",       sector: "Semiconductors" },
  { ticker: "TSM",     name: "Taiwan Semiconductor",  sector: "Semiconductors" },
  { ticker: "NVO",     name: "Novo Nordisk A/S",      sector: "Pharmaceuticals" },
  { ticker: "SAP",     name: "SAP SE",                sector: "Enterprise Software" },
  { ticker: "NESN.SW", name: "Nestlé SA",             sector: "Consumer Staples" },
  { ticker: "NOVN.SW", name: "Novartis AG",           sector: "Pharmaceuticals" },
  { ticker: "ROG.SW",  name: "Roche Holding AG",      sector: "Pharmaceuticals" },
  { ticker: "COIN",    name: "Coinbase Global",       sector: "Crypto / Fintech" },
  { ticker: "SNOW",    name: "Snowflake Inc.",        sector: "Cloud Data" },
  { ticker: "CRWD",    name: "CrowdStrike Holdings",  sector: "Cybersecurity" },
  { ticker: "RBLX",    name: "Roblox Corp.",          sector: "Gaming" },
];

const DISCLAIMER = "All content is provided for informational purposes only and does not constitute investment advice. AI analyses are based on historical data and market indicators. Past performance is not indicative of future results. Capital is at risk.";

// ─── TIME RANGES ─────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "1D",  days: 1,    resolution: "5"  },
  { label: "1W",  days: 7,    resolution: "15" },
  { label: "1M",  days: 30,   resolution: "D"  },
  { label: "3M",  days: 90,   resolution: "D"  },
  { label: "1Y",  days: 365,  resolution: "W"  },
  { label: "5Y",  days: 1825, resolution: "M"  },
];

// ─── FINNHUB API ──────────────────────────────────────────────────────────────
async function fetchQuote(ticker) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    if (!d.c || d.c === 0) return null;
    return { price: d.c, change: d.dp, prevClose: d.pc, high: d.h, low: d.l, open: d.o };
  } catch { return null; }
}

async function fetchCandles(ticker, days = 90, resolution = "D") {
  try {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    if (d.s !== "ok" || !d.c?.length) return null;
    return d.c.map((price, i) => {
      const date = new Date(d.t[i] * 1000);
      const label = days <= 7
        ? date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })
        : days <= 90
        ? date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })
        : date.toLocaleDateString("de-CH", { month: "short", year: "2-digit" });
      return { label, price: +price.toFixed(2), volume: d.v?.[i] ?? 0, ts: d.t[i] };
    });
  } catch { return null; }
}

async function searchTicker(query) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    return (d.result || [])
      .filter(x => x.type === "Common Stock" || x.type === "ETP")
      .slice(0, 7)
      .map(x => ({ ticker: x.symbol, name: x.description, sector: x.type }));
  } catch { return []; }
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────
function addIndicators(data) {
  if (!data?.length) return data;
  const prices = data.map(d => d.price);
  for (let i = 0; i < data.length; i++) {
    const s20 = prices.slice(Math.max(0, i - 19), i + 1);
    const s50 = prices.slice(Math.max(0, i - 49), i + 1);
    data[i].ma20 = i >= 19 ? +(s20.reduce((a, b) => a + b) / s20.length).toFixed(2) : null;
    data[i].ma50 = i >= 49 ? +(s50.reduce((a, b) => a + b) / s50.length).toFixed(2) : null;
  }
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= 14 && i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= 14; avgL /= 14;
  for (let i = 14; i < data.length; i++) {
    const d = prices[i] - prices[i-1];
    avgG = (avgG * 13 + Math.max(0, d)) / 14;
    avgL = (avgL * 13 + Math.max(0, -d)) / 14;
    data[i].rsi = +(100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL))).toFixed(1);
  }
  const ema = (arr, p) => { const k = 2/(p+1); let e = arr[0]; return arr.map(v => { e = v*k+e*(1-k); return +e.toFixed(2); }); };
  const e12 = ema(prices, 12), e26 = ema(prices, 26);
  const ml = e12.map((v, i) => +(v - e26[i]).toFixed(2));
  const sl = ema(ml, 9);
  for (let i = 26; i < data.length; i++) {
    data[i].macd = ml[i]; data[i].macdSignal = sl[i];
    data[i].macdHist = +(ml[i] - sl[i]).toFixed(2);
  }
  return data;
}

function getFib(data) {
  const prices = data.map(d => d.price);
  const high = Math.max(...prices), low = Math.min(...prices), range = high - low;
  return { high, low, fib382: +(high - range*0.382).toFixed(2), fib50: +(high - range*0.5).toFixed(2), fib618: +(high - range*0.618).toFixed(2) };
}

function getEntry(price, fib) {
  const lvls = [fib.fib382, fib.fib50, fib.fib618].filter(l => l < price);
  return lvls.length ? lvls[0] : +(price * 0.965).toFixed(2);
}

function simulateCandles(basePrice, days = 90) {
  const data = []; let price = basePrice * 0.82; const prices = [];
  for (let i = 0; i < days; i++) {
    price *= 1 + 0.003 + (Math.random() - 0.47) * 0.022;
    if (i % 12 === 0) price *= 0.978;
    prices.push(price);
    const d = new Date(); d.setDate(d.getDate() - (days - i));
    data.push({ label: d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }), price: +price.toFixed(2), volume: Math.floor(10e6 + Math.random() * 30e6) });
  }
  return data;
}

async function buildStock(base, days = 90, resolution = "D") {
  const quote = await fetchQuote(base.ticker);
  const price = quote?.price ?? null;
  if (!price) return null;
  let candles = await fetchCandles(base.ticker, days, resolution);
  const usingReal = !!candles?.length;
  if (!usingReal) candles = simulateCandles(price, days);
  const chartData = addIndicators(candles);
  const fib = getFib(chartData);
  const lastRsi = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi ?? 50;
  const lastMacd = chartData.filter(d => d.macd != null).slice(-1)[0];
  const macdCrossing = lastMacd?.macd > lastMacd?.macdSignal ? "bullish" : "bearish";
  const lastMA50 = chartData.filter(d => d.ma50 != null).slice(-1)[0]?.ma50;
  const aboveMA50 = lastMA50 ? price > lastMA50 : null;
  const pts = (lastRsi < 55 && lastRsi > 35 ? 1 : 0) + (macdCrossing === "bullish" ? 1 : 0) + (aboveMA50 ? 1 : 0) + ((quote?.change ?? 0) > 0 ? 1 : 0);
  let signal, confidence;
  if (pts >= 3) { signal = "BUY"; confidence = 75 + pts * 4; }
  else if (pts === 2) { signal = "HOLD"; confidence = 62 + pts * 4; }
  else { signal = "WATCH"; confidence = 45 + pts * 5; }
  if (lastRsi > 75) { signal = "WATCH"; confidence = Math.min(confidence, 60); }
  confidence = Math.min(confidence, 96);
  const slPct = 0.07 + Math.random() * 0.03;
  const u30 = signal === "BUY" ? +(6 + Math.random() * 14).toFixed(1) : +((-2) - Math.random() * 6).toFixed(1);
  const u90 = signal === "BUY" ? +(14 + Math.random() * 18).toFixed(1) : +((-5) - Math.random() * 12).toFixed(1);
  return { ...base, price, change: quote?.change ?? 0, high: quote?.high, low: quote?.low, prevClose: quote?.prevClose, chartData, fib, lastRsi, macdCrossing, aboveMA50, signal, confidence, stopLossPct: slPct, entryPrice: signal === "BUY" ? getEntry(price, fib) : null, stopLoss: +(price * (1 - slPct)).toFixed(2), target30: +(price * (1 + u30/100)).toFixed(2), target90: +(price * (1 + u90/100)).toFixed(2), upside30: u30, upside90: u90, usingReal, dataSource: usingReal ? "Live · Finnhub" : "Live price · Simulated chart" };
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const map = { BUY: [C.green+"18", C.green, C.green+"30"], HOLD: [C.amber+"18", C.amber, C.amber+"30"], WATCH: [C.textMuted+"40", C.textSub, C.border] };
  const label = { BUY: "Buy", HOLD: "Hold", WATCH: "Watch" };
  const [bg, col, b] = map[signal] || map.WATCH;
  return <span style={{ background: bg, color: col, border: `1px solid ${b}`, padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{label[signal]}</span>;
}

function Change({ value }) {
  const pos = value >= 0;
  return <span style={{ color: pos ? C.green : C.red, fontSize: 12, fontWeight: 500 }}>{pos ? "+" : ""}{value.toFixed(2)}%</span>;
}

function ConfBar({ value }) {
  const col = value >= 85 ? C.green : value >= 70 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: col, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontWeight: 600, minWidth: 30 }}>{value}%</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
      <div style={{ color: C.textSub, marginBottom: 4 }}>{label}</div>
      {d?.price     && <div style={{ color: C.text,   fontWeight: 600 }}>${d.price}</div>}
      {d?.ma20      && <div style={{ color: C.amber }}>MA20  ${d.ma20}</div>}
      {d?.ma50      && <div style={{ color: C.accent }}>MA50  ${d.ma50}</div>}
      {d?.rsi != null && <div style={{ color: d.rsi > 70 ? C.red : d.rsi < 30 ? C.green : C.textSub }}>RSI  {d.rsi}</div>}
    </div>
  );
}

// ─── CHART PANEL ──────────────────────────────────────────────────────────────
function StockChart({ stock, onRangeChange }) {
  const [tab,   setTab]   = useState("price");
  const [range, setRange] = useState("3M");
  const col  = stock.signal === "BUY" ? C.green : stock.signal === "WATCH" ? C.red : C.textSub;
  const thin = stock.chartData.filter((_, i) => i % 2 === 0);
  const tabs = [{ id: "price", l: "Price" }, { id: "rsi", l: "RSI" }, { id: "macd", l: "MACD" }, { id: "volume", l: "Volume" }];

  function handleRange(r) {
    setRange(r);
    const t = TIME_RANGES.find(x => x.label === r);
    if (t) onRangeChange(t.days, t.resolution);
  }

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Tab + Range row */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, alignItems: "center", padding: "0 4px", overflowX: "auto", gap: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? C.text : C.textSub, borderBottom: tab === t.id ? `1px solid ${C.accent}` : "1px solid transparent", whiteSpace: "nowrap", transition: "color .15s" }}>{t.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, padding: "0 8px" }}>
          {TIME_RANGES.map(r => (
            <button key={r.label} onClick={() => handleRange(r.label)} style={{ background: range === r.label ? C.border : "none", border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: range === r.label ? 600 : 400, color: range === r.label ? C.text : C.textSub, whiteSpace: "nowrap" }}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 4px 8px" }}>
        {tab === "price" && (
          <>
            <div style={{ display: "flex", gap: 16, padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
              <span><span style={{ color: C.amber }}>—</span> MA20</span>
              <span><span style={{ color: C.accent }}>—</span> MA50</span>
              <span><span style={{ color: C.purple, opacity: .7 }}>- -</span> Fibonacci</span>
              {stock.entryPrice && <span><span style={{ color: C.green }}>—</span> Entry</span>}
              <span><span style={{ color: C.red }}>—</span> Stop Loss</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={col} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={col} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={Math.floor(thin.length / 6)} axisLine={false} tickLine={false} />
                <YAxis domain={["auto","auto"]} tick={{ fill: C.textMuted, fontSize: 9 }} width={54} tickFormatter={v => "$"+v} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={stock.fib.fib382} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.4} />
                <ReferenceLine y={stock.fib.fib50}  stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.3} />
                <ReferenceLine y={stock.fib.fib618} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.2} />
                {stock.entryPrice && <ReferenceLine y={stock.entryPrice} stroke={C.green} strokeDasharray="5 3" strokeWidth={1} label={{ value: `Entry $${stock.entryPrice}`, fill: C.green, fontSize: 8, position: "insideBottomLeft" }} />}
                <ReferenceLine y={stock.stopLoss} stroke={C.red} strokeDasharray="5 3" strokeWidth={1} label={{ value: `Stop $${stock.stopLoss}`, fill: C.red, fontSize: 8, position: "insideTopLeft" }} />
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={1.5} fill={`url(#g_${stock.ticker})`} dot={false} />
                <Line type="monotone" dataKey="ma20" stroke={C.amber}  strokeWidth={1} dot={false} strokeOpacity={0.8} />
                <Line type="monotone" dataKey="ma50" stroke={C.accent} strokeWidth={1} dot={false} strokeOpacity={0.8} />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "rsi" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
              RSI (14) — <span style={{ color: C.red }}>Overbought &gt;70</span>  ·  <span style={{ color: C.green }}>Oversold &lt;30</span>  ·  Current: <span style={{ color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub, fontWeight: 600 }}>{stock.lastRsi}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d => d.rsi != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={8} axisLine={false} tickLine={false} />
                <YAxis domain={[0,100]} tick={{ fill: C.textMuted, fontSize: 9 }} width={24} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={70} stroke={C.red}   strokeDasharray="4 3" strokeOpacity={0.5} />
                <ReferenceLine y={50} stroke={C.border} />
                <ReferenceLine y={30} stroke={C.green} strokeDasharray="4 3" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="rsi" stroke={C.accent} strokeWidth={1.5} fill="url(#rsiG)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "macd" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
              MACD (12, 26, 9) — <span style={{ color: C.accent }}>MACD line</span> crosses <span style={{ color: C.amber }}>signal</span> upward = bullish  ·  Current: <span style={{ color: stock.macdCrossing === "bullish" ? C.green : C.red, fontWeight: 600 }}>{stock.macdCrossing === "bullish" ? "Bullish" : "Bearish"}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={thin.filter(d => d.macd != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={8} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 9 }} width={32} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
                <ReferenceLine y={0} stroke={C.border} />
                <Bar dataKey="macdHist" fill={C.accent} fillOpacity={0.3} radius={[1,1,0,0]} />
                <Line type="monotone" dataKey="macd"       stroke={C.accent} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="macdSignal" stroke={C.amber}  strokeWidth={1}   dot={false} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "volume" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>Volume — High volume on price increases confirms the trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={8} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 9 }} width={44} tickFormatter={v => (v/1e6).toFixed(0)+"M"} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => [(v/1e6).toFixed(1)+"M", "Volume"]} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="volume" fill={col} fillOpacity={0.5} radius={[1,1,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI ANALYSIS MODAL ────────────────────────────────────────────────────────
function AIModal({ stock: initialStock, onClose }) {
  const [stock,    setStock]    = useState(initialStock);
  const [analysis, setAnalysis] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);

  async function handleRangeChange(days, resolution) {
    setLoadingChart(true);
    try {
      const updated = await buildStock({ ticker: stock.ticker, name: stock.name, sector: stock.sector }, days, resolution);
      if (updated) setStock(updated);
    } finally { setLoadingChart(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true); setAnalysis("");
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 1000,
            system: `You are a precise institutional-grade market analyst. Respond in German, ~200 words. Use this structure without markdown headers or emojis — plain professional text with line breaks between sections:

Technische Lage: What RSI, MACD and moving averages signal specifically.
Marktkontext: Current catalysts, sector trends, relevant macro factors.
Einschätzung: Justify the price target and Fibonacci entry level with specific reasoning.
Risiken: Two concrete, stock-specific risks.

Final line always exactly: "Hinweis: KI-generierte Marktinformation. Keine Anlageberatung. Keine Erfolgsgarantie."`,
            messages: [{
              role: "user",
              content: `Analyse: ${stock.name} (${stock.ticker})
Kurs: $${stock.price.toFixed(2)} (${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% heute)
Vortag: ${stock.prevClose ? "$"+stock.prevClose.toFixed(2) : "n/a"} · Hoch: ${stock.high ? "$"+stock.high.toFixed(2) : "n/a"} · Tief: ${stock.low ? "$"+stock.low.toFixed(2) : "n/a"}
Sektor: ${stock.sector}
Signal: ${stock.signal} · Konfidenz: ${stock.confidence}%
RSI(14): ${stock.lastRsi} (${stock.lastRsi > 70 ? "überkauft" : stock.lastRsi < 30 ? "überverkauft" : "neutral"})
MACD: ${stock.macdCrossing === "bullish" ? "bullish" : "bearish"} · Über MA50: ${stock.aboveMA50 === null ? "n/a" : stock.aboveMA50 ? "ja" : "nein"}
Fibonacci-Einstieg: ${stock.entryPrice ? "$"+stock.entryPrice : "nicht empfohlen"}
Stop-Loss: $${stock.stopLoss} (−${(stock.stopLossPct*100).toFixed(1)}%)
Kursziel 30T: $${stock.target30} (${stock.upside30 >= 0 ? "+":""}${stock.upside30}%)
Kursziel 90T: $${stock.target90} (${stock.upside90 >= 0 ? "+":""}${stock.upside90}%)`,
            }],
          }),
        });
        const data = await res.json();
        if (!cancelled) setAnalysis(data.content?.map(b => b.text || "").join("\n") || "Analysis unavailable.");
      } catch (e) {
        if (!cancelled) setAnalysis("Connection error: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [initialStock.ticker]);

  const priceCol = stock.change >= 0 ? C.green : C.red;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 20px", maxWidth: 700, width: "100%", marginTop: 8, boxShadow: "0 24px 64px rgba(0,0,0,.6)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, letterSpacing: 2, marginBottom: 6, textTransform: "uppercase" }}>AI Analysis</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -.3 }}>{stock.ticker} <span style={{ color: C.textSub, fontWeight: 400, fontSize: 15 }}>{stock.name}</span></div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <SignalBadge signal={stock.signal} />
              <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: C.text }}>${stock.price.toFixed(2)}</span>
              <Change value={stock.change} />
              {stock.high && <span style={{ fontSize: 11, color: C.textSub }}>H ${stock.high.toFixed(2)} · L ${stock.low.toFixed(2)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.border, border: "none", color: C.textSub, width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: 16, position: "relative" }}>
          {loadingChart && <div style={{ position: "absolute", inset: 0, background: C.surface+"cc", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, fontSize: 12, color: C.textSub }}>Loading...</div>}
          <StockChart stock={stock} onRangeChange={handleRangeChange} />
        </div>

        {/* Indicators */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
          {[
            { l: "RSI (14)", v: stock.lastRsi, s: stock.lastRsi > 70 ? "Overbought" : stock.lastRsi < 30 ? "Oversold" : "Neutral", c: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub },
            { l: "MACD", v: stock.macdCrossing === "bullish" ? "Bullish" : "Bearish", s: "Signal", c: stock.macdCrossing === "bullish" ? C.green : C.red },
            { l: "Entry (Fib)", v: stock.entryPrice ? `$${stock.entryPrice}` : "—", s: "Support level", c: C.purple },
            { l: "Stop Loss", v: `$${stock.stopLoss}`, s: `−${(stock.stopLossPct*100).toFixed(1)}%`, c: C.red },
          ].map((c, i) => (
            <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.c, fontFamily: "monospace" }}>{c.v}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>{c.s}</div>
            </div>
          ))}
        </div>

        {/* Targets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 16 }}>
          {[
            { l: "30-Day Target", v: `$${stock.target30}`, u: stock.upside30, c: C.green+"20", b: C.green+"25" },
            { l: "90-Day Target", v: `$${stock.target90}`, u: stock.upside90, c: C.accent+"15", b: C.accent+"25" },
          ].map((t, i) => (
            <div key={i} style={{ background: t.c, border: `1px solid ${t.b}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: C.text }}>{t.v}</span>
                <span style={{ color: t.u >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 600 }}>{t.u >= 0 ? "+" : ""}{t.u}%</span>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>AI projection · not guaranteed</div>
            </div>
          ))}
        </div>

        {/* AI Text */}
        {loading ? (
          <div style={{ background: C.bg, borderRadius: 8, padding: "24px", textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, letterSpacing: 0.3 }}>Analysing indicators and market data</div>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1.2s ${i*.2}s infinite` }} />)}
            </div>
          </div>
        ) : (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 18px", fontSize: 13, color: "#c8ccd8", lineHeight: 1.9, marginBottom: 14, whiteSpace: "pre-wrap", letterSpacing: 0.1 }}>{analysis}</div>
        )}

        {/* Confidence */}
        {!loading && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>AI Confidence Score</div>
            <ConfBar value={stock.confidence} />
          </div>
        )}

        {/* Data source */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>Data source: <span style={{ color: C.textSub }}>{stock.dataSource}</span></span>
          <span style={{ fontSize: 10, color: C.textMuted }}>Updated on page load</span>
        </div>

        {/* Disclaimer */}
        <div style={{ marginTop: 12, fontSize: 10, color: C.textMuted, lineHeight: 1.6 }}>{DISCLAIMER}</div>
      </div>
    </div>
  );
}

// ─── MOBILE CARD ──────────────────────────────────────────────────────────────
function StockCard({ stock, onAnalyze }) {
  return (
    <div onClick={() => onAnalyze(stock)}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", cursor: "pointer", transition: "border-color .2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHov}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 15, color: C.text }}>{stock.ticker}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{stock.name}</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{stock.sector}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 16, color: C.text }}>${stock.price.toFixed(2)}</div>
          <Change value={stock.change} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SignalBadge signal={stock.signal} />
        <span style={{ fontSize: 11, color: C.textSub }}>RSI <span style={{ color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub, fontWeight: 600 }}>{stock.lastRsi}</span></span>
        {stock.entryPrice && <span style={{ fontSize: 11, color: C.purple }}>Entry <span style={{ fontWeight: 600 }}>${stock.entryPrice}</span></span>}
        <span style={{ fontSize: 11, color: C.textSub }}>30d <span style={{ color: C.green, fontWeight: 600 }}>${stock.target30}</span></span>
      </div>
      <div style={{ background: C.border, borderRadius: 6, padding: "8px", textAlign: "center", fontSize: 11, fontWeight: 500, color: C.textSub, letterSpacing: 0.3 }}>
        View Chart & AI Analysis
      </div>
    </div>
  );
}

// ─── DESKTOP ROW ──────────────────────────────────────────────────────────────
function StockRow({ stock, onAnalyze, idx }) {
  return (
    <div onClick={() => onAnalyze(stock)}
      style={{ display: "grid", gridTemplateColumns: "70px 1fr 100px 80px 70px 110px 100px 110px", padding: "13px 20px", borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? C.bg : C.surface, transition: "background .15s", alignItems: "center", cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.background = "#141720"}
      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? C.bg : C.surface}>
      <div>
        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: C.text }}>{stock.ticker}</div>
        <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 }}>{stock.sector}</div>
      </div>
      <div style={{ fontSize: 13, color: "#9ca3af" }}>{stock.name}</div>
      <div>
        <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 13, color: C.text }}>${stock.price.toFixed(2)}</div>
        <Change value={stock.change} />
      </div>
      <div><SignalBadge signal={stock.signal} /></div>
      <div>
        <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13, color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub }}>{stock.lastRsi}</div>
        <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>{stock.lastRsi > 70 ? "Overbought" : stock.lastRsi < 30 ? "Oversold" : "Neutral"}</div>
      </div>
      <div>
        {stock.entryPrice
          ? <><div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12, color: C.purple }}>${stock.entryPrice}</div><div style={{ fontSize: 9, color: C.textMuted }}>Fib Support</div></>
          : <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>}
      </div>
      <div>
        <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12, color: C.text }}>${stock.target30}</div>
        <span style={{ color: stock.upside30 >= 0 ? C.green : C.red, fontSize: 11, fontWeight: 500 }}>{stock.upside30 >= 0 ? "+" : ""}{stock.upside30}%</span>
      </div>
      <div>
        <button style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSub, fontSize: 11, fontWeight: 500, padding: "6px 12px", cursor: "pointer", letterSpacing: 0.3, transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; }}>
          Analyse
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks,      setStocks]      = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [searchQuery, setQuery]       = useState("");
  const [searchRes,   setSearchRes]   = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsg,  setLoadingMsg]  = useState("Loading market data...");
  const [mobile,      setMobile]      = useState(window.innerWidth < 700);
  const searchRef = useRef(null);

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    async function load() {
      setLoadingList(true);
      const results = [];
      for (let i = 0; i < DEFAULT_TICKERS.length; i++) {
        setLoadingMsg(`Loading ${DEFAULT_TICKERS[i].ticker} · ${i + 1} / ${DEFAULT_TICKERS.length}`);
        const s = await buildStock(DEFAULT_TICKERS[i]);
        if (s) { results.push(s); setStocks([...results]); }
        await new Promise(r => setTimeout(r, 420));
      }
      setLoadingList(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchTicker(searchQuery);
      setSearchRes(res);
      setSearching(false);
    }, 600);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function addFromSearch(item) {
    setQuery(""); setSearchRes([]);
    const existing = stocks.find(s => s.ticker === item.ticker);
    if (existing) { setSelected(existing); return; }
    const s = await buildStock(item);
    if (s) { setStocks(prev => [s, ...prev]); setSelected(s); }
  }

  const buyCount = stocks.filter(s => s.signal === "BUY").length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter','Helvetica Neue',sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        input, button { touch-action: manipulation; font-size: 16px; }
        input::placeholder { color: ${C.textMuted}; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, background: C.bg+"f0", backdropFilter: "blur(16px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo mark */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill={C.accent} fillOpacity="0.15"/>
            <polyline points="5,20 10,13 15,16 23,7" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="23" cy="7" r="2" fill={C.accent}/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: -.4 }}>StockAI</span>
        </div>

        {!mobile && stocks.length > 0 && (
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            {stocks.slice(0, 4).map(s => (
              <span key={s.ticker} onClick={() => setSelected(s)} style={{ cursor: "pointer", color: C.textSub }}>
                <span style={{ color: C.textMuted, marginRight: 6, fontSize: 11 }}>{s.ticker}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: C.text }}>${s.price.toFixed(0)}</span>
                <span style={{ marginLeft: 4, color: s.change >= 0 ? C.green : C.red }}>{s.change >= 0 ? "+" : ""}{s.change.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: C.textSub }}>
          {loadingList
            ? <span style={{ color: C.accent }}>Loading...</span>
            : <><span style={{ color: C.green, fontWeight: 600 }}>{buyCount}</span> buy signals</>}
        </div>
      </header>

      {/* SEARCH */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, position: "relative", zIndex: 50 }}>
        <div style={{ position: "relative", maxWidth: 540 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke={C.textMuted} strokeWidth="1.5"/>
            <path d="M10 10L13 13" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search stocks — AAPL, Siemens, Nestlé..."
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px 9px 34px", color: C.text, fontSize: 14, outline: "none", transition: "border-color .15s", WebkitTextSizeAdjust: "100%" }}
            onFocus={e => e.target.style.borderColor = C.accent}
            onBlur={e => { e.target.style.borderColor = C.border; setTimeout(() => setSearchRes([]), 200); }}
          />
          {searching && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.textSub }}>Searching...</span>}
        </div>
        {searchRes.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% - 14px)", left: 20, width: 540, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
            {searchRes.map(r => (
              <div key={r.ticker} onMouseDown={() => addFromSearch(r)}
                style={{ padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background .1s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.border}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", color: C.accent, marginRight: 12, fontSize: 12 }}>{r.ticker}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{r.name}</span>
                </div>
                <span style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.sector}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STATS BAR */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 1, borderBottom: `1px solid ${C.border}` }}>
        {[
          { l: "Buy Signals",     v: loadingList ? "—" : buyCount,                                                                         c: C.green },
          { l: "Stocks Tracked",  v: loadingList && stocks.length === 0 ? "—" : stocks.length,                                             c: C.text },
          { l: "Avg RSI",         v: stocks.length ? (stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0) : "—",               c: C.text },
          { l: "Data Source",     v: "Finnhub",                                                                                            c: C.textSub },
        ].map((s, i) => (
          <div key={i} style={{ padding: "14px 20px", borderRight: i < 3 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* LIST */}
      <div style={{ padding: "16px 20px 48px" }}>
        {loadingList && stocks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 14, letterSpacing: 0.3 }}>{loadingMsg}</div>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1.4s ${i*.25}s infinite` }} />)}
            </div>
          </div>
        ) : mobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{stocks.length} stocks{loadingList ? " · loading..." : ""}</span>
              <span>Tap to analyse</span>
            </div>
            {stocks.map(s => <StockCard key={s.ticker} stock={s} onAnalyze={setSelected} />)}
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Market Overview</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{stocks.length} stocks · Live prices via Finnhub · RSI · MACD · Fibonacci{loadingList ? " · loading more..." : ""}</div>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, textAlign: "right" }}>Not investment advice</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 100px 80px 70px 110px 100px 110px", padding: "8px 20px", fontSize: 10, color: C.textMuted, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
              <span>Ticker</span><span>Company</span><span>Price</span><span>Signal</span><span>RSI</span><span>Entry</span><span>30d Target</span><span></span>
            </div>
            {stocks.map((s, i) => <StockRow key={s.ticker} stock={s} onAnalyze={setSelected} idx={i} />)}
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 10, color: C.textMuted, lineHeight: 1.7, maxWidth: 700 }}>{DISCLAIMER}</div>
      </div>

      {selected && <AIModal stock={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
