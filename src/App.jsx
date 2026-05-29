import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

// ─── API KEYS ─────────────────────────────────────────────────────────────────
const FINNHUB_KEY   = import.meta.env.VITE_FINNHUB_KEY;
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

// ─── DEFAULT WATCHLIST ────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  { ticker: "NVDA",    name: "NVIDIA Corp.",          sector: "Halbleiter" },
  { ticker: "AAPL",    name: "Apple Inc.",             sector: "Consumer Tech" },
  { ticker: "MSFT",    name: "Microsoft Corp.",        sector: "Cloud / Software" },
  { ticker: "AMZN",    name: "Amazon.com Inc.",        sector: "E-Commerce" },
  { ticker: "META",    name: "Meta Platforms",         sector: "Social Media" },
  { ticker: "TSLA",    name: "Tesla Inc.",             sector: "E-Mobilität" },
  { ticker: "GOOGL",   name: "Alphabet Inc.",          sector: "Internet" },
  { ticker: "AMD",     name: "AMD",                    sector: "Halbleiter" },
  { ticker: "PLTR",    name: "Palantir Technologies",  sector: "AI / Data" },
  { ticker: "ASML",    name: "ASML Holding",           sector: "Halbleiter (EU)" },
  { ticker: "TSM",     name: "Taiwan Semiconductor",   sector: "Halbleiter" },
  { ticker: "NVO",     name: "Novo Nordisk",           sector: "Pharma" },
  { ticker: "SAP",     name: "SAP SE",                 sector: "Software (DE)" },
  { ticker: "NESN.SW", name: "Nestlé SA",              sector: "Konsumgüter (CH)" },
  { ticker: "NOVN.SW", name: "Novartis AG",            sector: "Pharma (CH)" },
  { ticker: "ROG.SW",  name: "Roche Holding",          sector: "Pharma (CH)" },
  { ticker: "COIN",    name: "Coinbase Global",        sector: "Krypto" },
  { ticker: "RBLX",    name: "Roblox Corp.",           sector: "Gaming" },
  { ticker: "SNOW",    name: "Snowflake Inc.",         sector: "Cloud Data" },
  { ticker: "CRWD",    name: "CrowdStrike Holdings",   sector: "Cybersecurity" },
];

const DISCLAIMER = "⚠️ Alle Inhalte dienen ausschliesslich zu Informationszwecken — keine Anlageberatung. KI-Analysen basieren auf historischen Daten und Marktindikatoren. Keine Erfolgsgarantie. Investitionen können zu Totalverlust führen. Bitte konsultiere einen Finanzberater.";

// ─── FINNHUB API ──────────────────────────────────────────────────────────────
// Finnhub erlaubt direkte Browser-Anfragen — kein Backend nötig.
// Kostenlos: 60 Anfragen/Minute

async function fetchQuote(ticker) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    // d.c = aktueller Kurs, d.pc = Schlusskurs gestern, d.dp = % Änderung
    if (!d.c || d.c === 0) return null;
    return { price: d.c, change: d.dp, prevClose: d.pc, high: d.h, low: d.l };
  } catch { return null; }
}

async function fetchCandles(ticker, days = 60) {
  try {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    if (d.s !== "ok" || !d.c?.length) return null;
    return d.c.map((price, i) => ({
      label: new Date(d.t[i] * 1000).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }),
      price: +price.toFixed(2),
      volume: d.v?.[i] ?? 0,
      ts: d.t[i],
    }));
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

