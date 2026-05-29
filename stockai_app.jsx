import { useState, useEffect } from "react";

// ─── PLANS ───────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "starter", name: "Starter", price: 9, currency: "CHF", period: "/ Monat",
    color: "#4ade80", limit: "Ideal für Einsteiger",
    features: ["5 KI-Analysen täglich", "Top 50 Aktien", "Kursziele 30 Tage", "Basis-Marktberichte", "E-Mail Alerts"],
  },
  {
    id: "pro", name: "Pro", price: 29, currency: "CHF", period: "/ Monat",
    color: "#60a5fa", limit: "Beliebteste Wahl", highlighted: true,
    features: ["Unbegrenzte KI-Analysen", "Top 500 Aktien & ETFs", "Kursziele 30 + 90 Tage", "Stop-Loss-Empfehlungen", "Broker-Direktlinks", "Portfolio-Tracking", "Push + SMS Alerts"],
  },
  {
    id: "elite", name: "Elite", price: 79, currency: "CHF", period: "/ Monat",
    color: "#f59e0b", limit: "Für ernsthafte Anleger",
    features: ["Alles aus Pro", "Globale Märkte & Krypto", "KI-Prognosen bis 180 Tage", "Makroanalyse", "Prioritäts-Support", "PDF/CSV Export", "Early-Access Features"],
  },
];

// ─── STOCKS (with price targets, stop-loss, forecasts) ───────────────────────
const STOCKS = [
  {
    ticker: "NVDA", name: "NVIDIA Corp.", sector: "Halbleiter", price: 891.20,
    change: 3.42, signal: "KAUFEN", confidence: 94, trend: "bullish",
    entryPrice: 895.00, target30: 980.00, target90: 1120.00, stopLoss: 820.00,
    upside30: 9.8, upside90: 25.7,
    brokers: {
      swissquote: "https://www.swissquote.ch/trading/equities/NVDA",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/rates-and-conditions/stocks/commissions",
    }
  },
  {
    ticker: "AAPL", name: "Apple Inc.", sector: "Consumer Tech", price: 213.50,
    change: 1.18, signal: "KAUFEN", confidence: 87, trend: "bullish",
    entryPrice: 215.00, target30: 235.00, target90: 260.00, stopLoss: 195.00,
    upside30: 9.3, upside90: 20.9,
    brokers: {
      swissquote: "https://www.swissquote.ch/",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/",
    }
  },
  {
    ticker: "MSFT", name: "Microsoft Corp.", sector: "Cloud / Software", price: 415.30,
    change: -0.52, signal: "HALTEN", confidence: 72, trend: "neutral",
    entryPrice: 415.00, target30: 430.00, target90: 460.00, stopLoss: 390.00,
    upside30: 3.6, upside90: 10.8,
    brokers: {
      swissquote: "https://www.swissquote.ch/",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/",
    }
  },
  {
    ticker: "TSLA", name: "Tesla Inc.", sector: "E-Mobilität", price: 182.40,
    change: -2.31, signal: "BEOBACHTEN", confidence: 61, trend: "bearish",
    entryPrice: null, target30: 175.00, target90: 160.00, stopLoss: 165.00,
    upside30: -4.1, upside90: -12.3,
    brokers: {
      swissquote: "https://www.swissquote.ch/",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/",
    }
  },
  {
    ticker: "AMZN", name: "Amazon.com Inc.", sector: "E-Commerce / Cloud", price: 198.70,
    change: 2.05, signal: "KAUFEN", confidence: 91, trend: "bullish",
    entryPrice: 200.00, target30: 225.00, target90: 255.00, stopLoss: 182.00,
    upside30: 12.5, upside90: 27.4,
    brokers: {
      swissquote: "https://www.swissquote.ch/",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/",
    }
  },
  {
    ticker: "META", name: "Meta Platforms", sector: "Social Media / AI", price: 521.80,
    change: 4.12, signal: "KAUFEN", confidence: 89, trend: "bullish",
    entryPrice: 524.00, target30: 575.00, target90: 640.00, stopLoss: 480.00,
    upside30: 10.1, upside90: 22.6,
    brokers: {
      swissquote: "https://www.swissquote.ch/",
      degiro: "https://www.degiro.ch/",
      saxo: "https://www.home.saxo/ch/",
    }
  },
];

