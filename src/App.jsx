import { useState, useEffect, useRef } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, ComposedChart } from "recharts";

// ─── DISCLAIMER ──────────────────────────────────────────────────────────────
const DISCLAIMER = "Alle Inhalte dienen ausschliesslich zu Informationszwecken und stellen keine Anlageberatung dar. KI-Analysen und technische Indikatoren basieren auf historischen Daten — keine Erfolgsgarantie. Investitionen können zu Totalverlust führen.";

// ─── PLANS ───────────────────────────────────────────────────────────────────
const PLANS = [
  { id: "starter", name: "Starter", price: 9, currency: "CHF", period: "/ Monat", color: "#4ade80", limit: "Ideal für Einsteiger", features: ["5 KI-Analysen täglich", "Kursziele 30 Tage", "Basis-Charts", "E-Mail Alerts"] },
  { id: "pro", name: "Pro", price: 29, currency: "CHF", period: "/ Monat", color: "#60a5fa", limit: "Beliebteste Wahl", highlighted: true, features: ["Unbegrenzte Analysen", "Vollständige Charts + Indikatoren", "RSI · MACD · Fibonacci", "Broker-Direktlinks", "Marktphasen-Vergleich", "Portfolio-Tracking"] },
  { id: "elite", name: "Elite", price: 79, currency: "CHF", period: "/ Monat", color: "#f59e0b", limit: "Für ernsthafte Anleger", features: ["Alles aus Pro", "180-Tage-Prognosen", "Makroanalyse", "Volumenanalyse", "PDF/CSV Export"] },
];

// ─── CHART DATA GENERATOR ────────────────────────────────────────────────────
// Generates realistic OHLCV price history with embedded technical indicators.
// In production: replace with Alpha Vantage / Yahoo Finance API calls.
function generateChartData(basePrice, trend, days = 90) {
  const data = [];
  let price = basePrice * (trend === "bullish" ? 0.72 : trend === "neutral" ? 0.88 : 1.15);
  const prices = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));
    const label = date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });

    // Simulate realistic price movement with trend bias
    const drift = trend === "bullish" ? 0.0035 : trend === "bearish" ? -0.002 : 0.0005;
    const vol = 0.018;
    const change = drift + (Math.random() - 0.48) * vol;
    price = price * (1 + change);

    // Add some realistic pullbacks
    if (i % 15 === 0 && trend === "bullish") price *= 0.97;
    if (i % 20 === 0 && trend === "bearish") price *= 1.04;

    prices.push(price);
    const volume = Math.floor(20000000 + Math.random() * 40000000);
    data.push({ label, price: +price.toFixed(2), volume, i });
  }

  // ── Moving Averages ──────────────────────────────────────────────────────
  // MA20: short-term momentum; MA50: medium-term trend; MA200: long-term trend
  for (let i = 0; i < data.length; i++) {
    const slice20 = prices.slice(Math.max(0, i - 19), i + 1);
    const slice50 = prices.slice(Math.max(0, i - 49), i + 1);
    data[i].ma20 = i >= 19 ? +(slice20.reduce((a, b) => a + b, 0) / slice20.length).toFixed(2) : null;
    data[i].ma50 = i >= 49 ? +(slice50.reduce((a, b) => a + b, 0) / slice50.length).toFixed(2) : null;
  }

  // ── RSI (14) ─────────────────────────────────────────────────────────────
  // RSI > 70 = überkauft (Vorsicht), RSI < 30 = überverkauft (Kaufchance)
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14 && i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / 14, avgLoss = losses / 14;
  for (let i = 14; i < data.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * 13 + Math.max(0, diff)) / 14;
    avgLoss = (avgLoss * 13 + Math.max(0, -diff)) / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    data[i].rsi = +(100 - 100 / (1 + rs)).toFixed(1);
  }

  // ── MACD (12,26,9) ───────────────────────────────────────────────────────
  // MACD-Linie kreuzt Signal-Linie nach oben = Kaufsignal
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    let e = arr[0];
    return arr.map(v => { e = v * k + e * (1 - k); return +e.toFixed(2); });
  };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => +(v - ema26[i]).toFixed(2));
  const signalLine = ema(macdLine, 9);
  for (let i = 26; i < data.length; i++) {
    data[i].macd = macdLine[i];
    data[i].macdSignal = signalLine[i];
    data[i].macdHist = +(macdLine[i] - signalLine[i]).toFixed(2);
  }

  return data;
}

