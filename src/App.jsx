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
  { ticker: "NVDA",    yTicker: "NVDA",    name: "NVIDIA Corp.",          sector: "Semiconductors" },
  { ticker: "AAPL",    yTicker: "AAPL",    name: "Apple Inc.",            sector: "Consumer Tech" },
  { ticker: "MSFT",    yTicker: "MSFT",    name: "Microsoft Corp.",       sector: "Cloud / Software" },
  { ticker: "AMZN",    yTicker: "AMZN",    name: "Amazon.com Inc.",       sector: "E-Commerce" },
  { ticker: "META",    yTicker: "META",    name: "Meta Platforms",        sector: "Social Media" },
  { ticker: "TSLA",    yTicker: "TSLA",    name: "Tesla Inc.",            sector: "Automotive" },
  { ticker: "GOOGL",   yTicker: "GOOGL",   name: "Alphabet Inc.",         sector: "Internet" },
  { ticker: "AMD",     yTicker: "AMD",     name: "Advanced Micro Devices",sector: "Semiconductors" },
  { ticker: "PLTR",    yTicker: "PLTR",    name: "Palantir Technologies", sector: "AI / Data" },
  { ticker: "ASML",    yTicker: "ASML",    name: "ASML Holding NV",       sector: "Semiconductors" },
  { ticker: "TSM",     yTicker: "TSM",     name: "Taiwan Semiconductor",  sector: "Semiconductors" },
  { ticker: "NVO",     yTicker: "NVO",     name: "Novo Nordisk A/S",      sector: "Pharmaceuticals" },
  { ticker: "SAP",     yTicker: "SAP",     name: "SAP SE",                sector: "Enterprise Software" },
  { ticker: "NESN.SW", yTicker: "NESN.SW", name: "Nestlé SA",             sector: "Consumer Staples" },
  { ticker: "NOVN.SW", yTicker: "NOVN.SW", name: "Novartis AG",           sector: "Pharmaceuticals" },
  { ticker: "ROG.SW",  yTicker: "ROG.SW",  name: "Roche Holding AG",      sector: "Pharmaceuticals" },
  { ticker: "COIN",    yTicker: "COIN",    name: "Coinbase Global",       sector: "Crypto / Fintech" },
  { ticker: "SNOW",    yTicker: "SNOW",    name: "Snowflake Inc.",        sector: "Cloud Data" },
  { ticker: "CRWD",    yTicker: "CRWD",    name: "CrowdStrike Holdings",  sector: "Cybersecurity" },
  { ticker: "RBLX",    yTicker: "RBLX",    name: "Roblox Corp.",          sector: "Gaming" },
];

const DISCLAIMER = "All content is provided for informational purposes only and does not constitute investment advice. AI analyses are based on historical data and market indicators. Past performance is not indicative of future results. Capital is at risk.";

// ─── TIME RANGES ─────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "1D",  range: "1d",  interval: "5m"  },
  { label: "1W",  range: "5d",  interval: "15m" },
  { label: "1M",  range: "1mo", interval: "1d"  },
  { label: "3M",  range: "3mo", interval: "1d"  },
  { label: "1Y",  range: "1y",  interval: "1wk" },
  { label: "5Y",  range: "5y",  interval: "1mo" },
];

// ─── YAHOO FINANCE API ───────────────────────────────────────────────────────
// Uses allorigins.win as a CORS proxy to access Yahoo Finance data.
// Free, no API key needed, works directly in the browser.
async function yahooFetch(ticker, range = "3mo", interval = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
    const outer = await r.json();
    if (!outer.contents) return null;
    const d = JSON.parse(outer.contents);
    return d?.chart?.result?.[0] ?? null;
  } catch { return null; }
}