const NEWS_ITEMS = [
  { id: 1, title: "Fed-Signale deuten auf Zinspause hin – Technologieaktien profitieren", time: "vor 12 Min.", impact: "POSITIV", stocks: ["NVDA", "MSFT", "AAPL"] },
  { id: 2, title: "NVIDIA übertrifft Q2-Erwartungen – AI-Chip-Nachfrage explodiert", time: "vor 34 Min.", impact: "POSITIV", stocks: ["NVDA"] },
  { id: 3, title: "Tesla Produktionszahlen enttäuschen – Analysten senken Kursziele", time: "vor 1 Std.", impact: "NEGATIV", stocks: ["TSLA"] },
  { id: 4, title: "Meta Advertising-Revenue wächst 22% YoY – Starkes Q2", time: "vor 2 Std.", impact: "POSITIV", stocks: ["META"] },
  { id: 5, title: "Amazon AWS-Sparte meldet Rekordumsatz – Cloud boomt weiter", time: "vor 3 Std.", impact: "POSITIV", stocks: ["AMZN"] },
];

const DISCLAIMER = "Alle Inhalte dieser Plattform dienen ausschliesslich zu Informationszwecken und stellen keine Anlageberatung dar. KI-Analysen, Kursziele und Prognosen basieren auf historischen Daten und Marktindikatoren — es besteht keine Erfolgsgarantie. Investitionen sind mit Risiken verbunden. Sie können Ihr eingesetztes Kapital teilweise oder vollständig verlieren. Bitte konsultieren Sie einen zugelassenen Finanzberater.";

const BROKER_META = {
  swissquote: { name: "Swissquote", flag: "🇨🇭", color: "#e84142" },
  degiro:     { name: "DEGIRO",     flag: "🇪🇺", color: "#00b140" },
  saxo:       { name: "Saxo Bank",  flag: "🌍",  color: "#1a3c6e" },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function Sparkline({ trend }) {
  const up = trend === "bullish", neu = trend === "neutral";
  const pts = up ? "0,30 10,25 20,20 30,22 40,15 50,10 60,12 70,5"
    : neu ? "0,20 10,18 20,22 30,19 40,21 50,18 60,20 70,19"
    : "0,5 10,10 20,8 30,15 40,18 50,20 60,25 70,30";
  const col = up ? "#4ade80" : neu ? "#94a3b8" : "#f87171";
  return (
    <svg width="70" height="35" viewBox="0 0 70 35">
      <defs><linearGradient id={`g${trend}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={col} stopOpacity=".3"/>
        <stop offset="100%" stopColor={col} stopOpacity="0"/>
      </linearGradient></defs>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function SignalBadge({ signal }) {
  const map = { KAUFEN: { bg: "#4ade8022", col: "#4ade80", border: "#4ade8044" }, HALTEN: { bg: "#fbbf2422", col: "#fbbf24", border: "#fbbf2444" }, BEOBACHTEN: { bg: "#94a3b822", col: "#94a3b8", border: "#94a3b844" } };
  const m = map[signal] || map.BEOBACHTEN;
  return <span style={{ background: m.bg, color: m.col, border: `1px solid ${m.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>{signal}</span>;
}

function ConfidenceBar({ value }) {
  const col = value >= 85 ? "#4ade80" : value >= 70 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: col, borderRadius: 4, transition: "width 1s" }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontWeight: 700, minWidth: 32 }}>{value}%</span>
    </div>
  );
}