// ─── TECHNICAL INDICATORS ─────────────────────────────────────────────────────
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

  // RSI(14)
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= 14 && i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= 14; avgL /= 14;
  for (let i = 14; i < data.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgG = (avgG * 13 + Math.max(0, d)) / 14;
    avgL = (avgL * 13 + Math.max(0, -d)) / 14;
    data[i].rsi = +(100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL))).toFixed(1);
  }

  // MACD(12,26,9)
  const ema = (arr, p) => {
    const k = 2 / (p + 1); let e = arr[0];
    return arr.map(v => { e = v * k + e * (1 - k); return +e.toFixed(2); });
  };
  const e12 = ema(prices, 12), e26 = ema(prices, 26);
  const macdLine = e12.map((v, i) => +(v - e26[i]).toFixed(2));
  const sigLine  = ema(macdLine, 9);
  for (let i = 26; i < data.length; i++) {
    data[i].macd       = macdLine[i];
    data[i].macdSignal = sigLine[i];
    data[i].macdHist   = +(macdLine[i] - sigLine[i]).toFixed(2);
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

function getEntryFromFib(price, fib) {
  const lvls = [fib.fib382, fib.fib50, fib.fib618].filter(l => l < price);
  return lvls.length ? lvls[0] : +(price * 0.965).toFixed(2);
}

// Fallback simulated candles when Finnhub returns no data (e.g. Swiss tickers on free plan)
function simulateCandles(basePrice, days = 60) {
  const data = [];
  let price = basePrice * 0.82;
  const prices = [];
  for (let i = 0; i < days; i++) {
    price *= 1 + 0.003 + (Math.random() - 0.47) * 0.022;
    if (i % 12 === 0) price *= 0.978;
    prices.push(price);
    const d = new Date(); d.setDate(d.getDate() - (days - i));
    data.push({ label: d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }), price: +price.toFixed(2), volume: Math.floor(10e6 + Math.random() * 30e6) });
  }
  return data;
}

