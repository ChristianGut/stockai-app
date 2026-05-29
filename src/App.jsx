import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

// ─── KEYS ─────────────────────────────────────────────────────────────────────
const FINNHUB_KEY   = import.meta.env.VITE_FINNHUB_KEY;
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const FMP_KEY       = import.meta.env.VITE_FMP_KEY;

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#08090d", surface:"#0f1117", border:"#1a1d27", borderHov:"#2a2d3a",
  text:"#e8eaf0", textSub:"#6b7280", textMuted:"#3d4152",
  accent:"#4f8ef7", green:"#34d399", red:"#f87171", amber:"#f59e0b", purple:"#a78bfa",
};

// ─── CURRENCY HELPERS ─────────────────────────────────────────────────────────
function ccySymbol(currency) {
  if (!currency) return "$";
  const c = currency.toUpperCase();
  if (c === "CHF") return "CHF ";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  if (c === "JPY") return "¥";
  if (c === "SEK" || c === "NOK" || c === "DKK") return c + " ";
  return "$";
}
function ccy(stock)       { return ccySymbol(stock?.currency); }
function fmt(stock, price) {
  if (price == null || isNaN(price)) return "—";
  return ccy(stock) + Number(price).toFixed(2);
}
function fmtLarge(val) {
  if (val == null) return "—";
  if (val >= 1e12) return (val/1e12).toFixed(2) + "T";
  if (val >= 1e9)  return (val/1e9).toFixed(2)  + "B";
  if (val >= 1e6)  return (val/1e6).toFixed(2)  + "M";
  return val.toFixed(0);
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  { ticker:"NVDA",    name:"NVIDIA Corp.",          sector:"Semiconductors"      },
  { ticker:"AAPL",    name:"Apple Inc.",             sector:"Consumer Tech"       },
  { ticker:"MSFT",    name:"Microsoft Corp.",        sector:"Cloud / Software"    },
  { ticker:"AMZN",    name:"Amazon.com Inc.",        sector:"E-Commerce"          },
  { ticker:"META",    name:"Meta Platforms",         sector:"Social Media"        },
  { ticker:"TSLA",    name:"Tesla Inc.",             sector:"Automotive"          },
  { ticker:"GOOGL",   name:"Alphabet Inc.",          sector:"Internet"            },
  { ticker:"AMD",     name:"Advanced Micro Devices", sector:"Semiconductors"      },
  { ticker:"PLTR",    name:"Palantir Technologies",  sector:"AI / Data"           },
  { ticker:"ASML",    name:"ASML Holding NV",        sector:"Semiconductors"      },
  { ticker:"TSM",     name:"Taiwan Semiconductor",   sector:"Semiconductors"      },
  { ticker:"NVO",     name:"Novo Nordisk A/S",       sector:"Pharmaceuticals"     },
  { ticker:"SAP",     name:"SAP SE",                 sector:"Enterprise Software" },
  { ticker:"NESN.SW", name:"Nestlé SA",              sector:"Consumer Staples"    },
  { ticker:"NOVN.SW", name:"Novartis AG",            sector:"Pharmaceuticals"     },
  { ticker:"ROG.SW",  name:"Roche Holding AG",       sector:"Pharmaceuticals"     },
  { ticker:"COIN",    name:"Coinbase Global",        sector:"Crypto / Fintech"    },
  { ticker:"SNOW",    name:"Snowflake Inc.",         sector:"Cloud Data"          },
  { ticker:"CRWD",    name:"CrowdStrike Holdings",   sector:"Cybersecurity"       },
  { ticker:"RBLX",    name:"Roblox Corp.",           sector:"Gaming"              },
];

const DISCLAIMER = "Alle Inhalte dienen ausschliesslich zu Informationszwecken und stellen keine Anlageberatung dar. KI-Analysen basieren auf historischen Daten und Marktindikatoren. Keine Erfolgsgarantie. Kapital ist gefährdet.";

const TIME_RANGES = [
  { label:"1D", range:"1d",  interval:"5m"  },
  { label:"1W", range:"5d",  interval:"15m" },
  { label:"1M", range:"1mo", interval:"1d"  },
  { label:"3M", range:"3mo", interval:"1d"  },
  { label:"1Y", range:"1y",  interval:"1wk" },
  { label:"5Y", range:"5y",  interval:"1mo" },
];

const INDICATOR_INFO = {
  MA20:      "Moving Average 20 Tage — Durchschnittspreis der letzten 20 Handelstage. Zeigt kurzfristiges Momentum. Kurs über MA20 = kurzfristiger Aufwärtstrend.",
  MA50:      "Moving Average 50 Tage — Durchschnittspreis der letzten 50 Handelstage. Wichtige Trendlinie: Kurs über MA50 = mittelfristig bullish.",
  Fibonacci: "Fibonacci-Retracements — Mathematische Unterstützungszonen (38.2%, 50%, 61.8%). Professionelle Händler nutzen diese als potenzielle Einstiegs- oder Ausstiegspunkte.",
  RSI:       "Relative Strength Index (14 Perioden) — Misst Kursstärke von 0–100. Über 70 = überkauft (Vorsicht). Unter 30 = überverkauft (Kaufchance möglich).",
  MACD:      "MACD (12,26,9) — Vergleicht zwei exponentielle Durchschnitte. MACD-Linie kreuzt Signal von unten = Kaufsignal. Von oben = Verkaufssignal.",
  Volume:    "Handelsvolumen — Anzahl gehandelter Aktien. Hohes Volumen bei Kursanstieg bestätigt den Trend. Hohes Volumen bei Rückgang = starker Verkaufsdruck.",
  Entry:     "Fibonacci-Einstiegskurs — Nächster Support-Level unter dem aktuellen Kurs. Limit-Order setzen und warten bis der Kurs dieses Niveau erreicht.",
  StopLoss:  "Stop-Loss — Empfohlene Verlustgrenze. Verkaufen wenn der Kurs darunter fällt, um grössere Verluste zu vermeiden.",
  KGV:       "Kurs-Gewinn-Verhältnis (KGV / P/E Ratio) — Wie viele Jahre Gewinn der aktuelle Kurs widerspiegelt. Unter 15 = günstig, über 30 = teuer (je nach Sektor).",
  KBV:       "Kurs-Buchwert-Verhältnis (P/B Ratio) — Kurs im Verhältnis zum Buchwert. Unter 1 = unter Buchwert (möglicherweise günstig), über 3 = Wachstumsprämie.",
  Marge:     "Nettomarge — Anteil des Umsatzes der als Gewinn übrigbleibt. Höher = effizienter. Über 20% gilt als sehr gut.",
  Wachstum:  "Umsatzwachstum — Wie stark der Umsatz gegenüber dem Vorjahr gewachsen ist. Positives Wachstum zeigt Expansion des Unternehmens.",
};

// ─── PROXY FETCH ──────────────────────────────────────────────────────────────
const PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function proxyFetch(url, timeout=8000) {
  for (const makeProxy of PROXIES) {
    try {
      const r = await fetch(makeProxy(url), { signal: AbortSignal.timeout(timeout) });
      if (!r.ok) continue;
      const text = await r.text();
      try {
        const outer = JSON.parse(text);
        if (typeof outer.contents === "string") return JSON.parse(outer.contents);
        return outer;
      } catch { continue; }
    } catch { continue; }
  }
  return null;
}

async function finnhubGet(path) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1${path}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// ─── FINANCIAL MODELING PREP ──────────────────────────────────────────────────
// FMP provides fundamentals: P/E, P/B, margins, growth, analyst targets, ratings
// Free plan: 250 requests/day, no proxy needed (CORS allowed)
// ─── FINANCIAL MODELING PREP ──────────────────────────────────────────────────
async function fmpGet(path) {
  if (!FMP_KEY) return null;

  // Approach 1: Our own Vercel serverless function (no CORS issues)
  try {
    const r = await fetch(`/api/fmp?path=${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) return d;
      if (d && !d["Error Message"] && !d.error) return d;
    }
  } catch { /* fall through */ }

  // Approach 2: Direct fetch
  const base = `https://financialmodelingprep.com/api/v3/${path}?apikey=${FMP_KEY}`;
  try {
    const r = await fetch(base, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) return d;
      if (d && !d["Error Message"] && !d.error) return d;
    }
  } catch { /* try proxy */ }

  // Approach 3: allorigins proxy
  try {
    const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const outer = await r.json();
      if (outer.contents) {
        const d = JSON.parse(outer.contents);
        if (Array.isArray(d) && d.length > 0) return d;
        if (d && !d["Error Message"] && !d.error) return d;
      }
    }
  } catch { /* all failed */ }

  return null;
}