function UpsidePill({ value }) {
  const pos = value >= 0;
  return (
    <span style={{
      background: pos ? "#4ade8018" : "#f8717118",
      color: pos ? "#4ade80" : "#f87171",
      border: `1px solid ${pos ? "#4ade8033" : "#f8717133"}`,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    }}>
      {pos ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

// ─── BROKER BUTTONS ──────────────────────────────────────────────────────────
function BrokerButtons({ stock }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
        DIREKT KAUFEN BEI:
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(stock.brokers).map(([key, url]) => {
          const m = BROKER_META[key];
          return (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#1e293b", border: `1px solid ${m.color}44`,
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
              color: "#f1f5f9", fontSize: 12, fontWeight: 600, transition: "all .15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = m.color + "22"; e.currentTarget.style.borderColor = m.color + "99"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = m.color + "44"; }}
            >
              <span>{m.flag}</span>
              <span>{m.name}</span>
              <span style={{ color: "#64748b", fontSize: 10 }}>↗</span>
            </a>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#334155", marginTop: 8 }}>
        ↗ Du wirst zur jeweiligen Broker-Plattform weitergeleitet. StockAI führt keine Transaktionen durch.
      </div>
    </div>
  );
}

// ─── PRICE TARGET CARDS ───────────────────────────────────────────────────────
function PriceTargetCards({ stock }) {
  const isBuy = stock.signal === "KAUFEN";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
      {/* Entry */}
      <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>EINSTIEGSKURS (KI)</div>
        {isBuy && stock.entryPrice ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", fontFamily: "monospace" }}>${stock.entryPrice.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Empfohlener Limit-Kurs</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#64748b" }}>Kein Einstieg empfohlen</div>
        )}
      </div>
      {/* Stop Loss */}
      <div style={{ background: "#0a1628", border: "1px solid #7f1d1d44", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#f87171", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>STOP-LOSS (KI)</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f87171", fontFamily: "monospace" }}>${stock.stopLoss.toFixed(2)}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Max. Verlustgrenze</div>
      </div>
      {/* Target 30d */}
      <div style={{ background: "#0a1628", border: "1px solid #4ade8033", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>KURSZIEL 30 TAGE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", fontFamily: "monospace" }}>${stock.target30.toFixed(2)}</div>
          <UpsidePill value={stock.upside30} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>KI-Prognose</div>
      </div>
      {/* Target 90d */}
      <div style={{ background: "#0a1628", border: "1px solid #60a5fa33", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, color: "#60a5fa", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>KURSZIEL 90 TAGE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", fontFamily: "monospace" }}>${stock.target90.toFixed(2)}</div>
          <UpsidePill value={stock.upside90} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>KI-Prognose</div>
      </div>
    </div>
  );
}

// ─── AI MODAL ────────────────────────────────────────────────────────────────
function AIModal({ stock, onClose, loading, analysis }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", backdropFilter: "blur(10px)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0b1220", border: "1px solid #1e3a5f", borderRadius: 22, padding: 28,
        maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 0 80px #3b82f620",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>🤖 KI-ANALYSE · MARKTINFO</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>{stock.ticker} <span style={{ color: "#64748b", fontWeight: 400, fontSize: 15 }}>· {stock.name}</span></div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
              <SignalBadge signal={stock.signal} />
              <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>${stock.price.toFixed(2)}</span>
              <span style={{ fontSize: 13, color: stock.change >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                {stock.change >= 0 ? "▲" : "▼"} {Math.abs(stock.change)}%
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#1e293b", border: "none", color: "#94a3b8", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Price targets */}
        <PriceTargetCards stock={stock} />

        {/* AI text */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 13, color: "#60a5fa", marginBottom: 14 }}>🤖 KI analysiert Marktdaten, News und Indikatoren...</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", animation: `pulse 1.2s ${i * 0.22}s infinite` }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 18, fontSize: 13, color: "#cbd5e1", lineHeight: 1.85, marginBottom: 20, whiteSpace: "pre-wrap" }}>
            {analysis}
          </div>
        )}

        {/* Confidence */}
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>KI-KONFIDENZ</div>
            <ConfidenceBar value={stock.confidence} />
          </div>
        )}

        {/* Broker buttons */}
        {!loading && stock.signal === "KAUFEN" && (
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 20, marginBottom: 20 }}>
            <BrokerButtons stock={stock} />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ background: "#1e293b44", border: "1px solid #334155", borderRadius: 10, padding: "12px 16px", fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
          ⚠️ <strong style={{ color: "#64748b" }}>Haftungsausschluss:</strong> {DISCLAIMER}
        </div>
      </div>
    </div>
  );
}

// ─── PAYWALL MODAL ───────────────────────────────────────────────────────────
function PaywallModal({ onClose, onSubscribe }) {
  const [sel, setSel] = useState("pro");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", backdropFilter: "blur(14px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#07111e", border: "1px solid #1e3a5f", borderRadius: 24, padding: 32, maxWidth: 820, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 0 100px #3b82f618" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, fontWeight: 800, marginBottom: 8 }}>FREE TRIAL ABGELAUFEN</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", marginBottom: 6 }}>Wähle deinen Plan</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Kursziele · Prognosen · Broker-Direktlinks · KI-Analysen</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {PLANS.map(p => (
            <div key={p.id} onClick={() => setSel(p.id)} style={{
              border: `2px solid ${sel === p.id ? p.color : "#1e293b"}`, borderRadius: 16, padding: 18,
              cursor: "pointer", position: "relative", background: sel === p.id ? p.color + "0d" : "#0f172a",
              transition: "all .2s",
            }}>
              {p.highlighted && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#000", fontSize: 10, fontWeight: 800, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ BELIEBTESTE</div>}
              <div style={{ color: p.color, fontWeight: 800, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{p.name.toUpperCase()}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9" }}>{p.price}<span style={{ fontSize: 13, color: "#64748b" }}> {p.currency}{p.period}</span></div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>{p.limit}</div>
              {p.features.map((f, i) => <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 5, display: "flex", gap: 6 }}><span style={{ color: p.color }}>✓</span>{f}</div>)}
            </div>
          ))}
        </div>
        <button onClick={() => onSubscribe(sel)} style={{ width: "100%", padding: 15, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>
          {PLANS.find(p => p.id === sel)?.name} Plan aktivieren →
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#475569", lineHeight: 1.6 }}>Jederzeit kündbar · Sichere Zahlung · Keine Anlageberatung · ⚠️ Keine Erfolgsgarantie</p>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
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
          system: `Du bist ein präziser KI-Marktanalyst. Erstelle kompakte, sachliche Marktinformationen auf Deutsch (150–200 Wörter).
Struktur:
1. 📊 Marktlage & aktuelle Treiber (2–3 Sätze)
2. ⚠️ Hauptrisiken (2 Sätze)
3. 🎯 KI-Einschätzung mit Begründung für das Kursziel (2–3 Sätze)
Endet IMMER mit: "⚠️ Dies sind KI-generierte Marktinformationen, keine persönliche Anlageberatung. Es besteht keine Erfolgsgarantie."`,
          messages: [{
            role: "user",
            content: `Analysiere ${stock.name} (${stock.ticker}). Kurs: $${stock.price} (${stock.change > 0 ? "+" : ""}${stock.change}%). Sektor: ${stock.sector}. KI-Signal: ${stock.signal}. KI-Konfidenz: ${stock.confidence}%. Einstiegskurs: ${stock.entryPrice ? "$" + stock.entryPrice : "nicht empfohlen"}. Kursziel 30T: $${stock.target30} (${stock.upside30 > 0 ? "+" : ""}${stock.upside30}%). Kursziel 90T: $${stock.target90} (${stock.upside90 > 0 ? "+" : ""}${stock.upside90}%). Stop-Loss: $${stock.stopLoss}. Marktkontext: Fed-Zinspause erwartet, AI-Boom im Technologiesektor, geopolitische Unsicherheiten.`,
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
    <div style={{ minHeight: "100vh", background: "#060d18", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: "#f1f5f9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px #3b82f610} 50%{box-shadow:0 0 40px #3b82f630} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0f172a} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        .srow:hover{background:#111e35 !important;cursor:pointer;}
        .nbtn:hover{color:#60a5fa !important;}
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1e293b", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, background: "#060d18cc", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚡</div>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5 }}>StockAI</span>
          <span style={{ fontSize: 10, color: "#3b82f6", background: "#1e3a5f", padding: "2px 8px", borderRadius: 20, fontWeight: 800 }}>BETA</span>
        </div>

        {/* Live mini-ticker */}
        <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
          {STOCKS.slice(0, 4).map(s => (
            <span key={s.ticker} style={{ color: s.change >= 0 ? "#4ade80" : "#f87171" }}>
              <span style={{ color: "#475569", marginRight: 4 }}>{s.ticker}</span>
              ${s.price} {s.change >= 0 ? "▲" : "▼"}{Math.abs(s.change)}%
            </span>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!plan && (
            <div style={{ background: trialDaysLeft <= 2 ? "#7f1d1d22" : "#1e3a5f22", border: `1px solid ${trialDaysLeft <= 2 ? "#dc262644" : "#3b82f644"}`, borderRadius: 10, padding: "6px 12px", fontSize: 12 }}>
              {isTrialExpired
                ? <span style={{ color: "#f87171", fontWeight: 700 }}>⏰ Trial abgelaufen</span>
                : <span style={{ color: "#60a5fa" }}>🎁 Trial: <strong>{trialDaysLeft} Tage</strong></span>}
            </div>
          )}
          {currentPlan && <div style={{ background: currentPlan.color + "22", border: `1px solid ${currentPlan.color}44`, borderRadius: 10, padding: "6px 12px", fontSize: 12, color: currentPlan.color, fontWeight: 800 }}>⭐ {currentPlan.name.toUpperCase()}</div>}
          {!plan && <button onClick={() => setShowPaywall(true)} style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Upgraden →</button>}
        </div>
      </header>

      {/* TRIAL BANNER */}
      {!isTrialExpired && !plan && trialDaysLeft <= 3 && (
        <div style={{ background: "#78350f18", borderBottom: "1px solid #f59e0b33", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fbbf24", fontSize: 13 }}>⚠️ Dein Test endet in <strong>{trialDaysLeft} Tagen</strong> — jetzt upgraden und Kursziele & Prognosen behalten!</span>
          <button onClick={() => setShowPaywall(true)} style={{ background: "#f59e0b", border: "none", borderRadius: 8, padding: "6px 16px", color: "#000", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Upgraden</button>
        </div>
      )}

      {/* NAV */}
      <nav style={{ padding: "10px 20px", borderBottom: "1px solid #1e293b", display: "flex", gap: 4 }}>
        {[{ id: "dashboard", label: "📊 Dashboard" }, { id: "watchlist", label: "⭐ Watchlist" }, { id: "news", label: "📰 News" }, { id: "pricing", label: "💎 Preise" }].map(t => (
          <button key={t.id} className="nbtn" onClick={() => setView(t.id)} style={{ background: view === t.id ? "#1e3a5f" : "transparent", border: "none", borderRadius: 8, padding: "7px 15px", color: view === t.id ? "#60a5fa" : "#64748b", fontWeight: view === t.id ? 700 : 400, cursor: "pointer", fontSize: 13, transition: "all .15s" }}>{t.label}</button>
        ))}
      </nav>

      {/* MAIN */}
      <main style={{ padding: "20px 20px 40px", maxWidth: 1200, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Kaufempfehlungen", value: "4", icon: "🟢", color: "#4ade80" },
                { label: "KI-Analysen heute", value: "1.247", icon: "🤖", color: "#60a5fa" },
                { label: "Ø KI-Konfidenz", value: "87%", icon: "🎯", color: "#a78bfa" },
                { label: "Überwachte Titel", value: "500+", icon: "📡", color: "#f59e0b" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "16px 18px", animation: `glow 4s ${i * .5}s infinite` }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>🔥 KI-Empfehlungen</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Inkl. Kursziele · Prognosen · Broker-Links · Aktualisiert vor 2 Min.</div>
                </div>
                <div style={{ fontSize: 11, color: "#475569", maxWidth: 280, textAlign: "right", lineHeight: 1.5 }}>⚠️ Keine Anlageberatung · Nur Marktinformationen</div>
              </div>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 70px 80px 110px 110px 110px 130px", padding: "10px 22px", fontSize: 10, color: "#475569", fontWeight: 800, letterSpacing: 1, borderBottom: "1px solid #1e293b" }}>
                <span>TICKER</span><span>UNTERNEHMEN</span><span>KURS</span><span>CHART</span><span>SIGNAL</span><span>EINSTIEG</span><span>ZIEL 30T</span><span>ZIEL 90T</span><span>KI-ANALYSE</span>
              </div>

              {STOCKS.map((s, i) => (
                <div key={s.ticker} className="srow" onClick={() => analyzeStock(s)} style={{
                  display: "grid", gridTemplateColumns: "80px 1fr 90px 70px 80px 110px 110px 110px 130px",
                  padding: "14px 22px", borderBottom: "1px solid #0d1926",
                  background: i % 2 === 0 ? "#0a1525" : "#0f172a", transition: "background .15s", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 900, fontFamily: "monospace", color: "#f1f5f9", fontSize: 13 }}>{s.ticker}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{s.sector}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "#cbd5e1" }}>{s.name}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>${s.price}</div>
                    <div style={{ fontSize: 11, color: s.change >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{s.change >= 0 ? "▲" : "▼"} {Math.abs(s.change)}%</div>
                  </div>
                  <div><Sparkline trend={s.trend} /></div>
                  <div><SignalBadge signal={s.signal} /></div>
                  <div>
                    {s.entryPrice
                      ? <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#4ade80", fontSize: 13 }}>${s.entryPrice.toFixed(2)}</span>
                      : <span style={{ color: "#475569", fontSize: 12 }}>—</span>}
                    <div style={{ fontSize: 10, color: "#475569" }}>Stop: ${s.stopLoss}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>${s.target30}</div>
                    <UpsidePill value={s.upside30} />
                  </div>
                  <div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>${s.target90}</div>
                    <UpsidePill value={s.upside90} />
                  </div>
                  <div>
                    <button onClick={e => { e.stopPropagation(); analyzeStock(s); }} style={{
                      background: "#1e3a5f", border: "1px solid #2563eb44", borderRadius: 8,
                      color: "#60a5fa", fontSize: 12, fontWeight: 700, padding: "7px 12px",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}>🤖 Analysieren</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, background: "#1e293b18", border: "1px solid #334155", borderRadius: 12, padding: "12px 18px", fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
              ⚠️ <strong style={{ color: "#64748b" }}>Haftungsausschluss:</strong> {DISCLAIMER}
            </div>
          </div>
        )}

        {/* NEWS */}
        {view === "news" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>📰 News & Marktbewegungen</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>KI filtert und bewertet marktrelevante Ereignisse automatisch</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {NEWS_ITEMS.map(item => (
                <div key={item.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#f1f5f9", marginBottom: 8, lineHeight: 1.4 }}>{item.title}</div>
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

        {/* WATCHLIST */}
        {view === "watchlist" && (
          <div style={{ animation: "fadeIn .3s ease", textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Persönliche Watchlist</div>
            <div style={{ color: "#64748b", marginBottom: 24 }}>Beobachte deine Aktien und erhalte KI-Alerts bei Kurszielen und Signalwechseln</div>
            {!plan && isTrialExpired
              ? <button onClick={() => setShowPaywall(true)} style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", border: "none", borderRadius: 12, padding: "14px 28px", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 15 }}>Abo abschliessen → Watchlist freischalten</button>
              : <div style={{ color: "#475569", fontSize: 13 }}>Klicke im Dashboard auf eine Aktie und öffne die KI-Analyse, um sie hinzuzufügen</div>}
          </div>
        )}

        {/* PRICING */}
        {view === "pricing" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, fontWeight: 800, marginBottom: 8 }}>PREISE & PLÄNE</div>
              <div style={{ fontWeight: 900, fontSize: 30, marginBottom: 6 }}>Investiere in dein Wissen</div>
              <div style={{ color: "#64748b" }}>7 Tage kostenlos · Jederzeit kündbar · Kursziele & Prognosen inklusive</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginBottom: 28 }}>
              {PLANS.map(p => (
                <div key={p.id} style={{ border: `2px solid ${p.highlighted ? p.color : "#1e293b"}`, borderRadius: 20, padding: 26, background: "#0f172a", position: "relative", boxShadow: p.highlighted ? `0 0 50px ${p.color}18` : "none" }}>
                  {p.highlighted && <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#000", fontSize: 10, fontWeight: 800, padding: "4px 18px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ BELIEBTESTE WAHL</div>}
                  <div style={{ color: p.color, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>{p.name.toUpperCase()}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 2 }}>{p.price}<span style={{ fontSize: 15, color: "#64748b" }}> {p.currency}</span></div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>{p.period} · {p.limit}</div>
                  <div style={{ marginBottom: 22 }}>
                    {p.features.map((f, i) => <div key={i} style={{ fontSize: 13, color: "#94a3b8", marginBottom: 7, display: "flex", gap: 8 }}><span style={{ color: p.color }}>✓</span>{f}</div>)}
                  </div>
                  <button onClick={() => subscribe(p.id)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `2px solid ${p.color}`, background: p.highlighted ? p.color : "transparent", color: p.highlighted ? "#000" : p.color, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>
                    {p.highlighted ? "Jetzt starten →" : "Plan wählen"}
                  </button>
                </div>
              ))}
            </div>
            {/* Broker logos */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginBottom: 14, fontWeight: 700 }}>BROKER-DIREKTLINKS INKLUSIVE IM PRO & ELITE PLAN</div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                {Object.entries(BROKER_META).map(([key, m]) => (
                  <div key={key} style={{ background: "#1e293b", border: `1px solid ${m.color}33`, borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
                    {m.flag} {m.name}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 12 }}>
                StockAI verlinkt direkt zu deinem Broker — wir führen keine Transaktionen durch und erhalten keine Ordergebühren.
              </div>
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