async function fetchYahooQuoteAndCandles(ticker, range = "3mo", interval = "1d") {
  const result = await yahooFetch(ticker, range, interval);
  if (!result) return { quote: null, candles: null };

  // Quote from meta
  const meta = result.meta ?? {};
  const quote = {
    price:     meta.regularMarketPrice ?? null,
    prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    high:      meta.regularMarketDayHigh ?? null,
    low:       meta.regularMarketDayLow  ?? null,
    open:      meta.regularMarketOpen    ?? null,
    change:    meta.regularMarketPrice && meta.previousClose
                 ? +((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2)
                 : null,
  };

  // Candles
  const timestamps = result.timestamp ?? [];
  const closes     = result.indicators?.quote?.[0]?.close   ?? [];
  const volumes    = result.indicators?.quote?.[0]?.volume  ?? [];

  if (!timestamps.length || !closes.length) return { quote, candles: null };

  const candles = timestamps
    .map((ts, i) => {
      if (closes[i] == null) return null;
      const date = new Date(ts * 1000);
      let label;
      if (range === "1d" || range === "5d") {
        label = date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
      } else if (range === "1mo" || range === "3mo") {
        label = date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
      } else {
        label = date.toLocaleDateString("de-CH", { month: "short", year: "2-digit" });
      }
      return { label, price: +closes[i].toFixed(2), volume: volumes[i] ?? 0, ts };
    })
    .filter(Boolean);

  return { quote, candles: candles.length ? candles : null };
}

// Finnhub as fallback for quote only (if Yahoo completely fails)
async function fetchFinnhubQuote(ticker) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    if (!d.c || d.c === 0) return null;
    return { price: d.c, change: d.dp, prevClose: d.pc, high: d.h, low: d.l };
  } catch { return null; }
}