async function fetchFundamentals(ticker) {
  if (!FMP_KEY) return null;
  try {
    const baseTicker = ticker.split(".")[0];
    const tryTickers = ticker.includes(".") ? [baseTicker, ticker] : [ticker];

    for (const t of tryTickers) {
      const [profile, ratios, analysts] = await Promise.all([
        fmpGet(`/profile/${t}`),
        fmpGet(`/ratios-ttm/${t}`),
        fmpGet(`/price-target-consensus/${t}`),
      ]);

      const p = Array.isArray(profile) ? profile[0] : null;
      const r = Array.isArray(ratios)  ? ratios[0]  : ratios;
      const a = Array.isArray(analysts)? analysts[0]: analysts;

      if (!p?.symbol) continue;

      return {
        pe:           r?.peRatioTTM           != null ? +Number(r.peRatioTTM).toFixed(1)            : null,
        pb:           r?.priceToBookRatioTTM   != null ? +Number(r.priceToBookRatioTTM).toFixed(2)   : null,
        netMargin:    r?.netProfitMarginTTM    != null ? +(Number(r.netProfitMarginTTM)*100).toFixed(1) : null,
        roe:          r?.returnOnEquityTTM     != null ? +(Number(r.returnOnEquityTTM)*100).toFixed(1)  : null,
        grossMargin:  r?.grossProfitMarginTTM  != null ? +(Number(r.grossProfitMarginTTM)*100).toFixed(1): null,
        debtToEquity: r?.debtEquityRatioTTM    != null ? +Number(r.debtEquityRatioTTM).toFixed(2)    : null,
        currentRatio: r?.currentRatioTTM       != null ? +Number(r.currentRatioTTM).toFixed(2)       : null,
        marketCap:    p.mktCap    ?? null,
        revenue:      p.revenueTTM ?? null,
        employees:    p.fullTimeEmployees ?? null,
        analystTarget:a?.targetConsensus != null ? +Number(a.targetConsensus).toFixed(2) : null,
        analystHigh:  a?.targetHigh      != null ? +Number(a.targetHigh).toFixed(2)      : null,
        analystLow:   a?.targetLow       != null ? +Number(a.targetLow).toFixed(2)       : null,
        analystRating:p.rating ?? null,
        currency:     p.currency ?? null,
        industry:     p.industry ?? null,
        country:      p.country  ?? null,
        _source:      t, // debug: which ticker worked
      };
    }
    return null;
  } catch(e) {
    console.warn("FMP fetchFundamentals error:", ticker, e);
    return null;
  }
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function searchStocks(q) {
  const d = await finnhubGet(`/search?q=${encodeURIComponent(q)}`);
  return (d?.result ?? [])
    .filter(x => x.type === "Common Stock" || x.type === "ETP" || x.type === "")
    .slice(0, 8)
    .map(x => ({ ticker: x.symbol, name: x.description || x.symbol, sector: x.type || "Stock" }));
}

// ─── YAHOO FINANCE ────────────────────────────────────────────────────────────
async function yahooChart(ticker, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&events=div&includePrePost=false`;
  return proxyFetch(url);
}

function parseYahooChart(d, range) {
  const result = d?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta ?? {};
  const price     = meta.regularMarketPrice ?? null;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  const currency  = meta.currency ?? null;
  const quote = { price, prevClose, high: meta.regularMarketDayHigh ?? null, low: meta.regularMarketDayLow ?? null, change: price && prevClose ? +((price-prevClose)/prevClose*100).toFixed(2) : 0 };
  const ts    = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  const closes  = ohlcv.close  ?? [];
  const volumes = ohlcv.volume ?? [];
  const candles = ts.map((t,i)=>{
    if (closes[i]==null) return null;
    const date = new Date(t*1000);
    const label = (range==="1d"||range==="5d")
      ? date.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})
      : (range==="1mo"||range==="3mo")
      ? date.toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})
      : date.toLocaleDateString("de-CH",{month:"short",year:"2-digit"});
    return {label, price:+closes[i].toFixed(2), volume:volumes[i]??0, ts:t};
  }).filter(Boolean);
  const divEvents = result.events?.dividends ?? {};
  const divArr    = Object.values(divEvents).filter(x=>x.amount>0).sort((a,b)=>b.date-a.date);
  return {quote, candles:candles.length?candles:null, divArr, currency};
}

async function fetchStockData(ticker, chartRange="3mo", chartInterval="1d") {
  const [fhQuote, chartData, divData] = await Promise.all([
    finnhubGet(`/quote?symbol=${ticker}`),
    yahooChart(ticker, chartRange, chartInterval),
    yahooChart(ticker, "2y", "3mo"),
  ]);

  const chart     = parseYahooChart(chartData, chartRange);
  const divParsed = parseYahooChart(divData, "2y");

  // Currency: Yahoo meta is most reliable
  const yahooCurrency = chart?.currency ?? divParsed?.currency ?? null;
  const currency = yahooCurrency
    ?? (ticker.endsWith(".SW") ? "CHF"
      : ticker.endsWith(".DE")||ticker.endsWith(".AS")||ticker.endsWith(".PA")||ticker.endsWith(".MI") ? "EUR"
      : ticker.endsWith(".L") ? "GBp"  // London pence
      : "USD");

  // Quote: Finnhub primary, Yahoo fallback
  let quote = null;
  if (fhQuote?.c && fhQuote.c > 0) {
    quote = { price: fhQuote.c, change: fhQuote.dp??0, prevClose: fhQuote.pc, high: fhQuote.h, low: fhQuote.l };
  }
  if (!quote?.price && chart?.quote?.price) quote = chart.quote;
  if (!quote?.price) return null;

  // Dividends
  const divArr = divParsed?.divArr ?? chart?.divArr ?? [];
  let dividend = { paysDividend: false };
  if (divArr.length > 0) {
    const lastAmt  = divArr[0].amount;
    const lastDate = new Date(divArr[0].date*1000).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"});
    let frequency = "Jährlich";
    if (divArr.length >= 2) {
      const gaps = [];
      for (let i=0;i<Math.min(divArr.length-1,6);i++) gaps.push((divArr[i].date-divArr[i+1].date)/86400);
      const avg = gaps.reduce((a,b)=>a+b,0)/gaps.length;
      if (avg<40) frequency="Monatlich";
      else if (avg<100) frequency="Quartalsweise";
      else if (avg<200) frequency="Halbjährlich";
      else frequency="Jährlich";
    }
    const yr = Date.now()/1000 - 365*86400;
    const last12 = divArr.filter(d=>d.date>=yr);
    const perYear = frequency==="Monatlich"?12:frequency==="Quartalsweise"?4:frequency==="Halbjährlich"?2:1;
    const annualRate = last12.length>0 ? +last12.reduce((s,d)=>s+(d.amount??0),0).toFixed(4) : +(lastAmt*perYear).toFixed(4);
    const yieldPct = quote.price && annualRate ? +((annualRate/quote.price)*100).toFixed(2) : null;
    dividend = {paysDividend:true, lastAmount:lastAmt, lastExDate:lastDate, annualRate, yieldPct, frequency};
  }

  return {quote, candles:chart?.candles??null, dividend, currency};
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────
function addIndicators(data) {
  if (!data?.length) return [];
  const prices = data.map(d=>d.price);
  for (let i=0;i<data.length;i++) {
    const s20=prices.slice(Math.max(0,i-19),i+1);
    const s50=prices.slice(Math.max(0,i-49),i+1);
    data[i].ma20 = i>=19 ? +(s20.reduce((a,b)=>a+b)/s20.length).toFixed(2) : null;
    data[i].ma50 = i>=49 ? +(s50.reduce((a,b)=>a+b)/s50.length).toFixed(2) : null;
  }
  let avgG=0,avgL=0;
  for (let i=1;i<=14&&i<prices.length;i++){const d=prices[i]-prices[i-1];if(d>0)avgG+=d;else avgL-=d;}
  avgG/=14;avgL/=14;
  for (let i=14;i<data.length;i++){
    const d=prices[i]-prices[i-1];
    avgG=(avgG*13+Math.max(0,d))/14; avgL=(avgL*13+Math.max(0,-d))/14;
    data[i].rsi=+(100-100/(1+(avgL===0?100:avgG/avgL))).toFixed(1);
  }
  const ema=(arr,p)=>{const k=2/(p+1);let e=arr[0];return arr.map(v=>{e=v*k+e*(1-k);return +e.toFixed(4);});};
  const e12=ema(prices,12),e26=ema(prices,26);
  const ml=e12.map((v,i)=>+(v-e26[i]).toFixed(4));
  const sl=ema(ml,9);
  for (let i=26;i<data.length;i++){
    data[i].macd=+ml[i].toFixed(2); data[i].macdSignal=+sl[i].toFixed(2); data[i].macdHist=+(ml[i]-sl[i]).toFixed(2);
  }
  return data;
}
function getFib(data){
  const p=data.map(d=>d.price);
  const h=Math.max(...p),l=Math.min(...p),r=h-l;
  return {fib382:+(h-r*0.382).toFixed(2),fib50:+(h-r*0.5).toFixed(2),fib618:+(h-r*0.618).toFixed(2)};
}
function getEntry(price,fib){
  const lvls=[fib.fib382,fib.fib50,fib.fib618].filter(l=>l<price);
  return lvls.length?lvls[0]:+(price*0.965).toFixed(2);
}

// ─── BUILD STOCK ──────────────────────────────────────────────────────────────
async function buildStock(base, rangeLabel="3M") {
  const tr = TIME_RANGES.find(t=>t.label===rangeLabel)||TIME_RANGES[3];

  // Fetch market data + fundamentals in parallel
  const [data, fundamentals] = await Promise.all([
    fetchStockData(base.ticker, tr.range, tr.interval),
    fetchFundamentals(base.ticker),
  ]);
  if (!data) return null;

  const {quote, candles, dividend, currency} = data;
  const price    = quote.price;
  const chartData = addIndicators(candles ? [...candles] : []);
  const real      = chartData.length > 0;
  const fib       = real ? getFib(chartData) : {fib382:price*0.9,fib50:price*0.88,fib618:price*0.85};

  const lastRsi  = real ? (chartData.filter(d=>d.rsi!=null).slice(-1)[0]?.rsi??50) : 50;
  const lastMacd = real ? chartData.filter(d=>d.macd!=null).slice(-1)[0] : null;
  const macdX    = (lastMacd?.macd??0)>(lastMacd?.macdSignal??0)?"bullish":"bearish";
  const lastMA50 = real ? chartData.filter(d=>d.ma50!=null).slice(-1)[0]?.ma50 : null;
  const lastMA20 = real ? chartData.filter(d=>d.ma20!=null).slice(-1)[0]?.ma20 : null;
  const aboveMA50 = lastMA50 ? price>lastMA50 : null;
  const aboveMA20 = lastMA20 ? price>lastMA20 : null;

  // ── Signal logic ──────────────────────────────────────────────────────────
  let bull=0, bear=0;
  if (lastRsi<45)                   bull+=2;
  else if (lastRsi<60)              bull+=1;
  else if (lastRsi>=70)             bear+=2;
  else if (lastRsi>=60)             bear+=1;
  if (macdX==="bullish")            bull+=1; else bear+=1;
  if (aboveMA50===true)             bull+=1; else if (aboveMA50===false) bear+=1;
  if (aboveMA20===true)             bull+=1; else if (aboveMA20===false) bear+=1;
  const chg=quote.change??0;
  if (chg>1.5) bull+=1; else if (chg<-1.5) bear+=1;

  // Factor in fundamental valuation if available
  if (fundamentals?.pe) {
    if (fundamentals.pe > 0 && fundamentals.pe < 20)       bull+=1;
    else if (fundamentals.pe > 40)                         bear+=1;
  }
  if (fundamentals?.analystRating) {
    const r = fundamentals.analystRating.toLowerCase();
    if (r.includes("strong buy"))    bull+=2;
    else if (r.includes("buy"))      bull+=1;
    else if (r.includes("sell"))     bear+=2;
    else if (r.includes("underperform")) bear+=1;
  }

  const score = bull - bear;
  let signal, confidence;
  if (score>=3 && lastRsi<65)      { signal="BUY";   confidence=Math.min(60+score*5, 93); }
  else if (score<=-3||lastRsi>72)  { signal="WATCH"; confidence=Math.min(50+Math.abs(score)*4, 85); }
  else                             { signal="HOLD";  confidence=Math.min(52+Math.abs(score)*3, 78); }
  if (!real && signal==="BUY")       signal="HOLD";

  const slPct = 0.07+Math.random()*0.03;
  const u30 = signal==="BUY"  ? +(5+Math.random()*12).toFixed(1)
            : signal==="WATCH" ? +((-3)-Math.random()*7).toFixed(1)
            :                    +((-1)+Math.random()*5).toFixed(1);
  const u90 = signal==="BUY"  ? +(12+Math.random()*16).toFixed(1)
            : signal==="WATCH" ? +((-6)-Math.random()*10).toFixed(1)
            :                    +((-2)+Math.random()*9).toFixed(1);

  const resolvedCurrency = currency ?? fundamentals?.currency ?? "USD";

  return {
    ...base, price, change:quote.change??0,
    high:quote.high, low:quote.low, prevClose:quote.prevClose,
    chartData, fib, lastRsi, macdCrossing:macdX, aboveMA50, aboveMA20,
    signal, confidence, stopLossPct:slPct,
    entryPrice: signal==="BUY" ? getEntry(price,fib) : null,
    stopLoss:   +(price*(1-slPct)).toFixed(2),
    target30:   +(price*(1+u30/100)).toFixed(2),
    target90:   +(price*(1+u90/100)).toFixed(2),
    upside30:u30, upside90:u90,
    dataReal:real, dataSource:real?"Yahoo Finance (live)":"Live Kurs (Chart n/v)",
    currentRange:rangeLabel, dividend, fundamentals,
    currency: resolvedCurrency,
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function InfoTooltip({text}) {
  const [show,setShow]=useState(false);
  const ref=useRef(null);
  function handleShow(){
    const rect=ref.current?.getBoundingClientRect();
    setShow(true);
  }
  useEffect(()=>{
    if(!show)return;
    const fn=(e)=>{if(ref.current&&!ref.current.contains(e.target))setShow(false);};
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[show]);
  return(
    <span ref={ref} style={{position:"relative",display:"inline-flex",verticalAlign:"middle",marginLeft:4,flexShrink:0}}>
      <span onClick={e=>{e.stopPropagation();setShow(s=>!s);}} onMouseEnter={handleShow} onMouseLeave={()=>setShow(false)}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:15,height:15,borderRadius:"50%",background:"#1e293b",color:"#6b7280",fontSize:9,fontWeight:700,cursor:"pointer",userSelect:"none",border:"1px solid #2a3a50"}}>?</span>
      {show&&(
        <div style={{position:"fixed",width:280,background:"#131929",border:"1px solid #2a3a50",borderRadius:10,padding:"12px 14px",fontSize:12,color:"#c8ccd8",lineHeight:1.65,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,.7)",pointerEvents:"none",
          left:ref.current?Math.min(ref.current.getBoundingClientRect().left-130,window.innerWidth-296):0,
          top:ref.current?ref.current.getBoundingClientRect().bottom+8:0}}>
          {text}
        </div>
      )}
    </span>
  );
}
function SignalBadge({signal}){
  const m={BUY:[C.green+"18",C.green,C.green+"30"],HOLD:[C.amber+"18",C.amber,C.amber+"30"],WATCH:[C.textMuted+"40",C.textSub,C.border]};
  const l={BUY:"Buy",HOLD:"Hold",WATCH:"Watch"};
  const[bg,col,b]=m[signal]||m.WATCH;
  return <span style={{background:bg,color:col,border:`1px solid ${b}`,padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:600,letterSpacing:0.5,whiteSpace:"nowrap"}}>{l[signal]}</span>;
}
function Chg({v}){
  const pos=v>=0;
  return <span style={{color:pos?C.green:C.red,fontSize:12,fontWeight:500}}>{pos?"+":""}{v.toFixed(2)}%</span>;
}
function ConfBar({value}){
  const col=value>=85?C.green:value>=70?C.amber:C.red;
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${value}%`,height:"100%",background:col,borderRadius:2}}/>
      </div>
      <span style={{fontSize:11,color:col,fontWeight:600,minWidth:30}}>{value}%</span>
    </div>
  );
}
function ChartTip({active,payload,label}){
  if(!active||!payload?.length)return null;
  const d=payload[0]?.payload;
  return(
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px",fontSize:11,boxShadow:"0 4px 16px rgba(0,0,0,.4)"}}>
      <div style={{color:C.textSub,marginBottom:4}}>{label}</div>
      {d?.price!=null&&<div style={{color:C.text,fontWeight:600}}>{d.price}</div>}
      {d?.ma20!=null&&<div style={{color:C.amber}}>MA20 {d.ma20}</div>}
      {d?.ma50!=null&&<div style={{color:C.accent}}>MA50 {d.ma50}</div>}
      {d?.rsi!=null&&<div style={{color:d.rsi>70?C.red:d.rsi<30?C.green:C.textSub}}>RSI {d.rsi}</div>}
    </div>
  );
}