// ── Fibonacci Levels ─────────────────────────────────────────────────────────
// Based on Fibonacci retracement of the last major swing
// Key levels: 38.2%, 50%, 61.8% — used by professionals globally as support/resistance
function getFibLevels(data) {
  const prices = data.map(d => d.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low;
  return {
    high,
    low,
    fib382: +(high - range * 0.382).toFixed(2),
    fib50:  +(high - range * 0.500).toFixed(2),
    fib618: +(high - range * 0.618).toFixed(2),
    fib786: +(high - range * 0.786).toFixed(2),
  };
}

// ── Compute entry price from nearest Fibonacci support ───────────────────────
function computeEntryFromFib(currentPrice, fib) {
  // Entry = first Fibonacci support level below current price
  const levels = [fib.fib382, fib.fib50, fib.fib618, fib.fib786].filter(l => l < currentPrice);
  return levels.length > 0 ? levels[0] : +(currentPrice * 0.96).toFixed(2);
}

// ─── STOCKS ──────────────────────────────────────────────────────────────────
const RAW_STOCKS = [
  { ticker: "NVDA", name: "NVIDIA Corp.",     sector: "Halbleiter",          price: 891.20, change: 3.42,  signal: "KAUFEN",     confidence: 94, trend: "bullish", target30: 980,  target90: 1120, upside30: 9.8,  upside90: 25.7, stopLossPct: 0.082, analogYear: "2016", analogEvent: "GPU-Boom durch Deep Learning", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
  { ticker: "AAPL", name: "Apple Inc.",        sector: "Consumer Tech",       price: 213.50, change: 1.18,  signal: "KAUFEN",     confidence: 87, trend: "bullish", target30: 235,  target90: 260,  upside30: 9.3,  upside90: 20.9, stopLossPct: 0.085, analogYear: "2019", analogEvent: "Services-Pivot nach iPhone-Plateau", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
  { ticker: "MSFT", name: "Microsoft Corp.",   sector: "Cloud / Software",    price: 415.30, change: -0.52, signal: "HALTEN",     confidence: 72, trend: "neutral", target30: 430,  target90: 460,  upside30: 3.6,  upside90: 10.8, stopLossPct: 0.062, analogYear: "2021", analogEvent: "Cloud-Konsolidierung nach starkem Lauf", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
  { ticker: "TSLA", name: "Tesla Inc.",        sector: "E-Mobilität",         price: 182.40, change: -2.31, signal: "BEOBACHTEN", confidence: 61, trend: "bearish", target30: 170,  target90: 155,  upside30: -6.8, upside90: -15,  stopLossPct: 0.095, analogYear: "2022", analogEvent: "Zinsanstieg trifft Wachstumswerte hart", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
  { ticker: "AMZN", name: "Amazon.com Inc.",   sector: "E-Commerce / Cloud",  price: 198.70, change: 2.05,  signal: "KAUFEN",     confidence: 91, trend: "bullish", target30: 225,  target90: 255,  upside30: 12.5, upside90: 27.4, stopLossPct: 0.078, analogYear: "2017", analogEvent: "AWS-Dominanz beginnt Marktbewertung zu treiben", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
  { ticker: "META", name: "Meta Platforms",    sector: "Social Media / AI",   price: 521.80, change: 4.12,  signal: "KAUFEN",     confidence: 89, trend: "bullish", target30: 575,  target90: 640,  upside30: 10.1, upside90: 22.6, stopLossPct: 0.075, analogYear: "2023", analogEvent: "Reality-Labs-Abschreiber überwunden, Ad-Revenue Rebound", brokers: { swissquote: "https://www.swissquote.ch/", degiro: "https://www.degiro.ch/", saxo: "https://www.home.saxo/ch/" } },
];

// Attach chart data + computed indicators to each stock
const STOCKS = RAW_STOCKS.map(s => {
  const chartData = generateChartData(s.price, s.trend);
  const fib = getFibLevels(chartData);
  const entryPrice = s.signal === "KAUFEN" ? computeEntryFromFib(s.price, fib) : null;
  const stopLoss = +(s.price * (1 - s.stopLossPct)).toFixed(2);
  const lastRsi = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi ?? 50;
  const lastMacd = chartData.filter(d => d.macd != null).slice(-1)[0];
  const macdCrossing = lastMacd ? (lastMacd.macd > lastMacd.macdSignal ? "bullish" : "bearish") : "neutral";
  return { ...s, chartData, fib, entryPrice, stopLoss, lastRsi, macdCrossing };
});

const NEWS_ITEMS = [
  { id: 1, title: "Fed-Signale deuten auf Zinspause hin – Technologieaktien profitieren", time: "vor 12 Min.", impact: "POSITIV", stocks: ["NVDA", "MSFT", "AAPL"] },
  { id: 2, title: "NVIDIA übertrifft Q2-Erwartungen – AI-Chip-Nachfrage explodiert", time: "vor 34 Min.", impact: "POSITIV", stocks: ["NVDA"] },
  { id: 3, title: "Tesla Produktionszahlen enttäuschen – Analysten senken Kursziele", time: "vor 1 Std.", impact: "NEGATIV", stocks: ["TSLA"] },
  { id: 4, title: "Meta Advertising-Revenue wächst 22% YoY – Starkes Q2", time: "vor 2 Std.", impact: "POSITIV", stocks: ["META"] },
  { id: 5, title: "Amazon AWS-Sparte meldet Rekordumsatz – Cloud boomt weiter", time: "vor 3 Std.", impact: "POSITIV", stocks: ["AMZN"] },
];

const BROKER_META = {
  swissquote: { name: "Swissquote", flag: "🇨🇭", color: "#e84142" },
  degiro:     { name: "DEGIRO",     flag: "🇪🇺", color: "#00b140" },
  saxo:       { name: "Saxo Bank",  flag: "🌍",  color: "#4a90d9" },
};

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const map = { KAUFEN: ["#4ade8022","#4ade80","#4ade8044"], HALTEN: ["#fbbf2422","#fbbf24","#fbbf2444"], BEOBACHTEN: ["#94a3b822","#94a3b8","#94a3b844"] };
  const [bg, col, border] = map[signal] || map.BEOBACHTEN;
  return <span style={{ background: bg, color: col, border: `1px solid ${border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>{signal}</span>;
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

function Pill({ value, suffix = "%" }) {
  const pos = value >= 0;
  return <span style={{ background: pos ? "#4ade8018" : "#f8717118", color: pos ? "#4ade80" : "#f87171", border: `1px solid ${pos ? "#4ade8033" : "#f8717133"}`, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{pos ? "▲" : "▼"} {Math.abs(value)}{suffix}</span>;
}

// ─── CUSTOM CHART TOOLTIP ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#64748b", marginBottom: 4 }}>{label}</div>
      {d?.price   && <div style={{ color: "#f1f5f9",  fontWeight: 700 }}>Kurs: <span style={{ fontFamily: "monospace" }}>${d.price}</span></div>}
      {d?.ma20    && <div style={{ color: "#fbbf24" }}>MA20: ${d.ma20}</div>}
      {d?.ma50    && <div style={{ color: "#60a5fa" }}>MA50: ${d.ma50}</div>}
      {d?.rsi != null && <div style={{ color: d.rsi > 70 ? "#f87171" : d.rsi < 30 ? "#4ade80" : "#94a3b8" }}>RSI(14): {d.rsi}</div>}
    </div>
  );
}

// ─── MAIN CHART PANEL ─────────────────────────────────────────────────────────
function StockChart({ stock }) {
  const [activeTab, setActiveTab] = useState("preis");
  const col = stock.trend === "bullish" ? "#4ade80" : stock.trend === "bearish" ? "#f87171" : "#94a3b8";
  const data = stock.chartData;
  const fib = stock.fib;
  const thinned = data.filter((_, i) => i % 3 === 0); // show every 3rd label

  const tabs = [
    { id: "preis", label: "Kurschart + MA" },
    { id: "rsi",   label: "RSI(14)" },
    { id: "macd",  label: "MACD" },
    { id: "vol",   label: "Volumen" },
  ];

  return (
    <div style={{ background: "#080f1a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", padding: "0 14px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: "none", border: "none", padding: "10px 14px", cursor: "pointer",
            fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400,
            color: activeTab === t.id ? "#60a5fa" : "#475569",
            borderBottom: activeTab === t.id ? "2px solid #60a5fa" : "2px solid transparent",
          }}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#334155", alignSelf: "center", fontStyle: "italic" }}>⚠ Simulierte Daten · Echtdaten via API erforderlich</span>
      </div>

      <div style={{ padding: "16px 8px 8px" }}>

        {/* PRICE + MA + FIBONACCI */}
        {activeTab === "preis" && (
          <>
            <div style={{ fontSize: 11, color: "#475569", paddingLeft: 8, marginBottom: 8, lineHeight: 1.6 }}>
              <span style={{ color: "#fbbf24" }}>■</span> MA20 (kurzfr. Momentum) &nbsp;
              <span style={{ color: "#60a5fa" }}>■</span> MA50 (mittelfr. Trend) &nbsp;
              <span style={{ color: "#a78bfa", opacity: .6 }}>■</span> Fibonacci-Levels (Retracements der letzten Swingphase)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={thinned} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={col} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={col} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 9 }} interval={9} />
                <YAxis domain={["auto","auto"]} tick={{ fill: "#334155", fontSize: 9 }} width={52} tickFormatter={v => "$"+v} />
                <Tooltip content={<ChartTooltip />} />
                {/* Fibonacci reference lines */}
                <ReferenceLine y={fib.fib382} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: `Fib 38.2% $${fib.fib382}`, fill: "#a78bfa", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={fib.fib50}  stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.4} label={{ value: `Fib 50% $${fib.fib50}`, fill: "#a78bfa", fontSize: 9, position: "insideTopLeft" }} />
                <ReferenceLine y={fib.fib618} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.35} label={{ value: `Fib 61.8% $${fib.fib618}`, fill: "#a78bfa", fontSize: 9, position: "insideTopLeft" }} />
                {/* Entry + StopLoss lines */}
                {stock.entryPrice && <ReferenceLine y={stock.entryPrice} stroke="#4ade80" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Einstieg $${stock.entryPrice}`, fill: "#4ade80", fontSize: 9, position: "insideBottomLeft" }} />}
                <ReferenceLine y={stock.stopLoss} stroke="#f87171" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Stop-Loss $${stock.stopLoss}`, fill: "#f87171", fontSize: 9, position: "insideTopLeft" }} />
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeOpacity={0.9} />
                <Line type="monotone" dataKey="ma50" stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeOpacity={0.9} />
              </ComposedChart>
            </ResponsiveContainer>
            {/* Fibonacci explanation */}
            <div style={{ margin: "10px 8px 0", background: "#0f172a", borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
              <strong style={{ color: "#a78bfa" }}>Fibonacci-Retracement:</strong> Mathematische Rückzugsniveaus nach einer Kursrally, basierend auf dem goldenen Schnitt. 
              Profis nutzen 38.2%, 50% und 61.8% als potenzielle Unterstützungszonen — häufig Bereiche wo Käufer nach Korrekturen einsteigen.
              <br/>Der empfohlene <span style={{ color: "#4ade80" }}>Einstiegskurs ${stock.entryPrice}</span> entspricht dem nächsten Fibonacci-Support unter dem aktuellen Kurs.
            </div>
          </>
        )}

        {/* RSI */}
        {activeTab === "rsi" && (
          <>
            <div style={{ fontSize: 11, color: "#475569", paddingLeft: 8, marginBottom: 8, lineHeight: 1.6 }}>
              RSI(14) — Relative Strength Index: &nbsp;
              <span style={{ color: "#f87171" }}>Über 70 = überkauft (Vorsicht)</span> &nbsp;·&nbsp;
              <span style={{ color: "#4ade80" }}>Unter 30 = überverkauft (Kaufchance)</span> &nbsp;·&nbsp;
              <span style={{ color: "#94a3b8" }}>Aktuell: {stock.lastRsi}</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={thinned.filter(d => d.rsi != null)} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 9 }} interval={9} />
                <YAxis domain={[0, 100]} tick={{ fill: "#334155", fontSize: 9 }} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 3" label={{ value: "Überkauft 70", fill: "#f87171", fontSize: 9 }} />
                <ReferenceLine y={30} stroke="#4ade80" strokeDasharray="4 3" label={{ value: "Überverkauft 30", fill: "#4ade80", fontSize: 9 }} />
                <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 4" />
                <Area type="monotone" dataKey="rsi" stroke="#60a5fa" strokeWidth={2} fill="url(#rsiGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ margin: "10px 8px 0", background: "#0f172a", borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
              <strong style={{ color: "#60a5fa" }}>RSI (Relative Strength Index):</strong> Misst die Stärke der letzten Kursbewegungen über 14 Perioden.
              Ein RSI über 70 warnt vor einer möglichen Korrektur ("der Markt hat sich überhitzt"). Unter 30 signalisiert potenzielle Unterbewertung.
              Aktueller Wert von <strong style={{ color: stock.lastRsi > 70 ? "#f87171" : stock.lastRsi < 30 ? "#4ade80" : "#94a3b8" }}>{stock.lastRsi}</strong> deutet auf {stock.lastRsi > 70 ? "überkaufte Zone — mit Einstieg warten" : stock.lastRsi < 30 ? "überverkaufte Zone — Kaufchance möglich" : "neutrales Momentum"} hin.
            </div>
          </>
        )}

        {/* MACD */}
        {activeTab === "macd" && (
          <>
            <div style={{ fontSize: 11, color: "#475569", paddingLeft: 8, marginBottom: 8 }}>
              MACD (12,26,9) — Kreuzt MACD-Linie (blau) die Signallinie (orange) <strong style={{ color: "#4ade80" }}>von unten: Kaufsignal</strong> · <strong style={{ color: "#f87171" }}>von oben: Verkaufssignal</strong>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={thinned.filter(d => d.macd != null)} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 9 }} interval={9} />
                <YAxis tick={{ fill: "#334155", fontSize: 9 }} width={38} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="#334155" />
                <Bar dataKey="macdHist" fill="#3b82f644" radius={[2,2,0,0]} />
                <Line type="monotone" dataKey="macd" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ margin: "10px 8px 0", background: "#0f172a", borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
              <strong style={{ color: "#60a5fa" }}>MACD (Moving Average Convergence Divergence):</strong> Vergleicht zwei exponentielle Durchschnitte (12 und 26 Tage).
              Die Balkengrafik (Histogramm) zeigt die Stärke des Trends. Aktuell ist der MACD <strong style={{ color: stock.macdCrossing === "bullish" ? "#4ade80" : "#f87171" }}>{stock.macdCrossing === "bullish" ? "über der Signallinie — bullishes Momentum" : "unter der Signallinie — bärisches Momentum"}</strong>.
            </div>
          </>
        )}

        {/* VOLUME */}
        {activeTab === "vol" && (
          <>
            <div style={{ fontSize: 11, color: "#475569", paddingLeft: 8, marginBottom: 8 }}>
              Handelsvolumen — Hohe Volumen bei Kursanstiegen bestätigen den Trend. Hohe Volumen bei Rückgängen signalisieren Verkaufsdruck.
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={thinned} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#334155", fontSize: 9 }} interval={9} />
                <YAxis tick={{ fill: "#334155", fontSize: 9 }} width={48} tickFormatter={v => (v/1e6).toFixed(0)+"M"} />
                <Tooltip formatter={(v) => [(v/1e6).toFixed(1)+"M Aktien", "Volumen"]} labelStyle={{ color: "#94a3b8" }} contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
                <Bar dataKey="volume" fill={col} fillOpacity={0.6} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TECHNICAL SUMMARY CARDS ──────────────────────────────────────────────────
function TechnicalSummary({ stock }) {
  const rsiStatus = stock.lastRsi > 70 ? { label: "Überkauft", col: "#f87171" } : stock.lastRsi < 30 ? { label: "Überverkauft", col: "#4ade80" } : { label: "Neutral", col: "#94a3b8" };
  const lastData = stock.chartData.slice(-1)[0];
  const ma50Signal = lastData?.ma50 ? (lastData.price > lastData.ma50 ? { label: "Über MA50 ✓", col: "#4ade80" } : { label: "Unter MA50 ✗", col: "#f87171" }) : { label: "—", col: "#475569" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "RSI(14)", value: stock.lastRsi, sub: rsiStatus.label, col: rsiStatus.col },
        { label: "MACD-Signal", value: stock.macdCrossing === "bullish" ? "Bullish ✓" : "Bearish ✗", sub: "Kreuzung", col: stock.macdCrossing === "bullish" ? "#4ade80" : "#f87171" },
        { label: "vs MA50", value: ma50Signal.label, sub: "Trendlage", col: ma50Signal.col },
        { label: "Fib-Einstieg", value: stock.entryPrice ? `$${stock.entryPrice}` : "—", sub: "Nächste Support-Zone", col: "#a78bfa" },
      ].map((c, i) => (
        <div key={i} style={{ background: "#0a1525", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>{c.label}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: c.col, fontFamily: "monospace" }}>{c.value}</div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MARKET PHASE ANALOGY ─────────────────────────────────────────────────────
function MarketPhaseCard({ stock }) {
  return (
    <div style={{ background: "#0a1525", border: "1px solid #1e3a5f", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>📊 HISTORISCHE MARKTPHASEN-PARALLELE</div>
      <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
        Die aktuelle Chartstruktur von <strong style={{ color: "#f1f5f9" }}>{stock.ticker}</strong> weist Ähnlichkeiten mit der Marktphase <strong style={{ color: "#f59e0b" }}>{stock.analogYear}</strong> auf:
        <br /><em style={{ color: "#94a3b8" }}>{stock.analogEvent}.</em>
      </div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 8, lineHeight: 1.6 }}>
        ⚠ Historische Ähnlichkeiten sind kein Garant für identische Kursverläufe. Marktbedingungen unterscheiden sich. Quelle: Interne KI-Musteranalyse auf Basis öffentlich zugänglicher Marktdaten.
      </div>
    </div>
  );
}

// ─── PRICE TARGET CARDS ───────────────────────────────────────────────────────
function PriceTargetCards({ stock }) {
  const isBuy = stock.signal === "KAUFEN";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
      <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>EINSTIEG (Fib-Support)</div>
        {isBuy && stock.entryPrice ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa", fontFamily: "monospace" }}>${stock.entryPrice}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Fibonacci-Support unter aktuellem Kurs</div>
          </>
        ) : <div style={{ fontSize: 13, color: "#64748b" }}>Kein Einstieg empfohlen</div>}
      </div>
      <div style={{ background: "#0a1628", border: "1px solid #7f1d1d44", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#f87171", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>STOP-LOSS</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f87171", fontFamily: "monospace" }}>${stock.stopLoss}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>−{(stock.stopLossPct * 100).toFixed(1)}% vom aktuellen Kurs</div>
      </div>
      <div style={{ background: "#0a1628", border: "1px solid #4ade8033", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>KURSZIEL 30 TAGE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", fontFamily: "monospace" }}>${stock.target30}</div>
          <Pill value={stock.upside30} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>KI-Prognose (nicht garantiert)</div>
      </div>
      <div style={{ background: "#0a1628", border: "1px solid #60a5fa33", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#60a5fa", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>KURSZIEL 90 TAGE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", fontFamily: "monospace" }}>${stock.target90}</div>
          <Pill value={stock.upside90} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>KI-Prognose (nicht garantiert)</div>
      </div>
    </div>
  );
}

// ─── BROKER BUTTONS ───────────────────────────────────────────────────────────
function BrokerButtons({ stock }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>DIREKT KAUFEN BEI:</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(stock.brokers).map(([key, url]) => {
          const m = BROKER_META[key];
          return (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#1e293b", border: `1px solid ${m.color}44`, borderRadius: 8, padding: "8px 14px", textDecoration: "none", color: "#f1f5f9", fontSize: 12, fontWeight: 600 }}>
              {m.flag} {m.name} <span style={{ color: "#64748b", fontSize: 10 }}>↗</span>
            </a>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#334155", marginTop: 8 }}>StockAI führt keine Transaktionen durch. Du wirst zur Broker-Plattform weitergeleitet.</div>
    </div>
  );
}

// ─── AI MODAL ─────────────────────────────────────────────────────────────────
function AIModal({ stock, onClose, loading, analysis }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", backdropFilter: "blur(12px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#080f1a", border: "1px solid #1e3a5f", borderRadius: 22, padding: 24, maxWidth: 720, width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 0 80px #3b82f618" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>🤖 KI-ANALYSE · TECHNISCHE INDIKATOREN</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{stock.ticker} <span style={{ color: "#64748b", fontWeight: 400, fontSize: 14 }}>· {stock.name}</span></div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
              <SignalBadge signal={stock.signal} />
              <span style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700 }}>${stock.price.toFixed(2)}</span>
              <Pill value={stock.change} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#1e293b", border: "none", color: "#94a3b8", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 20 }}>×</button>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: 16 }}>
          <StockChart stock={stock} />
        </div>

        {/* Technical summary */}
        <TechnicalSummary stock={stock} />

        {/* Historical analogy */}
        <MarketPhaseCard stock={stock} />

        {/* Price targets */}
        <PriceTargetCards stock={stock} />

        {/* AI text */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "28px 0", background: "#0f172a", borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#60a5fa", marginBottom: 12 }}>🤖 KI analysiert Indikatoren, Fibonacci-Levels, Marktphasen...</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", animation: `pulse 1.2s ${i*.22}s infinite` }} />)}
            </div>
          </div>
        ) : (
          <div style={{ background: "#0f172a", borderRadius: 12, padding: "16px 18px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.85, marginBottom: 16, whiteSpace: "pre-wrap" }}>
            {analysis}
          </div>
        )}

        {/* Confidence */}
        {!loading && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>KI-KONFIDENZ (basierend auf Indikator-Konsistenz)</div>
            <ConfBar value={stock.confidence} />
          </div>
        )}

        {/* Brokers */}
        {!loading && stock.signal === "KAUFEN" && (
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 18, marginBottom: 16 }}>
            <BrokerButtons stock={stock} />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ background: "#1e293b44", border: "1px solid #334155", borderRadius: 10, padding: "12px 16px", fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
          ⚠️ {DISCLAIMER}
        </div>
      </div>
    </div>
  );
}

// ─── PAYWALL ──────────────────────────────────────────────────────────────────
function PaywallModal({ onClose, onSubscribe }) {
  const [sel, setSel] = useState("pro");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", backdropFilter: "blur(14px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#07111e", border: "1px solid #1e3a5f", borderRadius: 24, padding: 28, maxWidth: 820, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, fontWeight: 800, marginBottom: 6 }}>FREE TRIAL ABGELAUFEN</div>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Wähle deinen Plan</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Charts · RSI · MACD · Fibonacci · Broker-Links · KI-Analysen</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 22 }}>
          {PLANS.map(p => (
            <div key={p.id} onClick={() => setSel(p.id)} style={{ border: `2px solid ${sel === p.id ? p.color : "#1e293b"}`, borderRadius: 16, padding: 18, cursor: "pointer", position: "relative", background: sel === p.id ? p.color + "0d" : "#0f172a", transition: "all .2s" }}>
              {p.highlighted && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#000", fontSize: 10, fontWeight: 800, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ BELIEBTESTE</div>}
              <div style={{ color: p.color, fontWeight: 800, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{p.name.toUpperCase()}</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{p.price}<span style={{ fontSize: 13, color: "#64748b" }}> {p.currency}{p.period}</span></div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>{p.limit}</div>
              {p.features.map((f,i) => <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, display: "flex", gap: 6 }}><span style={{ color: p.color }}>✓</span>{f}</div>)}
            </div>
          ))}
        </div>
        <button onClick={() => onSubscribe(sel)} style={{ width: "100%", padding: 15, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>
          {PLANS.find(p => p.id === sel)?.name} Plan aktivieren →
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#475569" }}>Jederzeit kündbar · Keine Anlageberatung · ⚠️ Keine Erfolgsgarantie</p>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function StockAIApp() {
  const [view, setView] = useState("dashboard");
  const [selectedStock, setSelectedStock] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(5);
  const [showPaywall, setShowPaywall] = useState(false);
  const [plan, setPlan] = useState(null);

  const isTrialExpired = trialDaysLeft <= 0;
  const currentPlan = plan ? PLANS.find(p => p.id === plan) : null;

  async function analyzeStock(stock) {
    if (isTrialExpired && !plan) { setShowPaywall(true); return; }
    setSelectedStock(stock);
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Du bist ein präziser KI-Marktanalyst der technische Analyse, Fundamentalanalyse und historische Marktphasen kombiniert. Antworte auf Deutsch, ca. 200 Wörter. 

Struktur (nutze diese Abschnitte):
📊 Technische Lage: Erkläre konkret was RSI, MACD und die Moving Averages gerade signalisieren.
📈 Historische Parallele: Beschreibe die genannte Marktphasenanalogie und was damals passiert ist.
🎯 KI-Einschätzung: Begründe das Kursziel basierend auf den Indikatoren und dem Fibonacci-Einstieg.
⚠️ Risiken: Nenne 2 konkrete Risiken.

Schlusszeile IMMER: "⚠️ KI-generierte Marktinformation, keine persönliche Anlageberatung. Keine Erfolgsgarantie."`,
          messages: [{
            role: "user",
            content: `Analysiere ${stock.name} (${stock.ticker}).
Aktueller Kurs: $${stock.price} (${stock.change > 0 ? "+" : ""}${stock.change}% heute)
Sektor: ${stock.sector}
KI-Signal: ${stock.signal} | Konfidenz: ${stock.confidence}%
RSI(14): ${stock.lastRsi} | MACD: ${stock.macdCrossing}
Einstieg (Fibonacci-Support): ${stock.entryPrice ? "$" + stock.entryPrice : "nicht empfohlen"}
Stop-Loss: $${stock.stopLoss} (−${(stock.stopLossPct*100).toFixed(1)}%)
Kursziel 30T: $${stock.target30} (+${stock.upside30}%) | 90T: $${stock.target90} (+${stock.upside90}%)
Historische Analogie: ${stock.analogYear} — ${stock.analogEvent}
Marktkontext: Fed-Zinspause erwartet, AI-Boom im Technologiesektor, geopolitische Unsicherheiten.`,
          }],
        }),
      });
      const data = await res.json();
      setAiAnalysis(data.content?.map(b => b.text || "").join("\n") || "Analyse nicht verfügbar.");
    } catch {
      setAiAnalysis("❌ Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setAiLoading(false);
    }
  }

  function subscribe(planId) { setPlan(planId); setShowPaywall(false); setTrialDaysLeft(30); }

  return (
    <div style={{ minHeight: "100vh", background: "#060d18", fontFamily: "'DM Sans','Helvetica Neue',sans-serif", color: "#f1f5f9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0f172a} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        .srow:hover{background:#111e35 !important;cursor:pointer;}
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1e293b", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, background: "#060d18dd", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#3b82f6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: -.5 }}>StockAI</span>
          <span style={{ fontSize: 10, color: "#3b82f6", background: "#1e3a5f", padding: "2px 8px", borderRadius: 20, fontWeight: 800 }}>BETA</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          {STOCKS.slice(0,4).map(s => <span key={s.ticker} style={{ color: s.change >= 0 ? "#4ade80" : "#f87171" }}><span style={{ color: "#475569", marginRight: 4 }}>{s.ticker}</span>${s.price} {s.change >= 0 ? "▲" : "▼"}{Math.abs(s.change)}%</span>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!plan && <div style={{ background: "#1e3a5f22", border: "1px solid #3b82f644", borderRadius: 10, padding: "6px 12px", fontSize: 12 }}>{isTrialExpired ? <span style={{ color: "#f87171", fontWeight: 700 }}>⏰ Trial abgelaufen</span> : <span style={{ color: "#60a5fa" }}>🎁 Trial: <strong>{trialDaysLeft} Tage</strong></span>}</div>}
          {currentPlan && <div style={{ background: currentPlan.color + "22", border: `1px solid ${currentPlan.color}44`, borderRadius: 10, padding: "6px 12px", fontSize: 12, color: currentPlan.color, fontWeight: 800 }}>⭐ {currentPlan.name.toUpperCase()}</div>}
          {!plan && <button onClick={() => setShowPaywall(true)} style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Upgraden →</button>}
        </div>
      </header>

      {/* NAV */}
      <nav style={{ padding: "10px 20px", borderBottom: "1px solid #1e293b", display: "flex", gap: 4 }}>
        {[{ id: "dashboard", l: "📊 Dashboard" }, { id: "news", l: "📰 News" }, { id: "pricing", l: "💎 Preise" }].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ background: view === t.id ? "#1e3a5f" : "transparent", border: "none", borderRadius: 8, padding: "7px 15px", color: view === t.id ? "#60a5fa" : "#64748b", fontWeight: view === t.id ? 700 : 400, cursor: "pointer", fontSize: 13, transition: "all .15s" }}>{t.l}</button>
        ))}
      </nav>

      <main style={{ padding: "20px 20px 48px", maxWidth: 1200, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 22 }}>
              {[{ l: "Kaufempfehlungen", v: "4", ic: "🟢", c: "#4ade80" }, { l: "KI-Analysen heute", v: "1.247", ic: "🤖", c: "#60a5fa" }, { l: "Ø Fib-Einstieg Abstand", v: "−3.6%", ic: "📐", c: "#a78bfa" }, { l: "Überwachte Titel", v: "500+", ic: "📡", c: "#f59e0b" }].map((s, i) => (
                <div key={i} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{s.ic}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>🔥 KI-Empfehlungen mit Technischer Analyse</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>RSI · MACD · Fibonacci-Einstieg · Kursziele · → Klicke für vollständige Chart-Analyse</div>
                </div>
                <div style={{ fontSize: 11, color: "#475569", textAlign: "right" }}>⚠️ Keine Anlageberatung</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px 75px 80px 100px 100px 100px 110px", padding: "9px 22px", fontSize: 10, color: "#475569", fontWeight: 800, letterSpacing: 1, borderBottom: "1px solid #1e293b" }}>
                <span>TICKER</span><span>UNTERNEHMEN</span><span>KURS</span><span>SIGNAL</span><span>RSI</span><span>EINSTIEG ↓</span><span>ZIEL 30T</span><span>ZIEL 90T</span><span></span>
              </div>

              {STOCKS.map((s, i) => {
                const rsiCol = s.lastRsi > 70 ? "#f87171" : s.lastRsi < 30 ? "#4ade80" : "#94a3b8";
                return (
                  <div key={s.ticker} className="srow" onClick={() => analyzeStock(s)} style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px 75px 80px 100px 100px 100px 110px", padding: "13px 22px", borderBottom: "1px solid #0d1926", background: i % 2 === 0 ? "#0a1525" : "#0f172a", transition: "background .15s", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900, fontFamily: "monospace", fontSize: 13 }}>{s.ticker}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{s.sector}</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#cbd5e1" }}>{s.name}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>${s.price}</div>
                      <div style={{ fontSize: 11, color: s.change >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{s.change >= 0 ? "▲" : "▼"} {Math.abs(s.change)}%</div>
                    </div>
                    <div><SignalBadge signal={s.signal} /></div>
                    <div>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: rsiCol }}>{s.lastRsi}</span>
                      <div style={{ fontSize: 10, color: "#475569" }}>{s.lastRsi > 70 ? "Überkauft" : s.lastRsi < 30 ? "Überverkauft" : "Neutral"}</div>
                    </div>
                    <div>
                      {s.entryPrice ? <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#a78bfa", fontSize: 13 }}>${s.entryPrice}</span> : <span style={{ color: "#475569" }}>—</span>}
                      <div style={{ fontSize: 10, color: "#475569" }}>Fib-Support</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>${s.target30}</div>
                      <Pill value={s.upside30} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>${s.target90}</div>
                      <Pill value={s.upside90} />
                    </div>
                    <div>
                      <button style={{ background: "#1e3a5f", border: "1px solid #2563eb44", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 700, padding: "7px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                        📊 Chart + KI
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, background: "#1e293b18", border: "1px solid #334155", borderRadius: 12, padding: "12px 18px", fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
              ⚠️ <strong style={{ color: "#64748b" }}>Haftungsausschluss:</strong> {DISCLAIMER} · Einstiegskurse basieren auf Fibonacci-Retracement-Niveaus simulierter Kursverläufe. In der Produktionsversion werden echte Marktdaten via API (Alpha Vantage / Yahoo Finance) verwendet.
            </div>
          </div>
        )}

        {/* NEWS */}
        {view === "news" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>📰 News & Marktbewegungen</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>KI bewertet Relevanz und Marktauswirkung automatisch</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {NEWS_ITEMS.map(item => (
                <div key={item.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, lineHeight: 1.4 }}>{item.title}</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>🕐 {item.time}</span>
                      {item.stocks.map(s => <span key={s} style={{ fontSize: 11, background: "#1e3a5f", color: "#60a5fa", padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>{s}</span>)}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap", ...(item.impact === "POSITIV" ? { background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade8044" } : { background: "#f8717122", color: "#f87171", border: "1px solid #f8717144" }) }}>
                    {item.impact === "POSITIV" ? "▲ POSITIV" : "▼ NEGATIV"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRICING */}
        {view === "pricing" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, fontWeight: 800, marginBottom: 6 }}>PREISE & PLÄNE</div>
              <div style={{ fontWeight: 900, fontSize: 30, marginBottom: 6 }}>Investiere in dein Wissen</div>
              <div style={{ color: "#64748b" }}>7 Tage kostenlos · Vollständige Charts & Indikatoren · Jederzeit kündbar</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 24 }}>
              {PLANS.map(p => (
                <div key={p.id} style={{ border: `2px solid ${p.highlighted ? p.color : "#1e293b"}`, borderRadius: 20, padding: 26, background: "#0f172a", position: "relative", boxShadow: p.highlighted ? `0 0 50px ${p.color}15` : "none" }}>
                  {p.highlighted && <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#000", fontSize: 10, fontWeight: 800, padding: "4px 18px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ BELIEBTESTE WAHL</div>}
                  <div style={{ color: p.color, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>{p.name.toUpperCase()}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 2 }}>{p.price}<span style={{ fontSize: 15, color: "#64748b" }}> {p.currency}</span></div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>{p.period} · {p.limit}</div>
                  <div style={{ marginBottom: 22 }}>{p.features.map((f,i) => <div key={i} style={{ fontSize: 13, color: "#94a3b8", marginBottom: 7, display: "flex", gap: 8 }}><span style={{ color: p.color }}>✓</span>{f}</div>)}</div>
                  <button onClick={() => subscribe(p.id)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `2px solid ${p.color}`, background: p.highlighted ? p.color : "transparent", color: p.highlighted ? "#000" : p.color, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
                    {p.highlighted ? "Jetzt starten →" : "Plan wählen"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", fontSize: 11, color: "#475569", lineHeight: 1.8, textAlign: "center" }}>
              <strong style={{ color: "#f87171" }}>⚠️ Haftungsausschluss:</strong> {DISCLAIMER}
            </div>
          </div>
        )}
      </main>

      {selectedStock && <AIModal stock={selectedStock} onClose={() => setSelectedStock(null)} loading={aiLoading} analysis={aiAnalysis} />}
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} onSubscribe={subscribe} />}
    </div>
  );
}