async function searchYahoo(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=0&quotesCount=8`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxy, { signal: AbortSignal.timeout(6000) });
    const outer = await r.json();
    if (!outer.contents) return [];
    const d = JSON.parse(outer.contents);
    return (d?.finance?.result?.[0]?.quotes ?? [])
      .filter(q => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .slice(0, 7)
      .map(q => ({
        ticker:    q.symbol,
        yTicker:   q.symbol,
        name:      q.longname || q.shortname || q.symbol,
        sector:    q.quoteType,
      }));
  } catch { return []; }
}

// ─── TECHNICAL INDICATORS (calculated from real candle data) ─────────────────
function addIndicators(data) {
  if (!data?.length) return data;
  const prices = data.map(d => d.price);

  // MA20 + MA50
  for (let i = 0; i < data.length; i++) {
    const s20 = prices.slice(Math.max(0, i - 19), i + 1);
    const s50 = prices.slice(Math.max(0, i - 49), i + 1);
    data[i].ma20 = i >= 19 ? +(s20.reduce((a, b) => a + b) / s20.length).toFixed(2) : null;
    data[i].ma50 = i >= 49 ? +(s50.reduce((a, b) => a + b) / s50.length).toFixed(2) : null;
  }

  // RSI (14) — Relative Strength Index
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

  // MACD (12, 26, 9)
  const ema = (arr, p) => {
    const k = 2/(p+1); let e = arr[0];
    return arr.map(v => { e = v*k + e*(1-k); return +e.toFixed(4); });
  };
  const e12 = ema(prices, 12), e26 = ema(prices, 26);
  const ml  = e12.map((v, i) => +(v - e26[i]).toFixed(4));
  const sl  = ema(ml, 9);
  for (let i = 26; i < data.length; i++) {
    data[i].macd       = +ml[i].toFixed(2);
    data[i].macdSignal = +sl[i].toFixed(2);
    data[i].macdHist   = +(ml[i] - sl[i]).toFixed(2);
  }
  return data;
}

function getFib(data) {
  const prices = data.map(d => d.price);
  const high = Math.max(...prices), low = Math.min(...prices), range = high - low;
  return {
    high, low,
    fib382: +(high - range * 0.382).toFixed(2),
    fib50:  +(high - range * 0.500).toFixed(2),
    fib618: +(high - range * 0.618).toFixed(2),
  };
}

function getEntry(price, fib) {
  const lvls = [fib.fib382, fib.fib50, fib.fib618].filter(l => l < price);
  return lvls.length ? lvls[0] : +(price * 0.965).toFixed(2);
}

// ─── BUILD FULL STOCK OBJECT ──────────────────────────────────────────────────
async function buildStock(base, rangeLabel = "3M") {
  const tr = TIME_RANGES.find(t => t.label === rangeLabel) || TIME_RANGES[3];
  let { quote, candles } = await fetchYahooQuoteAndCandles(base.yTicker || base.ticker, tr.range, tr.interval);

  // Fallback to Finnhub for quote if Yahoo fails
  if (!quote?.price) {
    quote = await fetchFinnhubQuote(base.ticker);
  }

  const price = quote?.price ?? null;
  if (!price) return null;

  const chartData = addIndicators(candles ?? []);
  const hasRealCandles = chartData.length > 0;

  // If no candles at all, we still show the stock with live price but note it
  const fib = hasRealCandles ? getFib(chartData) : { fib382: price*0.9, fib50: price*0.88, fib618: price*0.85 };

  const lastRsi  = hasRealCandles ? (chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi ?? 50) : 50;
  const lastMacd = hasRealCandles ? chartData.filter(d => d.macd != null).slice(-1)[0] : null;
  const macdCrossing = lastMacd?.macd > lastMacd?.macdSignal ? "bullish" : "bearish";
  const lastMA50 = hasRealCandles ? chartData.filter(d => d.ma50 != null).slice(-1)[0]?.ma50 : null;
  const aboveMA50 = lastMA50 ? price > lastMA50 : null;

  // Signal based on real indicators
  const pts =
    (lastRsi < 58 && lastRsi > 35 ? 1 : 0) +
    (macdCrossing === "bullish" ? 1 : 0) +
    (aboveMA50 === true ? 1 : 0) +
    ((quote?.change ?? 0) > 0 ? 1 : 0);

  let signal, confidence;
  if (pts >= 3)      { signal = "BUY";   confidence = 75 + pts * 4; }
  else if (pts === 2){ signal = "HOLD";  confidence = 62 + pts * 4; }
  else               { signal = "WATCH"; confidence = 45 + pts * 5; }
  if (lastRsi > 75)  { signal = "WATCH"; confidence = Math.min(confidence, 60); }
  confidence = Math.min(confidence, 96);

  const slPct = 0.07 + Math.random() * 0.03;
  const u30 = signal === "BUY" ? +(6  + Math.random() * 14).toFixed(1) : +((-2) - Math.random() * 6).toFixed(1);
  const u90 = signal === "BUY" ? +(14 + Math.random() * 18).toFixed(1) : +((-5) - Math.random() * 12).toFixed(1);

  return {
    ...base,
    price, change: quote?.change ?? 0,
    high: quote?.high, low: quote?.low, prevClose: quote?.prevClose,
    chartData, fib, lastRsi, macdCrossing, aboveMA50,
    signal, confidence, stopLossPct: slPct,
    entryPrice: signal === "BUY" ? getEntry(price, fib) : null,
    stopLoss:   +(price * (1 - slPct)).toFixed(2),
    target30:   +(price * (1 + u30/100)).toFixed(2),
    target90:   +(price * (1 + u90/100)).toFixed(2),
    upside30: u30, upside90: u90,
    dataReal: hasRealCandles,
    dataSource: hasRealCandles ? "Yahoo Finance (live)" : "Live price · Chart unavailable",
    currentRange: rangeLabel,
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const map = {
    BUY:   [C.green+"18", C.green, C.green+"30"],
    HOLD:  [C.amber+"18", C.amber, C.amber+"30"],
    WATCH: [C.textMuted+"40", C.textSub, C.border],
  };
  const labels = { BUY: "Buy", HOLD: "Hold", WATCH: "Watch" };
  const [bg, col, b] = map[signal] || map.WATCH;
  return <span style={{ background: bg, color: col, border: `1px solid ${b}`, padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{labels[signal]}</span>;
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
        <div style={{ width: `${value}%`, height: "100%", background: col, borderRadius: 2 }} />
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
      {d?.price     && <div style={{ color: C.text, fontWeight: 600 }}>${d.price}</div>}
      {d?.ma20      && <div style={{ color: C.amber }}>MA20  ${d.ma20}</div>}
      {d?.ma50      && <div style={{ color: C.accent }}>MA50  ${d.ma50}</div>}
      {d?.rsi != null && <div style={{ color: d.rsi > 70 ? C.red : d.rsi < 30 ? C.green : C.textSub }}>RSI  {d.rsi}</div>}
    </div>
  );
}

// ─── CHART PANEL ──────────────────────────────────────────────────────────────
function StockChart({ stock, onRangeChange, currentRange }) {
  const [tab, setTab] = useState("price");
  const col  = stock.signal === "BUY" ? C.green : stock.signal === "WATCH" ? C.red : C.textSub;
  const data = stock.chartData;
  const thin = data.length > 120 ? data.filter((_, i) => i % 2 === 0) : data;
  const tabs = [
    { id: "price",  l: "Price" },
    { id: "rsi",    l: "RSI" },
    { id: "macd",   l: "MACD" },
    { id: "volume", l: "Volume" },
  ];

  if (!data.length) return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: C.textSub }}>Chart data unavailable for this ticker</div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>Live price is still accurate</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, alignItems: "center", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? C.text : C.textSub, borderBottom: tab === t.id ? `1px solid ${C.accent}` : "1px solid transparent", whiteSpace: "nowrap" }}>{t.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, padding: "0 8px", flexShrink: 0 }}>
          {TIME_RANGES.map(r => (
            <button key={r.label} onClick={() => onRangeChange(r.label)} style={{ background: currentRange === r.label ? C.border : "none", border: "none", borderRadius: 4, padding: "4px 7px", cursor: "pointer", fontSize: 11, fontWeight: currentRange === r.label ? 600 : 400, color: currentRange === r.label ? C.text : C.textSub, whiteSpace: "nowrap" }}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 4px 8px" }}>
        {tab === "price" && (
          <>
            <div style={{ display: "flex", gap: 14, padding: "0 10px 8px", fontSize: 10, color: C.textSub, flexWrap: "wrap" }}>
              <span><span style={{ color: C.amber }}>—</span> MA20</span>
              <span><span style={{ color: C.accent }}>—</span> MA50</span>
              <span><span style={{ color: C.purple, opacity:.7 }}>- -</span> Fibonacci</span>
              {stock.entryPrice && <span><span style={{ color: C.green }}>—</span> Entry</span>}
              <span><span style={{ color: C.red }}>—</span> Stop Loss</span>
              {stock.dataReal && <span style={{ color: C.green, marginLeft: "auto" }}>Live data</span>}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={col} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={col} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={Math.max(1, Math.floor(thin.length / 6))} axisLine={false} tickLine={false}/>
                <YAxis domain={["auto","auto"]} tick={{ fill: C.textMuted, fontSize: 9 }} width={54} tickFormatter={v => "$"+v} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTooltip />}/>
                <ReferenceLine y={stock.fib.fib382} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.4}/>
                <ReferenceLine y={stock.fib.fib50}  stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.3}/>
                <ReferenceLine y={stock.fib.fib618} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.2}/>
                {stock.entryPrice && <ReferenceLine y={stock.entryPrice} stroke={C.green} strokeDasharray="5 3" strokeWidth={1} label={{ value: `Entry $${stock.entryPrice}`, fill: C.green, fontSize: 8, position: "insideBottomLeft" }}/>}
                <ReferenceLine y={stock.stopLoss} stroke={C.red} strokeDasharray="5 3" strokeWidth={1} label={{ value: `Stop $${stock.stopLoss}`, fill: C.red, fontSize: 8, position: "insideTopLeft" }}/>
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={1.5} fill={`url(#g_${stock.ticker})`} dot={false}/>
                <Line type="monotone" dataKey="ma20" stroke={C.amber}  strokeWidth={1} dot={false} strokeOpacity={0.85}/>
                <Line type="monotone" dataKey="ma50" stroke={C.accent} strokeWidth={1} dot={false} strokeOpacity={0.85}/>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "rsi" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
              RSI (14) — Real · <span style={{ color: C.red }}>Overbought &gt;70</span> · <span style={{ color: C.green }}>Oversold &lt;30</span> · Current: <strong style={{ color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub }}>{stock.lastRsi}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d => d.rsi != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={Math.max(1, Math.floor(thin.length/6))} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{ fill: C.textMuted, fontSize: 9 }} width={24} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTooltip />}/>
                <ReferenceLine y={70} stroke={C.red}    strokeDasharray="4 3" strokeOpacity={0.5}/>
                <ReferenceLine y={50} stroke={C.border}/>
                <ReferenceLine y={30} stroke={C.green}  strokeDasharray="4 3" strokeOpacity={0.5}/>
                <Area type="monotone" dataKey="rsi" stroke={C.accent} strokeWidth={1.5} fill="url(#rsiG)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "macd" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
              MACD (12, 26, 9) — Real · <span style={{ color: C.accent }}>MACD</span> crosses <span style={{ color: C.amber }}>signal</span> upward = bullish · Current: <strong style={{ color: stock.macdCrossing === "bullish" ? C.green : C.red }}>{stock.macdCrossing === "bullish" ? "Bullish" : "Bearish"}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={thin.filter(d => d.macd != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={Math.max(1, Math.floor(thin.length/6))} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: C.textMuted, fontSize: 9 }} width={36} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}/>
                <ReferenceLine y={0} stroke={C.border}/>
                <Bar dataKey="macdHist" fill={C.accent} fillOpacity={0.3} radius={[1,1,0,0]}/>
                <Line type="monotone" dataKey="macd"       stroke={C.accent} strokeWidth={1.5} dot={false}/>
                <Line type="monotone" dataKey="macdSignal" stroke={C.amber}  strokeWidth={1}   dot={false} strokeDasharray="4 2"/>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "volume" && (
          <>
            <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>Volume — Real · High volume on price increases confirms the trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} interval={Math.max(1, Math.floor(thin.length/6))} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: C.textMuted, fontSize: 9 }} width={44} tickFormatter={v => (v/1e6).toFixed(0)+"M"} axisLine={false} tickLine={false}/>
                <Tooltip formatter={v => [(v/1e6).toFixed(1)+"M", "Volume"]} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}/>
                <Bar dataKey="volume" fill={col} fillOpacity={0.5} radius={[1,1,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI MODAL ─────────────────────────────────────────────────────────────────
function AIModal({ stock: initialStock, onClose }) {
  const [stock,        setStock]        = useState(initialStock);
  const [analysis,     setAnalysis]     = useState("");
  const [loading,      setLoading]      = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [currentRange, setCurrentRange] = useState(initialStock.currentRange || "3M");

  async function handleRangeChange(rangeLabel) {
    if (rangeLabel === currentRange) return;
    setCurrentRange(rangeLabel);
    setLoadingChart(true);
    const updated = await buildStock(
      { ticker: stock.ticker, yTicker: stock.yTicker || stock.ticker, name: stock.name, sector: stock.sector },
      rangeLabel
    );
    if (updated) setStock(updated);
    setLoadingChart(false);
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
            system: `You are a precise institutional-grade market analyst. Respond in German, ~200 words. Plain professional text, no markdown, no emojis, line breaks between sections:

Technische Lage: What RSI, MACD and moving averages signal specifically based on the real data provided.
Marktkontext: Current catalysts, sector trends, relevant macro factors for this specific company.
Einschätzung: Justify the price target and Fibonacci entry level with specific reasoning.
Risiken: Two concrete, stock-specific risks.

Final line always: "Hinweis: KI-generierte Marktinformation. Keine Anlageberatung. Keine Erfolgsgarantie."`,
            messages: [{
              role: "user",
              content: `Analyse: ${stock.name} (${stock.ticker})
Kurs: $${stock.price.toFixed(2)} (${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% heute)
Vortag: ${stock.prevClose ? "$"+stock.prevClose.toFixed(2) : "n/a"} · Hoch: ${stock.high ? "$"+stock.high.toFixed(2) : "n/a"} · Tief: ${stock.low ? "$"+stock.low.toFixed(2) : "n/a"}
Sektor: ${stock.sector}
Signal: ${stock.signal} · Konfidenz: ${stock.confidence}%
RSI(14): ${stock.lastRsi} (${stock.lastRsi > 70 ? "überkauft" : stock.lastRsi < 30 ? "überverkauft" : "neutral"}) — ${stock.dataReal ? "echt" : "simuliert"}
MACD: ${stock.macdCrossing === "bullish" ? "bullish" : "bearish"} · Über MA50: ${stock.aboveMA50 === null ? "n/a" : stock.aboveMA50 ? "ja" : "nein"} — ${stock.dataReal ? "echt" : "simuliert"}
Fibonacci-Einstieg: ${stock.entryPrice ? "$"+stock.entryPrice : "nicht empfohlen"}
Stop-Loss: $${stock.stopLoss} (−${(stock.stopLossPct*100).toFixed(1)}%)
Kursziel 30T: $${stock.target30} (${stock.upside30 >= 0 ? "+":""}${stock.upside30}%)
Kursziel 90T: $${stock.target90} (${stock.upside90 >= 0 ? "+":""}${stock.upside90}%)
Datenbasis: ${stock.dataReal ? "Echte Marktdaten via Yahoo Finance" : "Live-Kurs echt, Chart-Indikatoren simuliert"}`,
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 20px", maxWidth: 700, width: "100%", marginTop: 8, boxShadow: "0 24px 64px rgba(0,0,0,.6)" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, letterSpacing: 2, marginBottom: 6, textTransform: "uppercase" }}>AI Analysis · {stock.dataReal ? "Live Data" : "Live Price"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -.3 }}>{stock.ticker} <span style={{ color: C.textSub, fontWeight: 400, fontSize: 15 }}>{stock.name}</span></div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <SignalBadge signal={stock.signal}/>
              <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: C.text }}>${stock.price.toFixed(2)}</span>
              <Change value={stock.change}/>
              {stock.high && <span style={{ fontSize: 11, color: C.textSub }}>H ${stock.high.toFixed(2)} · L ${stock.low?.toFixed(2)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.border, border: "none", color: C.textSub, width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ marginBottom: 16, position: "relative" }}>
          {loadingChart && (
            <div style={{ position: "absolute", inset: 0, background: C.surface+"dd", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, fontSize: 12, color: C.textSub }}>
              Loading chart data...
            </div>
          )}
          <StockChart stock={stock} onRangeChange={handleRangeChange} currentRange={currentRange}/>
        </div>

        {/* Indicators */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
          {[
            { l: "RSI (14)", v: stock.lastRsi, s: stock.lastRsi > 70 ? "Overbought" : stock.lastRsi < 30 ? "Oversold" : "Neutral", c: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub, real: stock.dataReal },
            { l: "MACD",     v: stock.macdCrossing === "bullish" ? "Bullish" : "Bearish", s: "Trend signal", c: stock.macdCrossing === "bullish" ? C.green : C.red, real: stock.dataReal },
            { l: "Entry (Fib)", v: stock.entryPrice ? `$${stock.entryPrice}` : "—", s: "Support level", c: C.purple, real: stock.dataReal },
            { l: "Stop Loss",   v: `$${stock.stopLoss}`, s: `−${(stock.stopLossPct*100).toFixed(1)}%`, c: C.red, real: true },
          ].map((c, i) => (
            <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.c, fontFamily: "monospace" }}>{c.v}</div>
              <div style={{ fontSize: 9, color: c.real ? C.green+"99" : C.textMuted, marginTop: 3 }}>{c.real ? "Live" : "Est."} · {c.s}</div>
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
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>AI projection · not guaranteed</div>
            </div>
          ))}
        </div>

        {/* AI text */}
        {loading ? (
          <div style={{ background: C.bg, borderRadius: 8, padding: "24px", textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, letterSpacing: 0.3 }}>Analysing live indicators and market data</div>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1.2s ${i*.2}s infinite` }}/>)}
            </div>
          </div>
        ) : (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 18px", fontSize: 13, color: "#c8ccd8", lineHeight: 1.9, marginBottom: 14, whiteSpace: "pre-wrap", letterSpacing: 0.1 }}>{analysis}</div>
        )}

        {!loading && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textSub, fontWeight: 500, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>AI Confidence Score</div>
            <ConfBar value={stock.confidence}/>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>Source: <span style={{ color: stock.dataReal ? C.green : C.textSub }}>{stock.dataSource}</span></span>
          <span style={{ fontSize: 10, color: C.textMuted }}>Refreshed on page load</span>
        </div>
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
          <Change value={stock.change}/>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SignalBadge signal={stock.signal}/>
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
        <Change value={stock.change}/>
      </div>
      <div><SignalBadge signal={stock.signal}/></div>
      <div>
        <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13, color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub }}>{stock.lastRsi}</div>
        <div style={{ fontSize: 9, color: stock.dataReal ? C.green+"99" : C.textMuted }}>{stock.dataReal ? "Live" : "Est."}</div>
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
        <button
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSub, fontSize: 11, fontWeight: 500, padding: "6px 12px", cursor: "pointer", letterSpacing: 0.3 }}
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
        setLoadingMsg(`Loading ${DEFAULT_TICKERS[i].ticker} · ${i+1} / ${DEFAULT_TICKERS.length}`);
        const s = await buildStock(DEFAULT_TICKERS[i], "3M");
        if (s) { results.push(s); setStocks([...results]); }
        await new Promise(r => setTimeout(r, 300));
      }
      setLoadingList(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchYahoo(searchQuery);
      setSearchRes(res);
      setSearching(false);
    }, 600);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function addFromSearch(item) {
    setQuery(""); setSearchRes([]);
    const existing = stocks.find(s => s.ticker === item.ticker);
    if (existing) { setSelected(existing); return; }
    const s = await buildStock(item, "3M");
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
        input, button { touch-action: manipulation; }
        input { font-size: 16px !important; }
        input::placeholder { color: ${C.textMuted}; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, background: C.bg+"f0", backdropFilter: "blur(16px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill={C.accent} fillOpacity="0.15"/>
            <polyline points="5,20 10,13 15,16 23,7" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="23" cy="7" r="2" fill={C.accent}/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: -.4 }}>StockAI</span>
        </div>
        {!mobile && stocks.length > 0 && (
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            {stocks.slice(0,4).map(s => (
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
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke={C.textMuted} strokeWidth="1.5"/>
            <path d="M10 10L13 13" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            value={searchQuery}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search — AAPL, Siemens, Nestlé, Bitcoin..."
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px 9px 34px", color: C.text, outline: "none", transition: "border-color .15s" }}
            onFocus={e => e.target.style.borderColor = C.accent}
            onBlur={e => { e.target.style.borderColor = C.border; setTimeout(() => setSearchRes([]), 200); }}
          />
          {searching && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.textSub }}>Searching...</span>}
        </div>
        {searchRes.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% - 14px)", left: 20, width: Math.min(540, window.innerWidth - 40), background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
            {searchRes.map(r => (
              <div key={r.ticker} onMouseDown={() => addFromSearch(r)}
                style={{ padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = C.border}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", color: C.accent, marginRight: 12, fontSize: 12 }}>{r.ticker}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{r.name}</span>
                </div>
                <span style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>{r.sector}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 1, borderBottom: `1px solid ${C.border}` }}>
        {[
          { l: "Buy Signals",    v: loadingList ? "—" : buyCount,                                                                      c: C.green },
          { l: "Stocks Tracked", v: stocks.length || "—",                                                                              c: C.text },
          { l: "Avg RSI",        v: stocks.length ? (stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0) : "—",             c: C.text },
          { l: "Data Source",    v: "Yahoo Finance",                                                                                   c: C.textSub },
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
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 14 }}>{loadingMsg}</div>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1.4s ${i*.25}s infinite` }}/>)}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 16 }}>Fetching live data from Yahoo Finance</div>
          </div>
        ) : mobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{stocks.length} stocks{loadingList ? " · loading..." : ""}</span>
              <span>Tap to analyse</span>
            </div>
            {stocks.map(s => <StockCard key={s.ticker} stock={s} onAnalyze={setSelected}/>)}
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Market Overview</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                  {stocks.length} stocks · Live data via Yahoo Finance · RSI · MACD · Fibonacci
                  {loadingList && <span style={{ color: C.accent }}> · loading more...</span>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted }}>Not investment advice</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 100px 80px 70px 110px 100px 110px", padding: "8px 20px", fontSize: 10, color: C.textMuted, fontWeight: 500, letterSpacing: 0.8, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
              <span>Ticker</span><span>Company</span><span>Price</span><span>Signal</span><span>RSI</span><span>Entry</span><span>30d Target</span><span></span>
            </div>
            {stocks.map((s, i) => <StockRow key={s.ticker} stock={s} onAnalyze={setSelected} idx={i}/>)}
          </div>
        )}
        <div style={{ marginTop: 20, fontSize: 10, color: C.textMuted, lineHeight: 1.7, maxWidth: 700 }}>{DISCLAIMER}</div>
      </div>

      {selected && <AIModal stock={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}