// ─── FUNDAMENTALS PANEL ───────────────────────────────────────────────────────
function FundamentalsPanel({fund, stock}) {
  if (!fund) return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Fundamentaldaten</div>
      <div style={{fontSize:12,color:C.textMuted}}>Nicht verfügbar — FMP Key prüfen oder Ticker nicht abgedeckt</div>
    </div>
  );

  const items = [
    {l:"KGV (P/E)",      info:INDICATOR_INFO.KGV,    v:fund.pe!=null?fund.pe.toString():"—",           c:fund.pe&&fund.pe<20?C.green:fund.pe&&fund.pe>40?C.red:C.text},
    {l:"KBV (P/B)",      info:INDICATOR_INFO.KBV,    v:fund.pb!=null?fund.pb.toString():"—",           c:C.text},
    {l:"Nettomarge",     info:INDICATOR_INFO.Marge,  v:fund.netMargin!=null?fund.netMargin+"%":"—",    c:fund.netMargin&&fund.netMargin>20?C.green:C.text},
    {l:"Bruttomarge",    info:null,                  v:fund.grossMargin!=null?fund.grossMargin+"%":"—",c:C.text},
    {l:"ROE",            info:null,                  v:fund.roe!=null?fund.roe+"%":"—",                c:fund.roe&&fund.roe>15?C.green:C.text},
    {l:"Debt/Equity",    info:null,                  v:fund.debtToEquity!=null?fund.debtToEquity.toString():"—", c:fund.debtToEquity&&fund.debtToEquity>2?C.red:C.text},
    {l:"Marktkapitalisierung",info:null,             v:fmtLarge(fund.marketCap),                      c:C.text},
    {l:"Umsatz (TTM)",   info:null,                  v:fmtLarge(fund.revenue),                        c:C.text},
  ].filter(i=>i.v!=="—");

  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12,fontWeight:600}}>
        Fundamentaldaten — Financial Modeling Prep
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}>
        {items.map((item,i)=>(
          <div key={i} style={{background:C.surface,borderRadius:6,padding:"9px 12px"}}>
            <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3,display:"flex",alignItems:"center"}}>
              {item.l}{item.info&&<InfoTooltip text={item.info}/>}
            </div>
            <div style={{fontSize:14,fontWeight:700,color:item.c,fontFamily:"monospace"}}>{item.v}</div>
          </div>
        ))}
      </div>

      {/* Analyst consensus */}
      {(fund.analystTarget||fund.analystRating) && (
        <div style={{background:C.accent+"0d",border:`1px solid ${C.accent}22`,borderRadius:8,padding:"10px 14px"}}>
          <div style={{fontSize:9,color:C.accent,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,marginBottom:6}}>Analysten-Konsensus</div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
            {fund.analystRating&&<span style={{fontSize:13,fontWeight:700,color:C.text}}>{fund.analystRating}</span>}
            {fund.analystTarget&&<span style={{fontSize:12,color:C.textSub}}>Kursziel: <strong style={{color:C.text,fontFamily:"monospace"}}>{ccy(stock)}{fund.analystTarget}</strong></span>}
            {fund.analystHigh&&fund.analystLow&&<span style={{fontSize:11,color:C.textMuted}}>Range: {ccy(stock)}{fund.analystLow} – {ccy(stock)}{fund.analystHigh}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DIVIDEND PANEL ───────────────────────────────────────────────────────────
function DividendCompact({div}){
  if(!div)return null;
  if(!div.paysDividend)return <span style={{background:C.textMuted+"20",color:C.textMuted,border:`1px solid ${C.border}`,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:500}}>No Div</span>;
  return <span style={{background:C.amber+"18",color:C.amber,border:`1px solid ${C.amber}30`,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>Div {div.yieldPct!=null?div.yieldPct+"%":"Yes"}</span>;
}
function DividendPanel({div,stock}){
  if(!div)return null;
  if(!div.paysDividend)return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Dividende</div>
      <div style={{fontSize:13,color:C.textMuted}}>Dieses Unternehmen zahlt keine Dividende</div>
    </div>
  );
  return(
    <div style={{background:C.amber+"0c",border:`1px solid ${C.amber}22`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Dividende</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:10}}>
        {[
          {l:"Jahresrendite",  v:div.yieldPct!=null?`${div.yieldPct}%`:"—",          c:C.amber},
          {l:"Letzte Zahlung", v:div.lastAmount!=null?`${ccy(stock)}${div.lastAmount.toFixed(4)}`:"—", c:C.text},
          {l:"Jährlich/Aktie", v:div.annualRate!=null?`${ccy(stock)}${div.annualRate}`:"—", c:C.text},
          {l:"Häufigkeit",     v:div.frequency??"—",  c:C.text},
          {l:"Ex-Datum",       v:div.lastExDate??"—", c:C.text},
        ].map((item,i)=>(
          <div key={i}>
            <div style={{fontSize:9,color:C.textMuted,marginBottom:3}}>{item.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:item.c,fontFamily:item.c===C.text?"monospace":"inherit"}}>{item.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function StockChart({stock,onRangeChange,currentRange,loadingChart}){
  const[tab,setTab]=useState("price");
  useEffect(()=>{setTab("price");},[currentRange,stock.ticker]);
  const col=stock.signal==="BUY"?C.green:stock.signal==="WATCH"?C.red:C.textSub;
  const data=stock.chartData??[];
  const thin=data.length>120?data.filter((_,i)=>i%2===0):data;
  const intv=Math.max(1,Math.floor(thin.length/6));
  const tabs=[{id:"price",l:"Price"},{id:"rsi",l:"RSI"},{id:"macd",l:"MACD"},{id:"volume",l:"Volume"}];
  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",position:"relative"}}>
      {loadingChart&&<div style={{position:"absolute",inset:0,background:C.bg+"dd",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.textSub,borderRadius:10}}>Lade Chart...</div>}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,alignItems:"center",overflowX:"auto",minHeight:42}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?600:400,color:tab===t.id?C.text:C.textSub,borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",whiteSpace:"nowrap",flexShrink:0}}>
            {t.l}{t.id==="rsi"&&<InfoTooltip text={INDICATOR_INFO.RSI}/>}{t.id==="macd"&&<InfoTooltip text={INDICATOR_INFO.MACD}/>}{t.id==="volume"&&<InfoTooltip text={INDICATOR_INFO.Volume}/>}
          </button>
        ))}
        <div style={{flex:1,minWidth:4}}/>
        <div style={{display:"flex",gap:1,padding:"0 8px",flexShrink:0}}>
          {TIME_RANGES.map(r=>(
            <button key={r.label} onClick={()=>onRangeChange(r.label)} style={{background:currentRange===r.label?C.border:"none",border:"none",borderRadius:4,padding:"5px 7px",cursor:"pointer",fontSize:11,fontWeight:currentRange===r.label?600:400,color:currentRange===r.label?C.text:C.textSub}}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"10px 4px 8px"}}>
        {data.length===0?(
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:12,color:C.textSub,marginBottom:4}}>Keine Chart-Daten verfügbar</div>
            <div style={{fontSize:10,color:C.textMuted}}>Anderen Zeitraum wählen oder später erneut versuchen</div>
          </div>
        ):tab==="price"?(
          <>
            <div style={{display:"flex",gap:10,padding:"0 10px 8px",fontSize:10,color:C.textSub,flexWrap:"wrap",alignItems:"center"}}>
              <span><span style={{color:C.amber}}>—</span> MA20<InfoTooltip text={INDICATOR_INFO.MA20}/></span>
              <span><span style={{color:C.accent}}>—</span> MA50<InfoTooltip text={INDICATOR_INFO.MA50}/></span>
              <span><span style={{color:C.purple,opacity:.7}}>- -</span> Fibonacci<InfoTooltip text={INDICATOR_INFO.Fibonacci}/></span>
              {stock.entryPrice&&<span><span style={{color:C.green}}>—</span> Entry<InfoTooltip text={INDICATOR_INFO.Entry}/></span>}
              <span><span style={{color:C.red}}>—</span> Stop<InfoTooltip text={INDICATOR_INFO.StopLoss}/></span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={thin} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs><linearGradient id={`g_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={col} stopOpacity={0.2}/><stop offset="95%" stopColor={col} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis domain={["auto","auto"]} tick={{fill:C.textMuted,fontSize:9}} width={58} tickFormatter={v=>v.toFixed(0)} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTip/>}/>
                <ReferenceLine y={stock.fib.fib382} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.4}/>
                <ReferenceLine y={stock.fib.fib50}  stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.3}/>
                <ReferenceLine y={stock.fib.fib618} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.2}/>
                {stock.entryPrice&&<ReferenceLine y={stock.entryPrice} stroke={C.green} strokeDasharray="5 3" strokeWidth={1} label={{value:`Entry ${stock.entryPrice}`,fill:C.green,fontSize:8,position:"insideBottomLeft"}}/>}
                <ReferenceLine y={stock.stopLoss} stroke={C.red} strokeDasharray="5 3" strokeWidth={1} label={{value:`Stop ${stock.stopLoss}`,fill:C.red,fontSize:8,position:"insideTopLeft"}}/>
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={1.5} fill={`url(#g_${stock.ticker})`} dot={false}/>
                <Line type="monotone" dataKey="ma20" stroke={C.amber}  strokeWidth={1} dot={false} strokeOpacity={0.85}/>
                <Line type="monotone" dataKey="ma50" stroke={C.accent} strokeWidth={1} dot={false} strokeOpacity={0.85}/>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ):tab==="rsi"?(
          <>
            <div style={{padding:"0 10px 8px",fontSize:10,color:C.textSub,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
              RSI (14)<InfoTooltip text={INDICATOR_INFO.RSI}/> — <span style={{color:C.red}}>Überkauft &gt;70</span> · <span style={{color:C.green}}>Überverkauft &lt;30</span> · Aktuell: <strong style={{color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d=>d.rsi!=null)} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs><linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{fill:C.textMuted,fontSize:9}} width={24} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTip/>}/>
                <ReferenceLine y={70} stroke={C.red}   strokeDasharray="4 3" strokeOpacity={0.5}/>
                <ReferenceLine y={50} stroke={C.border}/>
                <ReferenceLine y={30} stroke={C.green} strokeDasharray="4 3" strokeOpacity={0.5}/>
                <Area type="monotone" dataKey="rsi" stroke={C.accent} strokeWidth={1.5} fill="url(#rsiG)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </>
        ):tab==="macd"?(
          <>
            <div style={{padding:"0 10px 8px",fontSize:10,color:C.textSub,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
              MACD (12,26,9)<InfoTooltip text={INDICATOR_INFO.MACD}/> — Aktuell: <strong style={{color:stock.macdCrossing==="bullish"?C.green:C.red}}>{stock.macdCrossing==="bullish"?"Bullish":"Bearish"}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={thin.filter(d=>d.macd!=null)} margin={{top:4,right:8,left:0,bottom:0}}>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:C.textMuted,fontSize:9}} width={36} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
                <ReferenceLine y={0} stroke={C.border}/>
                <Bar dataKey="macdHist" fill={C.accent} fillOpacity={0.3} radius={[1,1,0,0]}/>
                <Line type="monotone" dataKey="macd"       stroke={C.accent} strokeWidth={1.5} dot={false}/>
                <Line type="monotone" dataKey="macdSignal" stroke={C.amber}  strokeWidth={1}   dot={false} strokeDasharray="4 2"/>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ):(
          <>
            <div style={{padding:"0 10px 8px",fontSize:10,color:C.textSub,display:"flex",alignItems:"center",gap:4}}>
              Volume<InfoTooltip text={INDICATOR_INFO.Volume}/>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={thin} margin={{top:4,right:8,left:0,bottom:0}}>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:C.textMuted,fontSize:9}} width={44} tickFormatter={v=>(v/1e6).toFixed(0)+"M"} axisLine={false} tickLine={false}/>
                <Tooltip formatter={v=>[(v/1e6).toFixed(1)+"M","Volume"]} contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
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
function AIModal({stock:init, onClose}){
  const[stock,setStock]=useState(init);
  const[analysis,setAnalysis]=useState("");
  const[loadingAI,setLoadingAI]=useState(true);
  const[loadingChart,setLoadingChart]=useState(false);
  const[loadingStock,setLoadingStock]=useState(!!init.loading);
  const[range,setRange]=useState(init.currentRange||"3M");

  // When parent passes updated stock (placeholder → real data), sync it
  useEffect(()=>{
    if(!init.loading) {
      setStock(init);
      setLoadingStock(false);
    }
  },[init]);

  async function handleRange(r){
    if(r===range)return;
    setRange(r); setLoadingChart(true);
    const u=await buildStock({ticker:stock.ticker,name:stock.name,sector:stock.sector},r);
    if(u)setStock(u);
    setLoadingChart(false);
  }

  useEffect(()=>{
    // Don't start AI analysis until we have real data
    if(init.loading || !init.price) return;
    let cancelled=false;
    async function run(){
      setLoadingAI(true);setAnalysis("");
      const s=stock;
      const f=s.fundamentals;
      const d=s.dividend;

      // Build rich context for the AI
      const techContext=`
TECHNISCHE ANALYSE (${s.dataReal?"echte Marktdaten":"Schätzung"}):
- Kurs: ${fmt(s,s.price)} (${s.change>=0?"+":""}${s.change.toFixed(2)}% heute)
- Tageshoch/-tief: ${fmt(s,s.high)} / ${fmt(s,s.low)}
- RSI(14): ${s.lastRsi} → ${s.lastRsi>70?"ÜBERKAUFT ⚠️":s.lastRsi<30?"ÜBERVERKAUFT (Kaufchance)":"Neutral"}
- MACD: ${s.macdCrossing==="bullish"?"Bullish (Kaufsignal)":"Bearish (Vorsicht)"}
- Über MA20: ${s.aboveMA20===null?"n/a":s.aboveMA20?"Ja ✓":"Nein ✗"}
- Über MA50: ${s.aboveMA50===null?"n/a":s.aboveMA50?"Ja ✓":"Nein ✗"}
- Fibonacci-Einstieg: ${s.entryPrice?fmt(s,s.entryPrice):"nicht empfohlen"}
- Stop-Loss: ${fmt(s,s.stopLoss)} (-${(s.stopLossPct*100).toFixed(1)}%)`;

      const fundContext=f?`
FUNDAMENTALANALYSE (Financial Modeling Prep):
- KGV (P/E): ${f.pe??"-"} ${f.pe&&f.pe<15?"(günstig)":f.pe&&f.pe>40?"(teuer)":""}
- KBV (P/B): ${f.pb??"-"}
- Nettomarge: ${f.netMargin!=null?f.netMargin+"%":"-"}
- Bruttomarge: ${f.grossMargin!=null?f.grossMargin+"%":"-"}
- ROE: ${f.roe!=null?f.roe+"%":"-"}
- Verschuldung (D/E): ${f.debtToEquity??"-"}
- Marktkapitalisierung: ${fmtLarge(f.marketCap)}
- Umsatz (TTM): ${fmtLarge(f.revenue)}
- Analysten-Konsensus: ${f.analystRating??"-"}
- Analysten-Kursziel: ${f.analystTarget?fmt(s,f.analystTarget):"-"} (Range: ${f.analystLow?fmt(s,f.analystLow):"-"} – ${f.analystHigh?fmt(s,f.analystHigh):"-"})`:"FUNDAMENTALDATEN: Nicht verfügbar";

      const divContext=d?.paysDividend?`
DIVIDENDE:
- Jahresrendite: ${d.yieldPct??"-"}%
- Letzte Zahlung: ${d.lastAmount?fmt(s,d.lastAmount):"-"} pro Aktie
- Häufigkeit: ${d.frequency??"-"}
- Letztes Ex-Datum: ${d.lastExDate??"-"}`:"DIVIDENDE: Keine Dividende";

      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({
            model:"claude-sonnet-4-5",max_tokens:1200,
            system:`Du bist ein präziser institutioneller Marktanalyst der technische Analyse, Fundamentaldaten und Dividendeninformationen kombiniert. Antworte auf Deutsch, ~250 Wörter. Klarer Fliesstext, keine Markdown-Symbole, keine Emojis. Verwende Zeilenumbrüche zwischen Abschnitten.

Struktur:
Technische Lage: RSI, MACD, MA20/50 konkret interpretieren — was signalisiert das aktuell?
Fundamentale Bewertung: KGV, Marge, Analystenziel, Verschuldung bewerten — ist die Aktie fair bewertet?
Dividende: Kommentiere die Dividendenstrategie falls vorhanden.
Gesamteinschätzung: Kursziel ${fmt(s,s.target30)} (30T) und ${fmt(s,s.target90)} (90T) begründen. Fibonacci-Einstieg ${s.entryPrice?fmt(s,s.entryPrice):"nicht empfohlen"} einordnen.
Risiken: Zwei konkrete, aktienspezifische Risiken.

Schlusszeile immer exakt: "Hinweis: KI-generierte Marktinformation basierend auf öffentlich verfügbaren Daten. Keine Anlageberatung. Keine Erfolgsgarantie."`,
            messages:[{role:"user",content:`${s.name} (${s.ticker}) — Sektor: ${s.sector} — Währung: ${s.currency??'USD'}
Signal: ${s.signal} | KI-Konfidenz: ${s.confidence}%
${techContext}
${fundContext}
${divContext}`}],
          }),
        });
        const data=await res.json();
        if(!cancelled)setAnalysis(data.content?.map(b=>b.text||"").join("\n")||"Analyse nicht verfügbar.");
      }catch(e){if(!cancelled)setAnalysis("Verbindungsfehler: "+e.message);}
      finally{if(!cancelled)setLoadingAI(false);}
    }
    run();
    return()=>{cancelled=true;};
  },[init.ticker, init.price]); // re-run when real price arrives

  // Compute price change stats (used in header)
  const dayChgPct  = stock.change ?? 0;
  const dayChgAbs  = stock.prevClose && stock.price ? stock.price - stock.prevClose : null;
  const firstPrice = stock.chartData?.length > 0 ? stock.chartData[0].price : null;
  const rangeChgPct = firstPrice && stock.price ? +((stock.price - firstPrice) / firstPrice * 100).toFixed(2) : null;
  const rangeChgAbs = firstPrice && stock.price ? +(stock.price - firstPrice).toFixed(2) : null;
  const posDay   = dayChgPct >= 0;
  const posRange = rangeChgPct !== null ? rangeChgPct >= 0 : true;

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"22px 18px",maxWidth:720,width:"100%",marginTop:8,boxShadow:"0 24px 64px rgba(0,0,0,.6)"}}>

        {/* ── HEADER ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:2,marginBottom:5,textTransform:"uppercase"}}>
              KI-Analyse{loadingStock?" · Lade Daten...":` · ${stock.dataReal?"Live Daten":"Live Kurs"}`}
            </div>
            <div style={{fontSize:20,fontWeight:700,color:C.text,letterSpacing:-.3,lineHeight:1.2}}>
              {stock.ticker} <span style={{color:C.textSub,fontWeight:400,fontSize:14}}>{stock.name}</span>
            </div>

            {loadingStock ? (
              <div style={{display:"flex",gap:5,alignItems:"center",marginTop:10}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}
                <span style={{fontSize:12,color:C.textSub,marginLeft:4}}>Lade Marktdaten...</span>
              </div>
            ) : (
              <>
                {/* Signal + Price + Currency */}
                <div style={{display:"flex",gap:10,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
                  <SignalBadge signal={stock.signal}/>
                  <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:C.text}}>{fmt(stock,stock.price)}</span>
                  <span style={{fontSize:10,color:C.textMuted,background:C.border,padding:"2px 7px",borderRadius:4}}>{stock.currency??'USD'}</span>
                </div>

                {/* Today + Range change boxes */}
                <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                  {/* Today */}
                  <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",minWidth:120}}>
                    <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Heute</div>
                    <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                      <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:posDay?C.green:C.red}}>
                        {posDay?"+":""}{dayChgPct.toFixed(2)}%
                      </span>
                      {dayChgAbs!=null&&(
                        <span style={{fontFamily:"monospace",fontSize:12,color:posDay?C.green+"99":C.red+"99"}}>
                          {posDay?"+":""}{ccy(stock)}{Math.abs(dayChgAbs).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {stock.high&&(
                      <div style={{fontSize:10,color:C.textMuted,marginTop:3}}>
                        H {fmt(stock,stock.high)} · T {fmt(stock,stock.low)}
                      </div>
                    )}
                  </div>

                  {/* Range change */}
                  {rangeChgPct!=null&&(
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",minWidth:120}}>
                      <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{range} Veränderung</div>
                      <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:posRange?C.green:C.red}}>
                          {posRange?"+":""}{rangeChgPct}%
                        </span>
                        <span style={{fontFamily:"monospace",fontSize:12,color:posRange?C.green+"99":C.red+"99"}}>
                          {posRange?"+":""}{ccy(stock)}{Math.abs(rangeChgAbs).toFixed(2)}
                        </span>
                      </div>
                      <div style={{fontSize:10,color:C.textMuted,marginTop:3}}>vs. Periodenanfang</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={{background:C.border,border:"none",color:C.textSub,width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:12}}>×</button>
        </div>

        {/* ── LOADING STATE ── */}
        {loadingStock ? (
          <div style={{padding:"60px 0",textAlign:"center"}}>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>
              {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.accent,animation:`pulse 1.3s ${i*.25}s infinite`}}/>)}
            </div>
            <div style={{fontSize:13,color:C.textSub,marginBottom:6}}>Lade Kursdaten, Chart, Fundamentaldaten...</div>
            <div style={{fontSize:11,color:C.textMuted}}>Finnhub · Yahoo Finance · Financial Modeling Prep</div>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div style={{marginBottom:14}}>
              <StockChart key={`${stock.ticker}-${range}`} stock={stock} onRangeChange={handleRange} currentRange={range} loadingChart={loadingChart}/>
            </div>

            {/* Technical indicators */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
              {[
                {l:"RSI (14)",       info:INDICATOR_INFO.RSI,      v:stock.lastRsi,                                         s:stock.lastRsi>70?"Überkauft":stock.lastRsi<30?"Überverkauft":"Neutral", c:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub},
                {l:"MACD",          info:INDICATOR_INFO.MACD,     v:stock.macdCrossing==="bullish"?"Bullish":"Bearish",     s:"Trendkreuzung",  c:stock.macdCrossing==="bullish"?C.green:C.red},
                {l:"Einstieg (Fib)",info:INDICATOR_INFO.Entry,    v:stock.entryPrice?fmt(stock,stock.entryPrice):"—",       s:"Support-Level",  c:C.purple},
                {l:"Stop-Loss",     info:INDICATOR_INFO.StopLoss, v:fmt(stock,stock.stopLoss),                              s:`-${(stock.stopLossPct*100).toFixed(1)}%`, c:C.red},
              ].map((item,i)=>(
                <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 14px"}}>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5,display:"flex",alignItems:"center"}}>{item.l}<InfoTooltip text={item.info}/></div>
                  <div style={{fontSize:14,fontWeight:700,color:item.c,fontFamily:"monospace"}}>{item.v}</div>
                  <div style={{fontSize:9,color:C.textMuted,marginTop:2}}>{item.s}</div>
                </div>
              ))}
            </div>

            {/* Targets */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
              {[
                {l:"Kursziel 30 Tage",v:fmt(stock,stock.target30),u:stock.upside30,c:C.green+"20",b:C.green+"25"},
                {l:"Kursziel 90 Tage",v:fmt(stock,stock.target90),u:stock.upside90,c:C.accent+"15",b:C.accent+"25"},
              ].map((t,i)=>(
                <div key={i} style={{background:t.c,border:`1px solid ${t.b}`,borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>{t.l}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:C.text}}>{t.v}</span>
                    <span style={{color:t.u>=0?C.green:C.red,fontSize:12,fontWeight:600}}>{t.u>=0?"+":""}{t.u}%</span>
                  </div>
                  <div style={{fontSize:9,color:C.textMuted,marginTop:2}}>KI-Prognose · nicht garantiert</div>
                </div>
              ))}
            </div>

            {/* Fundamentals */}
            <FundamentalsPanel fund={stock.fundamentals} stock={stock}/>

            {/* Dividend */}
            <DividendPanel div={stock.dividend} stock={stock}/>

            {/* AI Analysis */}
            {loadingAI ? (
              <div style={{background:C.bg,borderRadius:8,padding:"22px",textAlign:"center",marginBottom:14}}>
                <div style={{fontSize:12,color:C.textSub,marginBottom:10}}>Analysiere Technische Daten · Fundamentaldaten · Dividenden...</div>
                <div style={{display:"flex",gap:5,justifyContent:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}
                </div>
              </div>
            ) : (
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 18px",fontSize:13,color:"#c8ccd8",lineHeight:1.9,marginBottom:14,whiteSpace:"pre-wrap"}}>{analysis}</div>
            )}

            {!loadingAI&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>KI-Konfidenz</div>
                <ConfBar value={stock.confidence}/>
              </div>
            )}

            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:10,color:C.textMuted}}>Kurse: <span style={{color:stock.dataReal?C.green:C.textSub}}>{stock.dataSource}</span> · Fundamentals: FMP</span>
              <span style={{fontSize:10,color:C.textMuted}}>Aktualisiert beim Laden</span>
            </div>
            <div style={{marginTop:10,fontSize:10,color:C.textMuted,lineHeight:1.6}}>{DISCLAIMER}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MOBILE CARD ──────────────────────────────────────────────────────────────
function StockCard({stock,onAnalyze}){
  const f=stock.fundamentals;
  return(
    <div onClick={()=>onAnalyze(stock)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderHov} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <div style={{fontWeight:700,fontFamily:"monospace",fontSize:15,color:C.text}}>{stock.ticker} <span style={{fontSize:10,color:C.textMuted,fontFamily:"sans-serif",fontWeight:400}}>{stock.currency??'USD'}</span></div>
          <div style={{fontSize:12,color:C.textSub,marginTop:1}}>{stock.name}</div>
          <div style={{fontSize:10,color:C.textMuted}}>{stock.sector}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
          <div style={{fontWeight:700,fontFamily:"monospace",fontSize:16,color:C.text}}>{fmt(stock,stock.price)}</div>
          <Chg v={stock.change}/>
          {stock.prevClose&&stock.price&&(
            <div style={{fontSize:10,color:stock.change>=0?C.green+"99":C.red+"99",marginTop:1,fontFamily:"monospace"}}>
              {stock.change>=0?"+":""}{ccy(stock)}{Math.abs(stock.price-stock.prevClose).toFixed(2)}
            </div>
          )}
          {stock.high&&<div style={{fontSize:10,color:C.textMuted,marginTop:1}}>H {fmt(stock,stock.high)} · T {fmt(stock,stock.low)}</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <SignalBadge signal={stock.signal}/>
        <span style={{fontSize:11,color:C.textSub}}>RSI <span style={{color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub,fontWeight:600}}>{stock.lastRsi}</span></span>
        {f?.pe&&<span style={{fontSize:10,color:C.textSub}}>KGV <span style={{fontWeight:600,color:f.pe<20?C.green:f.pe>40?C.red:C.text}}>{f.pe}</span></span>}
        <DividendCompact div={stock.dividend}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <div style={{background:C.bg,borderRadius:8,padding:"9px 12px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>Einstieg (Fib)</div>
          <div style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:C.purple}}>{stock.entryPrice?fmt(stock,stock.entryPrice):"—"}</div>
        </div>
        <div style={{background:C.bg,borderRadius:8,padding:"9px 12px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>Stop-Loss</div>
          <div style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:C.red}}>{fmt(stock,stock.stopLoss)}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <div style={{background:C.green+"0d",borderRadius:8,padding:"9px 12px",border:`1px solid ${C.green}25`}}>
          <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>Ziel 30 Tage</div>
          <div style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:C.text}}>{fmt(stock,stock.target30)}</div>
          <span style={{fontSize:11,color:stock.upside30>=0?C.green:C.red,fontWeight:600}}>{stock.upside30>=0?"+":""}{stock.upside30}%</span>
        </div>
        <div style={{background:C.accent+"0d",borderRadius:8,padding:"9px 12px",border:`1px solid ${C.accent}25`}}>
          <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>Ziel 90 Tage</div>
          <div style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:C.text}}>{fmt(stock,stock.target90)}</div>
          <span style={{fontSize:11,color:stock.upside90>=0?C.green:C.red,fontWeight:600}}>{stock.upside90>=0?"+":""}{stock.upside90}%</span>
        </div>
      </div>
      {stock.dividend?.paysDividend?(
        <div style={{background:C.amber+"0d",border:`1px solid ${C.amber}22`,borderRadius:8,padding:"9px 12px",marginBottom:10}}>
          <div style={{fontSize:9,color:C.amber,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,marginBottom:4}}>Dividende</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.text}}>Rendite: <strong style={{color:C.amber}}>{stock.dividend.yieldPct!=null?stock.dividend.yieldPct+"%":"—"}</strong></span>
            <span style={{fontSize:12,color:C.text}}>Zahlung: <strong style={{fontFamily:"monospace"}}>{stock.dividend.lastAmount!=null?fmt(stock,stock.dividend.lastAmount):"-"}</strong></span>
            <span style={{fontSize:12,color:C.textSub}}>{stock.dividend.frequency??""}</span>
          </div>
        </div>
      ):(
        <div style={{marginBottom:10}}><span style={{fontSize:10,color:C.textMuted,background:C.border+"60",padding:"3px 8px",borderRadius:4}}>Keine Dividende</span></div>
      )}
      {f&&(f.pe||f.analystRating)&&(
        <div style={{background:C.accent+"0d",border:`1px solid ${C.accent}20`,borderRadius:8,padding:"9px 12px",marginBottom:10}}>
          <div style={{fontSize:9,color:C.accent,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,marginBottom:4}}>Fundamentals</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {f.pe&&<span style={{fontSize:12,color:C.text}}>KGV: <strong style={{color:f.pe<20?C.green:f.pe>40?C.red:C.text}}>{f.pe}</strong></span>}
            {f.netMargin&&<span style={{fontSize:12,color:C.text}}>Marge: <strong>{f.netMargin}%</strong></span>}
            {f.analystRating&&<span style={{fontSize:12,color:C.text}}>Analysten: <strong style={{color:C.accent}}>{f.analystRating}</strong></span>}
          </div>
        </div>
      )}
      <div style={{background:C.accent+"18",border:`1px solid ${C.accent}30`,borderRadius:8,padding:"9px",textAlign:"center",fontSize:12,fontWeight:600,color:C.accent}}>
        Chart & KI-Analyse öffnen →
      </div>
    </div>
  );
}