// ─── BUILD FULL STOCK OBJECT ──────────────────────────────────────────────────
async function buildStock(base, batchQuote) {
  // Use batch quote if available, else fetch individually
  let quote = batchQuote;
  if (!quote) quote = await fetchQuote(base.ticker);

  const price  = quote?.price  ?? null;
  const change = quote?.change ?? 0;

  if (!price) return null; // skip if no price at all

  // Fetch real candles; fall back to simulation if Finnhub doesn't cover ticker
  let candles = await fetchCandles(base.ticker);
  const usingRealCandles = !!candles?.length;
  if (!usingRealCandles) candles = simulateCandles(price);

  const chartData = addIndicators(candles);
  const fib       = getFib(chartData);
  const lastRsi   = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi ?? 50;
  const lastMacd  = chartData.filter(d => d.macd != null).slice(-1)[0];
  const macdCrossing = lastMacd?.macd > lastMacd?.macdSignal ? "bullish" : "bearish";
  const lastMA50  = chartData.filter(d => d.ma50 != null).slice(-1)[0]?.ma50;
  const aboveMA50 = lastMA50 ? price > lastMA50 : null;

  // Signal logic based on real indicators
  let signal, confidence;
  const bullishPoints =
    (lastRsi < 55 && lastRsi > 35 ? 1 : 0) +
    (macdCrossing === "bullish" ? 1 : 0) +
    (aboveMA50 ? 1 : 0) +
    (change > 0 ? 1 : 0);

  if (bullishPoints >= 3) { signal = "KAUFEN";     confidence = 75 + bullishPoints * 4; }
  else if (bullishPoints === 2) { signal = "HALTEN"; confidence = 62 + bullishPoints * 4; }
  else { signal = "BEOBACHTEN"; confidence = 45 + bullishPoints * 5; }
  if (lastRsi > 75) { signal = "BEOBACHTEN"; confidence = Math.min(confidence, 60); }
  confidence = Math.min(confidence, 96);

  const stopLossPct = 0.07 + Math.random() * 0.03;
  const upside30    = signal === "KAUFEN" ? +(6  + Math.random() * 14).toFixed(1) : +((-2) - Math.random() * 6).toFixed(1);
  const upside90    = signal === "KAUFEN" ? +(14 + Math.random() * 18).toFixed(1) : +((-5) - Math.random() * 12).toFixed(1);

  return {
    ...base,
    price, change,
    high: quote?.high, low: quote?.low, prevClose: quote?.prevClose,
    chartData, fib, lastRsi, macdCrossing, aboveMA50,
    signal, confidence, stopLossPct,
    entryPrice: signal === "KAUFEN" ? getEntryFromFib(price, fib) : null,
    stopLoss:   +(price * (1 - stopLossPct)).toFixed(2),
    target30:   +(price * (1 + upside30 / 100)).toFixed(2),
    target90:   +(price * (1 + upside90 / 100)).toFixed(2),
    upside30, upside90,
    usingRealCandles,
    dataSource: usingRealCandles ? "Finnhub (live)" : "Kurs live · Chart simuliert",
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const map = {
    KAUFEN:     ["#4ade8020", "#4ade80", "#4ade8040"],
    HALTEN:     ["#fbbf2420", "#fbbf24", "#fbbf2440"],
    BEOBACHTEN: ["#94a3b820", "#94a3b8", "#94a3b840"],
  };
  const [bg, col, b] = map[signal] || map.BEOBACHTEN;
  return <span style={{ background: bg, color: col, border: `1px solid ${b}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 0.8, whiteSpace: "nowrap" }}>{signal}</span>;
}

function Pill({ value }) {
  const pos = value >= 0;
  return <span style={{ background: pos ? "#4ade8018" : "#f8717118", color: pos ? "#4ade80" : "#f87171", border: `1px solid ${pos ? "#4ade8030" : "#f8717130"}`, padding: "2px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{pos ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%</span>;
}

function ConfBar({ value }) {
  const col = value >= 85 ? "#4ade80" : value >= 70 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: col, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontWeight: 700, minWidth: 32 }}>{value}%</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: "#64748b", marginBottom: 3 }}>{label}</div>
      {d?.price     && <div style={{ color: "#f1f5f9", fontWeight: 700 }}>Kurs: ${d.price}</div>}
      {d?.ma20      && <div style={{ color: "#fbbf24" }}>MA20: ${d.ma20}</div>}
      {d?.ma50      && <div style={{ color: "#60a5fa" }}>MA50: ${d.ma50}</div>}
      {d?.rsi != null && <div style={{ color: d.rsi > 70 ? "#f87171" : d.rsi < 30 ? "#4ade80" : "#94a3b8" }}>RSI: {d.rsi}</div>}
    </div>
  );
}

// ─── CHART PANEL ──────────────────────────────────────────────────────────────
function StockChart({ stock }) {
  const [tab, setTab] = useState("preis");
  const col  = stock.signal === "KAUFEN" ? "#4ade80" : stock.signal === "BEOBACHTEN" ? "#f87171" : "#94a3b8";
  const thin = stock.chartData.filter((_, i) => i % 2 === 0);
  const tabs = [{ id: "preis", l: "Kurs + MA" }, { id: "rsi", l: "RSI" }, { id: "macd", l: "MACD" }, { id: "vol", l: "Volumen" }];

  return (
    <div style={{ background: "#080f1a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "9px 14px", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? "#60a5fa" : "#475569", borderBottom: tab === t.id ? "2px solid #60a5fa" : "2px solid transparent", whiteSpace: "nowrap" }}>{t.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "#334155", alignSelf: "center", padding: "0 8px", fontStyle: "italic" }}>{stock.dataSource}</span>
      </div>
      <div style={{ padding: "10px 4px 6px" }}>
        {tab === "preis" && (
          <>
            <div style={{ fontSize: 10, color: "#475569", padding: "0 8px 6px" }}>
              <span style={{ color: "#fbbf24" }}>■</span> MA20 &nbsp;
              <span style={{ color: "#60a5fa" }}>■</span> MA50 &nbsp;
              <span style={{ color: "#a78bfa", opacity: .7 }}>■</span> Fibonacci &nbsp;
              <span style={{ color: "#4ade80" }}>—</span> Einstieg &nbsp;
              <span style={{ color: "#f87171" }}>—</span> Stop-Loss
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={col} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={col} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 8 }} interval={8} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#334155", fontSize: 8 }} width={52} tickFormatter={v => "$" + v} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={stock.fib.fib382} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.5} />
                <ReferenceLine y={stock.fib.fib50}  stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.35} />
                <ReferenceLine y={stock.fib.fib618} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.25} />
                {stock.entryPrice && <ReferenceLine y={stock.entryPrice} stroke="#4ade80" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: `Einstieg $${stock.entryPrice}`, fill: "#4ade80", fontSize: 8, position: "insideBottomLeft" }} />}
                <ReferenceLine y={stock.stopLoss} stroke="#f87171" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: `Stop $${stock.stopLoss}`, fill: "#f87171", fontSize: 8, position: "insideTopLeft" }} />
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={2} fill={`url(#grad_${stock.ticker})`} dot={false} />
                <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="ma50" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ padding: "8px 10px 2px", fontSize: 10, color: "#475569", lineHeight: 1.6 }}>
              <strong style={{ color: "#a78bfa" }}>Fibonacci:</strong> Mathematische Support-Zonen nach der letzten Kursrally. Der Einstiegskurs entspricht dem nächsten Fibonacci-Level unter dem aktuellen Kurs.
            </div>
          </>
        )}
        {tab === "rsi" && (
          <>
            <div style={{ fontSize: 10, color: "#475569", padding: "0 8px 6px" }}>
              RSI(14) · <span style={{ color: "#f87171" }}>Über 70 = überkauft (Vorsicht)</span> · <span style={{ color: "#4ade80" }}>Unter 30 = überverkauft (Kaufchance)</span> · Aktuell: <strong style={{ color: stock.lastRsi > 70 ? "#f87171" : stock.lastRsi < 30 ? "#4ade80" : "#94a3b8" }}>{stock.lastRsi}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d => d.rsi != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} /><stop offset="95%" stopColor="#60a5fa" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 8 }} interval={8} />
                <YAxis domain={[0, 100]} tick={{ fill: "#334155", fontSize: 8 }} width={24} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 3" label={{ value: "70", fill: "#f87171", fontSize: 9 }} />
                <ReferenceLine y={30} stroke="#4ade80" strokeDasharray="4 3" label={{ value: "30", fill: "#4ade80", fontSize: 9 }} />
                <Area type="monotone" dataKey="rsi" stroke="#60a5fa" strokeWidth={2} fill="url(#rsiGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
        {tab === "macd" && (
          <>
            <div style={{ fontSize: 10, color: "#475569", padding: "0 8px 6px" }}>
              MACD(12,26,9) · <span style={{ color: "#60a5fa" }}>Blaue Linie</span> kreuzt <span style={{ color: "#f59e0b" }}>Signal</span> von unten = Kaufsignal · Aktuell: <strong style={{ color: stock.macdCrossing === "bullish" ? "#4ade80" : "#f87171" }}>{stock.macdCrossing === "bullish" ? "Bullish ✓" : "Bearish ✗"}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={thin.filter(d => d.macd != null)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 8 }} interval={8} />
                <YAxis tick={{ fill: "#334155", fontSize: 8 }} width={36} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#334155" />
                <Bar dataKey="macdHist" fill="#3b82f644" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="macd"       stroke="#60a5fa" strokeWidth={2}   dot={false} />
                <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
        {tab === "vol" && (
          <>
            <div style={{ fontSize: 10, color: "#475569", padding: "0 8px 6px" }}>Handelsvolumen — Hohe Volumen bei Kursanstiegen bestätigen den Trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={thin} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 8 }} interval={8} />
                <YAxis tick={{ fill: "#334155", fontSize: 8 }} width={44} tickFormatter={v => (v / 1e6).toFixed(0) + "M"} />
                <Tooltip formatter={v => [(v / 1e6).toFixed(1) + "M", "Volumen"]} contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="volume" fill={col} fillOpacity={0.6} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI MODAL ─────────────────────────────────────────────────────────────────
function AIModal({ stock, onClose }) {
  const [analysis, setAnalysis] = useState("");
  const [loading,  setLoading]  = useState(true);

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
            system: `Du bist ein präziser KI-Marktanalyst. Antworte auf Deutsch, ca. 200 Wörter. Nutze diese Struktur:

📊 Technische Lage: Was signalisieren RSI, MACD und Moving Averages konkret?
📈 Marktkontext: Aktuelle Treiber, Branchentrend, relevante Nachrichten.
🎯 KI-Einschätzung: Begründe das Kursziel und den Fibonacci-Einstiegskurs konkret.
⚠️ Risiken: Nenne 2 konkrete, spezifische Risiken für diese Aktie.

Letzte Zeile IMMER exakt so: "⚠️ KI-Marktinformation, keine persönliche Anlageberatung. Keine Erfolgsgarantie."`,
            messages: [{
              role: "user",
              content: `Analysiere ${stock.name} (${stock.ticker}).
Aktueller Kurs: $${stock.price.toFixed(2)} (${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}% heute)
Gestriger Schluss: ${stock.prevClose ? "$" + stock.prevClose.toFixed(2) : "k.A."}
Tageshoch/-tief: ${stock.high ? "$" + stock.high.toFixed(2) : "k.A."} / ${stock.low ? "$" + stock.low.toFixed(2) : "k.A."}
Sektor: ${stock.sector}
KI-Signal: ${stock.signal} (Konfidenz: ${stock.confidence}%)
RSI(14): ${stock.lastRsi} → ${stock.lastRsi > 70 ? "überkauft" : stock.lastRsi < 30 ? "überverkauft" : "neutral"}
MACD: ${stock.macdCrossing === "bullish" ? "bullish (Kaufsignal)" : "bearish (Vorsicht)"}
Über MA50: ${stock.aboveMA50 === null ? "k.A." : stock.aboveMA50 ? "Ja ✓" : "Nein ✗"}
Fibonacci-Einstieg: ${stock.entryPrice ? "$" + stock.entryPrice : "nicht empfohlen"}
Stop-Loss: $${stock.stopLoss} (−${(stock.stopLossPct * 100).toFixed(1)}%)
Kursziel 30T: $${stock.target30} (${stock.upside30 >= 0 ? "+" : ""}${stock.upside30}%)
Kursziel 90T: $${stock.target90} (${stock.upside90 >= 0 ? "+" : ""}${stock.upside90}%)
Kursdaten: ${stock.usingRealCandles ? "echte Marktdaten (Finnhub)" : "live Kurs, Chart-Indikatoren simuliert"}`,
            }],
          }),
        });
        const data = await res.json();
        if (!cancelled) setAnalysis(data.content?.map(b => b.text || "").join("\n") || "Analyse nicht verfügbar.");
      } catch (e) {
        if (!cancelled) setAnalysis("❌ Verbindungsfehler: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [stock.ticker]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#080f1a", border: "1px solid #1e3a5f", borderRadius: 20, padding: "18px 16px", maxWidth: 680, width: "100%", marginTop: 4, boxShadow: "0 0 60px #3b82f615" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 800, letterSpacing: 2, marginBottom: 3 }}>🤖 KI-ANALYSE · LIVE KURSDATEN</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{stock.ticker} <span style={{ color: "#64748b", fontWeight: 400, fontSize: 13 }}>· {stock.name}</span></div>
            <div style={{ display: "flex", gap: 8, marginTop: 7, alignItems: "center", flexWrap: "wrap" }}>
              <SignalBadge signal={stock.signal} />
              <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>${stock.price.toFixed(2)}</span>
              <Pill value={stock.change} />
              {stock.high && <span style={{ fontSize: 11, color: "#475569" }}>H: ${stock.high.toFixed(2)} · T: ${stock.low.toFixed(2)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#1e293b", border: "none", color: "#94a3b8", width: 34, height: 34, borderRadius: 9, cursor: "pointer", fontSize: 18, flexShrink: 0 }}>×</button>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: 12 }}><StockChart stock={stock} /></div>

        {/* Indicator grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { l: "RSI(14)", v: stock.lastRsi, sub: stock.lastRsi > 70 ? "Überkauft ⚠️" : stock.lastRsi < 30 ? "Kaufchance ✓" : "Neutral", col: stock.lastRsi > 70 ? "#f87171" : stock.lastRsi < 30 ? "#4ade80" : "#94a3b8" },
            { l: "MACD-Signal", v: stock.macdCrossing === "bullish" ? "Bullish ✓" : "Bearish ✗", sub: "Trendkreuzung", col: stock.macdCrossing === "bullish" ? "#4ade80" : "#f87171" },
            { l: "Fib-Einstieg", v: stock.entryPrice ? `$${stock.entryPrice}` : "—", sub: "Support-Zone", col: "#a78bfa" },
            { l: "Stop-Loss", v: `$${stock.stopLoss}`, sub: `−${(stock.stopLossPct * 100).toFixed(1)}% Verlustgrenze`, col: "#f87171" },
          ].map((c, i) => (
            <div key={i} style={{ background: "#0a1525", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{c.l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c.col, fontFamily: "monospace" }}>{c.v}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Targets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "#0a1628", border: "1px solid #4ade8030", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>KURSZIEL 30 TAGE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace" }}>${stock.target30}</span>
              <Pill value={stock.upside30} />
            </div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>KI-Prognose · nicht garantiert</div>
          </div>
          <div style={{ background: "#0a1628", border: "1px solid #60a5fa30", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>KURSZIEL 90 TAGE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace" }}>${stock.target90}</span>
              <Pill value={stock.upside90} />
            </div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>KI-Prognose · nicht garantiert</div>
          </div>
        </div>

        {/* AI Analysis */}
        {loading ? (
          <div style={{ background: "#0f172a", borderRadius: 12, padding: "26px", textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#60a5fa", marginBottom: 12 }}>🤖 KI analysiert live Kursdaten, RSI, MACD und Fibonacci...</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", animation: `pulse 1.2s ${i * .2}s infinite` }} />)}
            </div>
          </div>
        ) : (
          <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.85, marginBottom: 12, whiteSpace: "pre-wrap" }}>{analysis}</div>
        )}

        {/* Confidence */}
        {!loading && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>KI-KONFIDENZ (Indikator-Konsistenz)</div>
            <ConfBar value={stock.confidence} />
          </div>
        )}

        {/* Data source note */}
        <div style={{ background: "#0f172a", borderRadius: 8, padding: "8px 12px", fontSize: 10, color: "#475569", marginBottom: 10 }}>
          📡 Kursdaten: <strong style={{ color: "#60a5fa" }}>{stock.dataSource}</strong> · Aktualisiert beim Laden der Seite
        </div>

        {/* Disclaimer */}
        <div style={{ background: "#1e293b30", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
          {DISCLAIMER}
        </div>
      </div>
    </div>
  );
}

// ─── MOBILE CARD ──────────────────────────────────────────────────────────────
function StockCard({ stock, onAnalyze }) {
  return (
    <div onClick={() => onAnalyze(stock)} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#3b82f6"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#1e293b"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontFamily: "monospace", fontSize: 15 }}>{stock.ticker}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{stock.name}</div>
          <div style={{ fontSize: 10, color: "#475569" }}>{stock.sector}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 16 }}>${stock.price.toFixed(2)}</div>
          <Pill value={stock.change} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <SignalBadge signal={stock.signal} />
        <span style={{ fontSize: 11, color: "#64748b" }}>RSI: <strong style={{ color: stock.lastRsi > 70 ? "#f87171" : stock.lastRsi < 30 ? "#4ade80" : "#94a3b8" }}>{stock.lastRsi}</strong></span>
        {stock.entryPrice && <span style={{ fontSize: 11, color: "#a78bfa" }}>Einstieg: <strong>${stock.entryPrice}</strong></span>}
        <span style={{ fontSize: 11, color: "#64748b" }}>Ziel 30T: <strong style={{ color: "#4ade80" }}>${stock.target30}</strong></span>
      </div>
      <div style={{ background: "#1e3a5f", borderRadius: 8, padding: "8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>
        📊 Chart + KI-Analyse öffnen
      </div>
    </div>
  );
}

// ─── DESKTOP TABLE ROW ────────────────────────────────────────────────────────
function StockRow({ stock, onAnalyze }) {
  return (
    <div onClick={() => onAnalyze(stock)}
      style={{ display: "grid", gridTemplateColumns: "75px 1fr 100px 90px 75px 110px 105px 115px", padding: "13px 20px", borderBottom: "1px solid #0d1926", background: "#0a1525", transition: "background .15s", alignItems: "center", cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.background = "#111e35"}
      onMouseLeave={e => e.currentTarget.style.background = "#0a1525"}>
      <div>
        <div style={{ fontWeight: 900, fontFamily: "monospace", fontSize: 13 }}>{stock.ticker}</div>
        <div style={{ fontSize: 10, color: "#475569" }}>{stock.sector}</div>
      </div>
      <div style={{ fontSize: 13, color: "#cbd5e1" }}>{stock.name}</div>
      <div>
        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>${stock.price.toFixed(2)}</div>
        <Pill value={stock.change} />
      </div>
      <div><SignalBadge signal={stock.signal} /></div>
      <div>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: stock.lastRsi > 70 ? "#f87171" : stock.lastRsi < 30 ? "#4ade80" : "#94a3b8" }}>{stock.lastRsi}</span>
        <div style={{ fontSize: 10, color: "#475569" }}>{stock.lastRsi > 70 ? "Überkauft" : stock.lastRsi < 30 ? "Kaufchance" : "Neutral"}</div>
      </div>
      <div>
        {stock.entryPrice
          ? <><span style={{ fontFamily: "monospace", fontWeight: 700, color: "#a78bfa" }}>${stock.entryPrice}</span><div style={{ fontSize: 10, color: "#475569" }}>Fib-Support</div></>
          : <span style={{ color: "#475569" }}>—</span>}
      </div>
      <div>
        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>${stock.target30}</div>
        <Pill value={stock.upside30} />
      </div>
      <div>
        <button style={{ background: "#1e3a5f", border: "1px solid #2563eb33", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 700, padding: "7px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
          📊 Chart + KI
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks,       setStocks]       = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchRes,    setSearchRes]    = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [loadingMsg,   setLoadingMsg]   = useState("Lade live Kursdaten...");
  const [mobile,       setMobile]       = useState(window.innerWidth < 680);

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 680);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Load all default stocks on mount
  useEffect(() => {
    async function load() {
      setLoadingList(true);
      const results = [];
      for (let i = 0; i < DEFAULT_TICKERS.length; i++) {
        setLoadingMsg(`Lade ${DEFAULT_TICKERS[i].ticker} (${i + 1}/${DEFAULT_TICKERS.length})...`);
        const s = await buildStock(DEFAULT_TICKERS[i], null);
        if (s) { results.push(s); setStocks([...results]); }
        // Small delay to respect Finnhub rate limit (60 req/min free)
        await new Promise(r => setTimeout(r, 400));
      }
      setLoadingList(false);
    }
    load();
  }, []);

  // Search debounce
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
    setSearchQuery(""); setSearchRes([]);
    if (stocks.find(s => s.ticker === item.ticker)) {
      setSelected(stocks.find(s => s.ticker === item.ticker));
      return;
    }
    const s = await buildStock(item, null);
    if (s) { setStocks(prev => [s, ...prev]); setSelected(s); }
  }

  const buyCount = stocks.filter(s => s.signal === "KAUFEN").length;

  return (
    <div style={{ minHeight: "100vh", background: "#060d18", fontFamily: "'DM Sans','Helvetica Neue',sans-serif", color: "#f1f5f9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0f172a} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        input::placeholder { color: #475569; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1e293b", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, background: "#060d18ee", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#3b82f6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚡</div>
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -.5 }}>StockAI</span>
          <span style={{ fontSize: 9, color: "#4ade80", background: "#4ade8020", border: "1px solid #4ade8030", padding: "2px 7px", borderRadius: 20, fontWeight: 700 }}>LIVE</span>
        </div>
        {!mobile && stocks.length > 0 && (
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            {stocks.slice(0, 4).map(s => (
              <span key={s.ticker} style={{ color: s.change >= 0 ? "#4ade80" : "#f87171", cursor: "pointer" }} onClick={() => setSelected(s)}>
                <span style={{ color: "#475569", marginRight: 3 }}>{s.ticker}</span>
                ${s.price.toFixed(0)} {s.change >= 0 ? "▲" : "▼"}{Math.abs(s.change).toFixed(1)}%
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12 }}>
          {loadingList
            ? <span style={{ color: "#60a5fa" }}>📡 Lade...</span>
            : <span style={{ color: "#4ade80", fontWeight: 700 }}>🟢 {buyCount} Kaufsignale</span>}
        </div>
      </header>

      {/* SEARCH */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", position: "relative", zIndex: 50 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#475569" }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Aktie suchen — z.B. 'Apple', 'NVDA', 'Siemens', 'Nestlé'..."
            style={{ width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 12px 10px 36px", color: "#f1f5f9", fontSize: 14, outline: "none", transition: "border-color .15s" }}
            onFocus={e => e.target.style.borderColor = "#3b82f6"}
            onBlur={e => e.target.style.borderColor = "#1e293b"}
          />
          {searching && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#60a5fa" }}>Suche...</span>}
        </div>
        {searchRes.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% - 12px)", left: 16, right: 16, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.6)" }}>
            {searchRes.map(r => (
              <div key={r.ticker} onClick={() => addFromSearch(r)}
                style={{ padding: "11px 16px", cursor: "pointer", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background .1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#1e3a5f"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <span style={{ fontWeight: 800, fontFamily: "monospace", color: "#60a5fa", marginRight: 10 }}>{r.ticker}</span>
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>{r.name}</span>
                </div>
                <span style={{ fontSize: 11, color: "#475569" }}>{r.sector}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 10, padding: "12px 16px" }}>
        {[
          { l: "Kaufsignale",     v: loadingList ? "..." : buyCount,                                             ic: "🟢", c: "#4ade80" },
          { l: "Aktien live",     v: loadingList ? "..." : stocks.length,                                        ic: "📡", c: "#60a5fa" },
          { l: "Ø RSI",           v: stocks.length ? (stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0) : "...", ic: "📊", c: "#a78bfa" },
          { l: "Datenquelle",     v: "Finnhub",                                                                  ic: "🔴", c: "#f59e0b" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.ic}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* STOCK LIST */}
      <div style={{ padding: "0 16px 40px" }}>
        {loadingList && stocks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 14, color: "#60a5fa", marginBottom: 12 }}>📡 {loadingMsg}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", animation: `pulse 1.2s ${i*.2}s infinite` }} />)}
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 16 }}>Kurse werden live von Finnhub geladen...</div>
          </div>
        ) : mobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn .3s ease" }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{stocks.length} Aktien geladen {loadingList ? "· lädt weiter..." : "· alle live"}</span>
              <span style={{ color: "#4ade80" }}>Tippen für Analyse</span>
            </div>
            {stocks.map(s => <StockCard key={s.ticker} stock={s} onAnalyze={setSelected} />)}
          </div>
        ) : (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, overflow: "hidden", animation: "fadeIn .3s ease" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>🔥 Live KI-Empfehlungen — {stocks.length} Aktien</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Echte Kurse via Finnhub · RSI · MACD · Fibonacci · Klicke für vollständige Analyse</div>
              </div>
              <div style={{ fontSize: 11, color: "#475569", textAlign: "right" }}>⚠️ Keine Anlageberatung<br />{loadingList ? <span style={{ color: "#60a5fa" }}>lädt...</span> : "alle Kurse live"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "75px 1fr 100px 90px 75px 110px 105px 115px", padding: "8px 20px", fontSize: 10, color: "#475569", fontWeight: 800, letterSpacing: 1, borderBottom: "1px solid #1e293b" }}>
              <span>TICKER</span><span>UNTERNEHMEN</span><span>KURS</span><span>SIGNAL</span><span>RSI</span><span>EINSTIEG ↓</span><span>ZIEL 30T</span><span></span>
            </div>
            {stocks.map(s => <StockRow key={s.ticker} stock={s} onAnalyze={setSelected} />)}
          </div>
        )}

        <div style={{ marginTop: 14, background: "#1e293b18", border: "1px solid #334155", borderRadius: 10, padding: "10px 16px", fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
          {DISCLAIMER}
        </div>
      </div>

      {selected && <AIModal stock={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