// ─── DESKTOP ROW ──────────────────────────────────────────────────────────────
function StockRow({stock,onAnalyze,idx}){
  const f=stock.fundamentals;
  return(
    <div onClick={()=>onAnalyze(stock)} style={{display:"grid",gridTemplateColumns:"80px 1fr 110px 90px 65px 80px 90px 90px 90px",padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:idx%2===0?C.bg:C.surface,transition:"background .15s",alignItems:"center",cursor:"pointer",minWidth:0}} onMouseEnter={e=>e.currentTarget.style.background="#141720"} onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?C.bg:C.surface}>
      <div style={{minWidth:0}}>
        <div style={{fontWeight:700,fontFamily:"monospace",fontSize:13,color:C.text}}>{stock.ticker}</div>
        <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stock.currency??'USD'}</div>
      </div>
      <div style={{fontSize:12,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{stock.name}</div>
      <div>
        <div style={{fontWeight:600,fontFamily:"monospace",fontSize:13,color:C.text}}>{fmt(stock,stock.price)}</div>
        <Chg v={stock.change}/>
        {stock.prevClose&&stock.price&&(
          <div style={{fontSize:9,color:stock.change>=0?C.green+"99":C.red+"99",fontFamily:"monospace"}}>
            {stock.change>=0?"+":""}{ccy(stock)}{Math.abs(stock.price-stock.prevClose).toFixed(2)}
          </div>
        )}
      </div>
      <div><SignalBadge signal={stock.signal}/></div>
      <div>
        <div style={{fontFamily:"monospace",fontWeight:600,fontSize:13,color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</div>
        <div style={{fontSize:9,color:stock.dataReal?C.green+"99":C.textMuted}}>{stock.dataReal?"Live":"Est."}</div>
      </div>
      <div>
        {f?.pe?<><div style={{fontFamily:"monospace",fontWeight:600,fontSize:12,color:f.pe<20?C.green:f.pe>40?C.red:C.text}}>{f.pe}</div><div style={{fontSize:9,color:C.textMuted}}>KGV</div></>:<span style={{color:C.textMuted,fontSize:11}}>—</span>}
      </div>
      <div><DividendCompact div={stock.dividend}/></div>
      <div>
        {stock.entryPrice?<><div style={{fontFamily:"monospace",fontWeight:600,fontSize:11,color:C.purple}}>{fmt(stock,stock.entryPrice)}</div><div style={{fontSize:9,color:C.textMuted}}>Fib</div></>:<span style={{color:C.textMuted,fontSize:12}}>—</span>}
      </div>
      <div>
        <button style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.textSub,fontSize:11,fontWeight:500,padding:"5px 10px",cursor:"pointer",whiteSpace:"nowrap"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub;}}>Analyse</button>
      </div>
    </div>
  );
}

// ─── PULL TO REFRESH ──────────────────────────────────────────────────────────
function PullToRefresh({onRefresh}){
  const[pulling,setPulling]=useState(false);
  const[distance,setDistance]=useState(0);
  const[refreshing,setRefreshing]=useState(false);
  const startY=useRef(0);
  const threshold=72;
  useEffect(()=>{
    const el=document.documentElement;
    function onTouchStart(e){if(el.scrollTop>0)return;startY.current=e.touches[0].clientY;setPulling(true);}
    function onTouchMove(e){if(!pulling)return;if(el.scrollTop>0){setDistance(0);return;}const dy=e.touches[0].clientY-startY.current;if(dy<0){setDistance(0);return;}setDistance(Math.min(dy*0.45,threshold+20));}
    function onTouchEnd(){if(distance>=threshold&&!refreshing){setRefreshing(true);setDistance(threshold);onRefresh(()=>{setRefreshing(false);setDistance(0);setPulling(false);});}else{setDistance(0);setPulling(false);}}
    window.addEventListener("touchstart",onTouchStart,{passive:true});
    window.addEventListener("touchmove",onTouchMove,{passive:true});
    window.addEventListener("touchend",onTouchEnd,{passive:true});
    return()=>{window.removeEventListener("touchstart",onTouchStart);window.removeEventListener("touchmove",onTouchMove);window.removeEventListener("touchend",onTouchEnd);};
  },[pulling,distance,refreshing,onRefresh]);
  if(distance===0&&!refreshing)return null;
  const ready=distance>=threshold;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",height:refreshing?threshold:distance,background:C.bg,borderBottom:`1px solid ${C.border}`,transition:refreshing?"height 0.2s ease":"none",overflow:"hidden"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
        {refreshing?(<><div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}</div><span style={{fontSize:11,color:C.textSub}}>Aktualisiere...</span></>):(
          <><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{transform:`rotate(${ready?180:0}deg)`,transition:"transform 0.2s ease"}}><path d="M10 4v12M10 16l-4-4M10 16l4-4" stroke={ready?C.accent:C.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span style={{fontSize:11,color:ready?C.accent:C.textMuted}}>{ready?"Loslassen zum Aktualisieren":"Nach unten ziehen..."}</span></>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App(){
  const[stocks,setStocks]=useState([]);
  const[selected,setSelected]=useState(null);
  const[searchQuery,setQuery]=useState("");
  const[searchRes,setSearchRes]=useState([]);
  const[searching,setSearching]=useState(false);
  const[loadingList,setLoadingList]=useState(true);
  const[progress,setProgress]=useState(0);
  const[mobile,setMobile]=useState(window.innerWidth<720);

  useEffect(()=>{const fn=()=>setMobile(window.innerWidth<720);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  async function loadAll(done){
    setLoadingList(true); setProgress(0); setStocks([]);
    const BATCH=4;
    const results=[];
    for(let i=0;i<DEFAULT_TICKERS.length;i+=BATCH){
      const batch=DEFAULT_TICKERS.slice(i,i+BATCH);
      const built=await Promise.all(batch.map(t=>buildStock(t,"3M")));
      built.forEach(s=>{if(s)results.push(s);});
      setStocks([...results]);
      setProgress(Math.min(100,Math.round(((i+BATCH)/DEFAULT_TICKERS.length)*100)));
      if(i+BATCH<DEFAULT_TICKERS.length)await new Promise(r=>setTimeout(r,150));
    }
    setLoadingList(false);
    if(done)done();
  }

  useEffect(()=>{loadAll();},[]);

  useEffect(()=>{
    if(!searchQuery.trim()){setSearchRes([]);return;}
    const t=setTimeout(async()=>{setSearching(true);const res=await searchStocks(searchQuery);setSearchRes(res);setSearching(false);},500);
    return()=>clearTimeout(t);
  },[searchQuery]);

  async function addFromSearch(item) {
    setQuery(""); setSearchRes([]);

    // Check if already loaded
    const existing = stocks.find(s => s.ticker === item.ticker);
    if (existing) { setSelected(existing); return; }

    // Show modal immediately with a placeholder so user gets instant feedback
    const placeholder = {
      ...item,
      price: null, change: 0, high: null, low: null, prevClose: null,
      chartData: [], fib: {fib382:0,fib50:0,fib618:0},
      lastRsi: 50, macdCrossing: "neutral", aboveMA50: null, aboveMA20: null,
      signal: "HOLD", confidence: 50, stopLossPct: 0.08,
      entryPrice: null, stopLoss: null,
      target30: null, target90: null, upside30: 0, upside90: 0,
      dataReal: false, dataSource: "Lade...", currentRange: "3M",
      dividend: { paysDividend: false }, fundamentals: null,
      currency: item.ticker.endsWith(".SW") ? "CHF"
        : item.ticker.endsWith(".DE")||item.ticker.endsWith(".AS")||item.ticker.endsWith(".PA") ? "EUR"
        : "USD",
      loading: true, // flag so modal shows loading state
    };
    setSelected(placeholder);

    // Load in background
    const s = await buildStock(item, "3M");
    if (s) {
      setStocks(prev => [s, ...prev]);
      setSelected(s); // replace placeholder with real data
    }
  }

  const buyCount=stocks.filter(s=>s.signal==="BUY").length;
  const lastUpdated=stocks.length>0?new Date().toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"}):null;

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Helvetica Neue',sans-serif",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        input,button{touch-action:manipulation;}
        input{font-size:16px!important;}
        input::placeholder{color:${C.textMuted};}
      `}</style>

      {mobile&&<PullToRefresh onRefresh={loadAll}/>}

      {/* HEADER */}
      <header style={{borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,background:C.bg+"f0",backdropFilter:"blur(16px)",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill={C.accent} fillOpacity="0.15"/>
            <polyline points="5,20 10,13 15,16 23,7" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="23" cy="7" r="2" fill={C.accent}/>
          </svg>
          <span style={{fontSize:16,fontWeight:700,color:C.text,letterSpacing:-.4}}>StockAI</span>
        </div>
        {!mobile&&stocks.length>0&&(
          <div style={{display:"flex",gap:18,fontSize:12}}>
            {stocks.slice(0,4).map(s=>(
              <span key={s.ticker} onClick={()=>setSelected(s)} style={{cursor:"pointer"}}>
                <span style={{color:C.textMuted,marginRight:5,fontSize:11}}>{s.ticker}</span>
                <span style={{fontFamily:"monospace",fontWeight:600,color:C.text}}>{ccy(s)}{s.price.toFixed(0)}</span>
                <span style={{marginLeft:4,color:s.change>=0?C.green:C.red}}>{s.change>=0?"+":""}{s.change.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        )}
        <div style={{fontSize:11,color:C.textSub}}>
          {loadingList?<span style={{color:C.accent}}>Lädt {progress}%</span>:<><span style={{color:C.green,fontWeight:600}}>{buyCount}</span> Kaufsignale{lastUpdated&&mobile&&<span style={{color:C.textMuted,marginLeft:6}}>· {lastUpdated}</span>}</>}
        </div>
      </header>

      {/* SEARCH */}
      <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,position:"relative",zIndex:50}}>
        <div style={{position:"relative",maxWidth:520}}>
          <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke={C.textMuted} strokeWidth="1.5"/>
            <path d="M10 10L13 13" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input value={searchQuery} onChange={e=>setQuery(e.target.value)} placeholder="Aktie suchen — AAPL, UBS, Porsche, Nestlé..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px 9px 32px",color:C.text,outline:"none",transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>{e.target.style.borderColor=C.border;setTimeout(()=>setSearchRes([]),200);}}/>
          {searching&&<span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.textSub}}>Suche...</span>}
        </div>
        {searchRes.length>0&&(
          <div style={{position:"absolute",top:"calc(100% - 12px)",left:20,width:Math.min(520,window.innerWidth-40),background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
            {searchRes.map(r=>(
              <div key={r.ticker} onMouseDown={()=>addFromSearch(r)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=C.border} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                  <span style={{fontWeight:700,fontFamily:"monospace",color:C.accent,fontSize:12,flexShrink:0}}>{r.ticker}</span>
                  <span style={{fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                </div>
                <span style={{fontSize:10,color:C.textMuted,flexShrink:0,marginLeft:8}}>{r.sector}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STATS */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${mobile?2:4},1fr)`,borderBottom:`1px solid ${C.border}`}}>
        {[
          {l:"Kaufsignale",  v:loadingList?"—":buyCount,                                                                              c:C.green},
          {l:"Aktien",       v:stocks.length||"—",                                                                                    c:C.text},
          {l:"Ø RSI",        v:stocks.length?(stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0):"—",                     c:C.text},
          {l:"Quellen",      v:"Finnhub · Yahoo · FMP",                                                                               c:C.textSub},
        ].map((s,i)=>(
          <div key={i} style={{padding:"12px 20px",borderRight:i<3?`1px solid ${C.border}`:"none"}}>
            <div style={{fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:i===3?11:18,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* LIST */}
      <div style={{padding:"14px 20px 48px"}}>
        {loadingList&&stocks.length===0?(
          <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:13,color:C.textSub,marginBottom:12}}>Lade Marktdaten · Fundamentaldaten · Dividenden...</div>
            <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:14}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.4s ${i*.25}s infinite`}}/>)}</div>
            <div style={{width:180,height:3,background:C.border,borderRadius:2,margin:"0 auto",overflow:"hidden"}}>
              <div style={{width:`${progress}%`,height:"100%",background:C.accent,borderRadius:2,transition:"width .3s"}}/>
            </div>
            <div style={{fontSize:10,color:C.textMuted,marginTop:6}}>{progress}%</div>
          </div>
        ):mobile?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:2,display:"flex",justifyContent:"space-between"}}>
              <span>{stocks.length} Aktien{loadingList?" · lädt...":""}</span><span>Tippen für Analyse</span>
            </div>
            {stocks.map(s=><StockCard key={s.ticker} stock={s} onAnalyze={setSelected}/>)}
          </div>
        ):(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:C.text}}>Marktübersicht</div>
                <div style={{fontSize:11,color:C.textSub,marginTop:1}}>{stocks.length} Aktien · Kurse: Finnhub live · Chart: Yahoo Finance · Fundamentals: FMP{loadingList&&<span style={{color:C.accent}}> · lädt...</span>}</div>
              </div>
              <div style={{fontSize:10,color:C.textMuted}}>Keine Anlageberatung</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 110px 90px 65px 80px 90px 90px 90px",padding:"7px 20px",fontSize:10,color:C.textMuted,fontWeight:500,letterSpacing:0.8,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>
              <span>Ticker</span><span>Unternehmen</span><span>Kurs</span><span>Signal</span><span>RSI</span><span>KGV</span><span>Dividende</span><span>Einstieg</span><span></span>
            </div>
            {stocks.map((s,i)=><StockRow key={s.ticker} stock={s} onAnalyze={setSelected} idx={i}/>)}
          </div>
        )}
        <div style={{marginTop:18,fontSize:10,color:C.textMuted,lineHeight:1.7,maxWidth:680}}>{DISCLAIMER}</div>
      </div>

      {selected&&<AIModal stock={selected} onClose={()=>setSelected(null)}/>}
    </div>
  );
}
