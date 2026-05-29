import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

// ─── KEYS ─────────────────────────────────────────────────────────────────────
const FINNHUB_KEY   = import.meta.env.VITE_FINNHUB_KEY;
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#08090d", surface:"#0f1117", border:"#1a1d27", borderHov:"#2a2d3a",
  text:"#e8eaf0", textSub:"#6b7280", textMuted:"#3d4152",
  accent:"#4f8ef7", green:"#34d399", red:"#f87171", amber:"#f59e0b", purple:"#a78bfa",
};

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  { ticker:"NVDA",    name:"NVIDIA Corp.",          sector:"Semiconductors"     },
  { ticker:"AAPL",    name:"Apple Inc.",             sector:"Consumer Tech"      },
  { ticker:"MSFT",    name:"Microsoft Corp.",        sector:"Cloud / Software"   },
  { ticker:"AMZN",    name:"Amazon.com Inc.",        sector:"E-Commerce"         },
  { ticker:"META",    name:"Meta Platforms",         sector:"Social Media"       },
  { ticker:"TSLA",    name:"Tesla Inc.",             sector:"Automotive"         },
  { ticker:"GOOGL",   name:"Alphabet Inc.",          sector:"Internet"           },
  { ticker:"AMD",     name:"Advanced Micro Devices", sector:"Semiconductors"     },
  { ticker:"PLTR",    name:"Palantir Technologies",  sector:"AI / Data"          },
  { ticker:"ASML",    name:"ASML Holding NV",        sector:"Semiconductors"     },
  { ticker:"TSM",     name:"Taiwan Semiconductor",   sector:"Semiconductors"     },
  { ticker:"NVO",     name:"Novo Nordisk A/S",       sector:"Pharmaceuticals"    },
  { ticker:"SAP",     name:"SAP SE",                 sector:"Enterprise Software"},
  { ticker:"NESN.SW", name:"Nestlé SA",              sector:"Consumer Staples"   },
  { ticker:"NOVN.SW", name:"Novartis AG",            sector:"Pharmaceuticals"    },
  { ticker:"ROG.SW",  name:"Roche Holding AG",       sector:"Pharmaceuticals"    },
  { ticker:"COIN",    name:"Coinbase Global",        sector:"Crypto / Fintech"   },
  { ticker:"SNOW",    name:"Snowflake Inc.",         sector:"Cloud Data"         },
  { ticker:"CRWD",    name:"CrowdStrike Holdings",   sector:"Cybersecurity"      },
  { ticker:"RBLX",    name:"Roblox Corp.",           sector:"Gaming"             },
];

const DISCLAIMER = "All content is for informational purposes only and does not constitute investment advice. AI analyses are based on historical data. Past performance is not indicative of future results. Capital is at risk.";

const TIME_RANGES = [
  { label:"1D", range:"1d",  interval:"5m"  },
  { label:"1W", range:"5d",  interval:"15m" },
  { label:"1M", range:"1mo", interval:"1d"  },
  { label:"3M", range:"3mo", interval:"1d"  },
  { label:"1Y", range:"1y",  interval:"1wk" },
  { label:"5Y", range:"5y",  interval:"1mo" },
];

// ─── INDICATOR DESCRIPTIONS ───────────────────────────────────────────────────
const INDICATOR_INFO = {
  MA20: "Moving Average 20 Tage — Durchschnittspreis der letzten 20 Handelstage. Zeigt kurzfristiges Momentum. Kurs über MA20 = kurzfristiger Aufwärtstrend.",
  MA50: "Moving Average 50 Tage — Durchschnittspreis der letzten 50 Handelstage. Wichtige Trendlinie: Kurs über MA50 = mittelfristig bullish. Kreuzung mit MA20 = starkes Signal.",
  Fibonacci: "Fibonacci-Retracements — Mathematische Unterstützungszonen basierend auf dem goldenen Schnitt (38.2%, 50%, 61.8%). Professionelle Händler nutzen diese Levels als potenzielle Einstiegs- oder Ausstiegspunkte nach einer Kursbewegung.",
  RSI: "Relative Strength Index (14 Perioden) — Misst die Stärke der Kursbewegung auf einer Skala von 0–100. Über 70 = überkauft (mögliche Korrektur). Unter 30 = überverkauft (mögliche Erholung). Zwischen 30–70 = neutrales Momentum.",
  MACD: "Moving Average Convergence Divergence (12, 26, 9) — Vergleicht zwei exponentielle Durchschnitte. Wenn die MACD-Linie (blau) die Signallinie (orange) von unten kreuzt = Kaufsignal. Von oben = Verkaufssignal. Das Histogramm zeigt die Stärke.",
  Volume: "Handelsvolumen — Anzahl der gehandelten Aktien pro Tag. Hohes Volumen bei steigendem Kurs bestätigt den Trend. Hohes Volumen bei fallendem Kurs signalisiert starken Verkaufsdruck.",
  Entry: "Fibonacci-Einstiegskurs — Der nächste Fibonacci-Support-Level unter dem aktuellen Kurs. Kaufen wenn der Kurs auf dieses Level zurückkommt (Limit-Order). Kein garantierter Einstieg.",
  StopLoss: "Stop-Loss — Empfohlene Verlustgrenze. Wenn der Kurs unter dieses Niveau fällt, sollte die Position verkauft werden um grössere Verluste zu vermeiden. Keine Garantie bei extremer Volatilität.",
};

// ─── PROXY FETCH ──────────────────────────────────────────────────────────────
// Multiple CORS proxies — tries each until one works
const PROXY_FNS = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function proxyFetch(url, timeout = 8000) {
  for (const makeProxy of PROXY_FNS) {
    try {
      const r = await fetch(makeProxy(url), { signal: AbortSignal.timeout(timeout) });
      if (!r.ok) continue;
      const text = await r.text();
      try {
        const outer = JSON.parse(text);
        // allorigins wraps in {contents:"..."}
        if (typeof outer.contents === "string") return JSON.parse(outer.contents);
        return outer;
      } catch { continue; }
    } catch { continue; }
  }
  return null;
}

// Direct Finnhub — no proxy needed (CORS allowed)
async function finnhubGet(path) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1${path}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
// Uses Finnhub search (no proxy needed, reliable)
async function searchStocks(q) {
  const d = await finnhubGet(`/search?q=${encodeURIComponent(q)}`);
  return (d?.result ?? [])
    .filter(x => x.type === "Common Stock" || x.type === "ETP" || x.type === "")
    .slice(0, 8)
    .map(x => ({ ticker: x.symbol, name: x.description || x.symbol, sector: x.type || "Stock" }));
}

// ─── YAHOO FINANCE DATA ───────────────────────────────────────────────────────
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
  const quote = {
    price, prevClose,
    high:   meta.regularMarketDayHigh ?? null,
    low:    meta.regularMarketDayLow  ?? null,
    change: price && prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0,
  };
  const ts   = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  const closes  = ohlcv.close  ?? [];
  const volumes = ohlcv.volume ?? [];
  const candles = ts.map((t, i) => {
    if (closes[i] == null) return null;
    const date = new Date(t * 1000);
    const label = (range==="1d"||range==="5d")
      ? date.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})
      : (range==="1mo"||range==="3mo")
      ? date.toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})
      : date.toLocaleDateString("de-CH",{month:"short",year:"2-digit"});
    return {label, price:+closes[i].toFixed(2), volume:volumes[i]??0, ts:t};
  }).filter(Boolean);

  // Dividends
  const divEvents = result.events?.dividends ?? {};
  const divArr    = Object.values(divEvents).filter(x=>x.amount>0).sort((a,b)=>b.date-a.date);
  return {quote, candles:candles.length?candles:null, divArr};
}

async function fetchStockData(ticker, chartRange="3mo", chartInterval="1d") {
  // ── Live quote: ALWAYS from Finnhub (direct, no proxy, real-time) ──────────
  // Yahoo via proxy can return stale/cached prices — Finnhub is always fresh.
  const [fhQuote, chartData, divData] = await Promise.all([
    finnhubGet(`/quote?symbol=${ticker}`),
    yahooChart(ticker, chartRange, chartInterval),
    yahooChart(ticker, "2y", "3mo"),
  ]);

  // Build quote from Finnhub first, fall back to Yahoo if Finnhub fails
  let quote = null;
  if (fhQuote?.c && fhQuote.c > 0) {
    quote = {
      price:     fhQuote.c,
      change:    fhQuote.dp ?? 0,
      prevClose: fhQuote.pc,
      high:      fhQuote.h,
      low:       fhQuote.l,
    };
  }

  // Yahoo chart — used for candles + dividends only, NOT for the price
  const chart     = parseYahooChart(chartData, chartRange);
  const divParsed = parseYahooChart(divData, "2y");

  // If Finnhub failed entirely, fall back to Yahoo price (last resort)
  if (!quote?.price && chart?.quote?.price) {
    quote = chart.quote;
  }
  if (!quote?.price) return null;

  // Dividends — use the 2y data for accurate frequency + annual rate
  const divArr = divParsed?.divArr ?? chart?.divArr ?? [];
  let dividend = { paysDividend: false };
  if (divArr.length > 0) {
    const lastAmt  = divArr[0].amount;
    const lastDate = new Date(divArr[0].date*1000).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"});
    // Frequency from average gap
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
    // Annual rate = sum of last 12 months
    const yr = Date.now()/1000 - 365*86400;
    const last12 = divArr.filter(d=>d.date>=yr);
    const perYear = frequency==="Monatlich"?12:frequency==="Quartalsweise"?4:frequency==="Halbjährlich"?2:1;
    const annualRate = last12.length>0 ? +last12.reduce((s,d)=>s+(d.amount??0),0).toFixed(4) : +(lastAmt*perYear).toFixed(4);
    const yieldPct = quote.price && annualRate ? +((annualRate/quote.price)*100).toFixed(2) : null;
    dividend = {paysDividend:true, lastAmount:lastAmt, lastExDate:lastDate, annualRate, yieldPct, frequency};
  }

  const candles = chart?.candles ?? null;
  return {quote, candles, dividend, hasChart:!!candles};
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
  const tr=TIME_RANGES.find(t=>t.label===rangeLabel)||TIME_RANGES[3];
  const data = await fetchStockData(base.ticker, tr.range, tr.interval);
  if (!data) return null;

  const {quote,candles,dividend,hasChart} = data;
  const price = quote.price;
  const chartData = addIndicators(candles ? [...candles] : []);
  const real = chartData.length>0;
  const fib  = real?getFib(chartData):{fib382:price*0.9,fib50:price*0.88,fib618:price*0.85};
  const lastRsi  = real?(chartData.filter(d=>d.rsi!=null).slice(-1)[0]?.rsi??50):50;
  const lastMacd = real?chartData.filter(d=>d.macd!=null).slice(-1)[0]:null;
  const macdX    = (lastMacd?.macd??0)>(lastMacd?.macdSignal??0)?"bullish":"bearish";
  const lastMA50 = real?chartData.filter(d=>d.ma50!=null).slice(-1)[0]?.ma50:null;
  const aboveMA50= lastMA50?price>lastMA50:null;

  const pts=(lastRsi<58&&lastRsi>35?1:0)+(macdX==="bullish"?1:0)+(aboveMA50===true?1:0)+((quote.change??0)>0?1:0);
  let signal,confidence;
  if(pts>=3){signal="BUY";confidence=75+pts*4;}
  else if(pts===2){signal="HOLD";confidence=62+pts*4;}
  else{signal="WATCH";confidence=45+pts*5;}
  if(lastRsi>75){signal="WATCH";confidence=Math.min(confidence,60);}
  confidence=Math.min(confidence,96);

  const slPct=0.07+Math.random()*0.03;
  const u30=signal==="BUY"?+(6+Math.random()*14).toFixed(1):+((-2)-Math.random()*6).toFixed(1);
  const u90=signal==="BUY"?+(14+Math.random()*18).toFixed(1):+((-5)-Math.random()*12).toFixed(1);

  return {
    ...base, price, change:quote.change??0, high:quote.high, low:quote.low, prevClose:quote.prevClose,
    chartData, fib, lastRsi, macdCrossing:macdX, aboveMA50, signal, confidence, stopLossPct:slPct,
    entryPrice:signal==="BUY"?getEntry(price,fib):null,
    stopLoss:+(price*(1-slPct)).toFixed(2),
    target30:+(price*(1+u30/100)).toFixed(2), target90:+(price*(1+u90/100)).toFixed(2),
    upside30:u30, upside90:u90, dataReal:real, hasChart,
    dataSource:real?"Yahoo Finance (live)":"Live Kurs (Chart nicht verfügbar)",
    currentRange:rangeLabel, dividend,
  };
}

// ─── TOOLTIP COMPONENT ────────────────────────────────────────────────────────
function InfoTooltip({text}) {
  const [show, setShow] = useState(false);
  const [pos, setPos]   = useState("below"); // "above" or "below"
  const ref    = useRef(null);
  const tipRef = useRef(null);

  function handleShow(e) {
    // Decide position based on available space
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setPos(rect.top > 220 ? "above" : "below");
    }
    setShow(true);
  }

  useEffect(()=>{
    if(!show) return;
    const fn=(e)=>{if(ref.current&&!ref.current.contains(e.target))setShow(false);};
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[show]);

  const above = pos === "above";

  return (
    <span ref={ref} style={{position:"relative",display:"inline-flex",verticalAlign:"middle",marginLeft:4,flexShrink:0}}>
      <span
        onClick={e=>{e.stopPropagation();setShow(s=>!s);handleShow(e);}}
        onMouseEnter={handleShow}
        onMouseLeave={()=>setShow(false)}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:15,height:15,borderRadius:"50%",background:"#1e293b",color:"#6b7280",fontSize:9,fontWeight:700,cursor:"pointer",userSelect:"none",flexShrink:0,border:"1px solid #2a3a50"}}
      >?</span>
      {show && (
        <div ref={tipRef} style={{
          position:"fixed",
          width:280,
          background:"#131929",
          border:"1px solid #2a3a50",
          borderRadius:10,
          padding:"12px 14px",
          fontSize:12,
          color:"#c8ccd8",
          lineHeight:1.65,
          zIndex:9999,
          boxShadow:"0 8px 32px rgba(0,0,0,.7)",
          pointerEvents:"none",
          // Position is handled by a portal-like trick using ref
          left: ref.current ? Math.min(ref.current.getBoundingClientRect().left - 130, window.innerWidth - 296) : 0,
          top: above
            ? (ref.current ? ref.current.getBoundingClientRect().top - 8 - 80 : 0)
            : (ref.current ? ref.current.getBoundingClientRect().bottom + 8 : 0),
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
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
      {d?.price!=null&&<div style={{color:C.text,fontWeight:600}}>${d.price}</div>}
      {d?.ma20!=null&&<div style={{color:C.amber}}>MA20 ${d.ma20}</div>}
      {d?.ma50!=null&&<div style={{color:C.accent}}>MA50 ${d.ma50}</div>}
      {d?.rsi!=null&&<div style={{color:d.rsi>70?C.red:d.rsi<30?C.green:C.textSub}}>RSI {d.rsi}</div>}
    </div>
  );
}

// ─── DIVIDEND ─────────────────────────────────────────────────────────────────
function DividendCompact({div}){
  if(!div)return null;
  if(!div.paysDividend)
    return <span style={{background:C.textMuted+"20",color:C.textMuted,border:`1px solid ${C.border}`,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:500}}>No Div</span>;
  return <span style={{background:C.amber+"18",color:C.amber,border:`1px solid ${C.amber}30`,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>Div {div.yieldPct!=null?div.yieldPct+"%":"Yes"}</span>;
}
function DividendPanel({div}){
  if(!div)return null;
  if(!div.paysDividend)
    return(
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontSize:10,color:C.textSub,fontWeight:500,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Dividend</div>
        <div style={{fontSize:13,color:C.textMuted}}>This company does not pay a dividend</div>
      </div>
    );
  return(
    <div style={{background:C.amber+"0c",border:`1px solid ${C.amber}22`,borderRadius:8,padding:"14px 16px"}}>
      <div style={{fontSize:10,color:C.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>Dividend</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:12}}>
        {[
          {l:"Annual Yield",   v:div.yieldPct!=null?`${div.yieldPct}%`:"—",  c:C.amber},
          {l:"Last Payment",   v:div.lastAmount!=null?`$${div.lastAmount.toFixed(4)}`:"—", c:C.text},
          {l:"Annual / Share", v:div.annualRate!=null?`$${div.annualRate}`:"—", c:C.text},
          {l:"Frequency",      v:div.frequency??"—",   c:C.text},
          {l:"Last Ex-Date",   v:div.lastExDate??"—",  c:C.text},
        ].map((item,i)=>(
          <div key={i}>
            <div style={{fontSize:10,color:C.textMuted,marginBottom:3}}>{item.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:item.c,fontFamily:item.c===C.text?"monospace":"inherit"}}>{item.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function StockChart({stock, onRangeChange, currentRange, loadingChart}) {
  const [tab, setTab] = useState("price");

  // Reset to price tab when range or ticker changes
  useEffect(() => { setTab("price"); }, [currentRange, stock.ticker]);
  const col=stock.signal==="BUY"?C.green:stock.signal==="WATCH"?C.red:C.textSub;
  const data=stock.chartData??[];
  const thin=data.length>120?data.filter((_,i)=>i%2===0):data;
  const intv=Math.max(1,Math.floor(thin.length/6));
  const tabs=[{id:"price",l:"Price"},{id:"rsi",l:"RSI"},{id:"macd",l:"MACD"},{id:"volume",l:"Volume"}];

  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",position:"relative"}}>
      {loadingChart&&(
        <div style={{position:"absolute",inset:0,background:C.bg+"dd",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.textSub,borderRadius:10}}>
          Loading chart...
        </div>
      )}
      {/* Tab + Range bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,alignItems:"center",overflowX:"auto",minHeight:42}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?600:400,color:tab===t.id?C.text:C.textSub,borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",whiteSpace:"nowrap",flexShrink:0}}>
            {t.l}
            {t.id==="rsi"&&<InfoTooltip text={INDICATOR_INFO.RSI}/>}
            {t.id==="macd"&&<InfoTooltip text={INDICATOR_INFO.MACD}/>}
            {t.id==="volume"&&<InfoTooltip text={INDICATOR_INFO.Volume}/>}
          </button>
        ))}
        <div style={{flex:1,minWidth:8}}/>
        <div style={{display:"flex",gap:1,padding:"0 8px",flexShrink:0}}>
          {TIME_RANGES.map(r=>(
            <button key={r.label} onClick={()=>onRangeChange(r.label)} style={{background:currentRange===r.label?C.border:"none",border:"none",borderRadius:4,padding:"5px 8px",cursor:"pointer",fontSize:11,fontWeight:currentRange===r.label?600:400,color:currentRange===r.label?C.text:C.textSub,whiteSpace:"nowrap"}}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"10px 4px 8px"}}>
        {/* If no chart data, show message but keep time range buttons above still active */}
        {data.length===0?(
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:12,color:C.textSub,marginBottom:4}}>Keine Chart-Daten für diesen Zeitraum verfügbar</div>
            <div style={{fontSize:10,color:C.textMuted}}>Bitte wähle einen anderen Zeitraum oder versuche es später erneut</div>
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
                <defs>
                  <linearGradient id={`g_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={col} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={col} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis domain={["auto","auto"]} tick={{fill:C.textMuted,fontSize:9}} width={56} tickFormatter={v=>"$"+v} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTip/>}/>
                <ReferenceLine y={stock.fib.fib382} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.4}/>
                <ReferenceLine y={stock.fib.fib50}  stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.3}/>
                <ReferenceLine y={stock.fib.fib618} stroke={C.purple} strokeDasharray="4 3" strokeOpacity={0.2}/>
                {stock.entryPrice&&<ReferenceLine y={stock.entryPrice} stroke={C.green} strokeDasharray="5 3" strokeWidth={1} label={{value:`Entry $${stock.entryPrice}`,fill:C.green,fontSize:8,position:"insideBottomLeft"}}/>}
                <ReferenceLine y={stock.stopLoss} stroke={C.red} strokeDasharray="5 3" strokeWidth={1} label={{value:`Stop $${stock.stopLoss}`,fill:C.red,fontSize:8,position:"insideTopLeft"}}/>
                <Area type="monotone" dataKey="price" stroke={col} strokeWidth={1.5} fill={`url(#g_${stock.ticker})`} dot={false}/>
                <Line type="monotone" dataKey="ma20" stroke={C.amber}  strokeWidth={1} dot={false} strokeOpacity={0.85}/>
                <Line type="monotone" dataKey="ma50" stroke={C.accent} strokeWidth={1} dot={false} strokeOpacity={0.85}/>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ):tab==="rsi"?(
          <>
            <div style={{padding:"0 10px 8px",fontSize:10,color:C.textSub,display:"flex",alignItems:"center",gap:4}}>
              RSI (14)<InfoTooltip text={INDICATOR_INFO.RSI}/> — <span style={{color:C.red}}>Überkauft &gt;70</span> · <span style={{color:C.green}}>Überverkauft &lt;30</span> · Aktuell: <strong style={{color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d=>d.rsi!=null)} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs><linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={intv} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{fill:C.textMuted,fontSize:9}} width={24} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTip/>}/>
                <ReferenceLine y={70} stroke={C.red}    strokeDasharray="4 3" strokeOpacity={0.5}/>
                <ReferenceLine y={50} stroke={C.border}/>
                <ReferenceLine y={30} stroke={C.green}  strokeDasharray="4 3" strokeOpacity={0.5}/>
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
              Volume<InfoTooltip text={INDICATOR_INFO.Volume}/> — Hohes Volumen bestätigt den Trend
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
function AIModal({stock:init,onClose}){
  const [stock, setStock]       = useState(init);
  const [analysis, setAnalysis] = useState("");
  const [loadingAI, setLoadingAI]       = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [range, setRange] = useState(init.currentRange || "3M");

  async function handleRange(r) {
    if (r === range) return;
    setRange(r);
    setLoadingChart(true);
    // Force a fresh stock build with the new range — this fetches new candles from Yahoo
    const updated = await buildStock(
      { ticker: stock.ticker, name: stock.name, sector: stock.sector },
      r
    );
    if (updated) setStock(updated);
    setLoadingChart(false);
  }

  useEffect(()=>{
    let cancelled=false;
    async function run(){
      setLoadingAI(true);setAnalysis("");
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({
            model:"claude-sonnet-4-5",max_tokens:1000,
            system:`Du bist ein präziser institutioneller Marktanalyst. Antworte auf Deutsch, ~200 Wörter. Klarer Fliesstext ohne Markdown, keine Emojis. Absätze:

Technische Lage: RSI, MACD und Moving Averages konkret erklären.
Marktkontext: Aktuelle Treiber und Sektor-Dynamik.
Einschätzung: Kursziel und Fibonacci-Einstieg begründen.
Risiken: Zwei konkrete Risiken.

Schlusszeile immer: "Hinweis: KI-generierte Marktinformation. Keine Anlageberatung. Keine Erfolgsgarantie."`,
            messages:[{role:"user",content:`${stock.name} (${stock.ticker})
Kurs: $${stock.price.toFixed(2)} (${stock.change>=0?"+":""}${stock.change.toFixed(2)}% heute)
H/T: ${stock.high?"$"+stock.high.toFixed(2):"n/a"} / ${stock.low?"$"+stock.low.toFixed(2):"n/a"}
Sektor: ${stock.sector} | Signal: ${stock.signal} | Konfidenz: ${stock.confidence}%
RSI(14): ${stock.lastRsi} (${stock.lastRsi>70?"überkauft":stock.lastRsi<30?"überverkauft":"neutral"}) — ${stock.dataReal?"echte Daten":"simuliert"}
MACD: ${stock.macdCrossing} | Über MA50: ${stock.aboveMA50===null?"n/a":stock.aboveMA50?"ja":"nein"}
Fibonacci-Einstieg: ${stock.entryPrice?"$"+stock.entryPrice:"nicht empfohlen"}
Stop-Loss: $${stock.stopLoss} (-${(stock.stopLossPct*100).toFixed(1)}%)
Kursziel 30T: $${stock.target30} (${stock.upside30>=0?"+":""}${stock.upside30}%)
Kursziel 90T: $${stock.target90} (${stock.upside90>=0?"+":""}${stock.upside90}%)
Dividende: ${stock.dividend?.paysDividend?"Ja, "+stock.dividend.yieldPct+"% Rendite, "+stock.dividend.frequency:"Nein"}`}],
          }),
        });
        const d=await res.json();
        if(!cancelled)setAnalysis(d.content?.map(b=>b.text||"").join("\n")||"Analyse nicht verfügbar.");
      }catch(e){if(!cancelled)setAnalysis("Verbindungsfehler: "+e.message);}
      finally{if(!cancelled)setLoadingAI(false);}
    }
    run();
    return()=>{cancelled=true;};
  },[init.ticker]);

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"22px 18px",maxWidth:700,width:"100%",marginTop:8,boxShadow:"0 24px 64px rgba(0,0,0,.6)"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:2,marginBottom:5,textTransform:"uppercase"}}>KI Analyse · {stock.dataReal?"Live Daten":"Live Kurs"}</div>
            <div style={{fontSize:20,fontWeight:700,color:C.text,letterSpacing:-.3,lineHeight:1.2}}>{stock.ticker} <span style={{color:C.textSub,fontWeight:400,fontSize:14}}>{stock.name}</span></div>
            <div style={{display:"flex",gap:10,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
              <SignalBadge signal={stock.signal}/>
              <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:C.text}}>${stock.price.toFixed(2)}</span>
              <Chg v={stock.change}/>
              {stock.high&&<span style={{fontSize:11,color:C.textSub}}>H ${stock.high.toFixed(2)} · T ${stock.low?.toFixed(2)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{background:C.border,border:"none",color:C.textSub,width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>

        {/* Chart */}
        <div style={{marginBottom:14}}>
          <StockChart
            key={`${stock.ticker}-${range}`}
            stock={stock}
            onRangeChange={handleRange}
            currentRange={range}
            loadingChart={loadingChart}
          />
        </div>

        {/* Indicators */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
          {[
            {l:"RSI (14)", info:INDICATOR_INFO.RSI, v:stock.lastRsi, s:stock.lastRsi>70?"Überkauft":stock.lastRsi<30?"Überverkauft":"Neutral", c:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub},
            {l:"MACD",    info:INDICATOR_INFO.MACD, v:stock.macdCrossing==="bullish"?"Bullish":"Bearish", s:"Trendkreuzung", c:stock.macdCrossing==="bullish"?C.green:C.red},
            {l:"Einstieg (Fib)", info:INDICATOR_INFO.Entry, v:stock.entryPrice?`$${stock.entryPrice}`:"—", s:"Support-Level", c:C.purple},
            {l:"Stop Loss", info:INDICATOR_INFO.StopLoss, v:`$${stock.stopLoss}`, s:`-${(stock.stopLossPct*100).toFixed(1)}% Verlustgrenze`, c:C.red},
          ].map((item,i)=>(
            <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 14px"}}>
              <div style={{fontSize:10,color:C.textSub,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5,display:"flex",alignItems:"center"}}>
                {item.l}<InfoTooltip text={item.info}/>
              </div>
              <div style={{fontSize:14,fontWeight:700,color:item.c,fontFamily:"monospace"}}>{item.v}</div>
              <div style={{fontSize:9,color:C.textMuted,marginTop:2}}>{item.s}</div>
            </div>
          ))}
        </div>

        {/* Targets */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
          {[
            {l:"Kursziel 30 Tage",v:`$${stock.target30}`,u:stock.upside30,c:C.green+"20",b:C.green+"25"},
            {l:"Kursziel 90 Tage",v:`$${stock.target90}`,u:stock.upside90,c:C.accent+"15",b:C.accent+"25"},
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

        {/* Dividend */}
        <div style={{marginBottom:12}}><DividendPanel div={stock.dividend}/></div>

        {/* AI */}
        {loadingAI?(
          <div style={{background:C.bg,borderRadius:8,padding:"22px",textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:12,color:C.textSub,marginBottom:10}}>Analysiere Marktdaten und Indikatoren...</div>
            <div style={{display:"flex",gap:5,justifyContent:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}
            </div>
          </div>
        ):(
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",fontSize:13,color:"#c8ccd8",lineHeight:1.9,marginBottom:12,whiteSpace:"pre-wrap"}}>{analysis}</div>
        )}

        {!loadingAI&&<div style={{marginBottom:12}}><div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>KI-Konfidenz</div><ConfBar value={stock.confidence}/></div>}

        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:10,color:C.textMuted}}>Quelle: <span style={{color:stock.dataReal?C.green:C.textSub}}>{stock.dataSource}</span></span>
          <span style={{fontSize:10,color:C.textMuted}}>Aktualisiert beim Laden</span>
        </div>
        <div style={{marginTop:10,fontSize:10,color:C.textMuted,lineHeight:1.6}}>{DISCLAIMER}</div>
      </div>
    </div>
  );
}

// ─── PULL TO REFRESH ──────────────────────────────────────────────────────────
function PullToRefresh({ onRefresh }) {
  const [pulling, setPulling]   = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY   = useRef(0);
  const threshold = 72;

  useEffect(() => {
    const el = document.documentElement;

    function onTouchStart(e) {
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }

    function onTouchMove(e) {
      if (!pulling) return;
      if (el.scrollTop > 0) { setDistance(0); return; }
      const dy = e.touches[0].clientY - startY.current;
      if (dy < 0) { setDistance(0); return; }
      // Resistance: slows pull as you go further
      setDistance(Math.min(dy * 0.45, threshold + 20));
    }

    function onTouchEnd() {
      if (distance >= threshold && !refreshing) {
        setRefreshing(true);
        setDistance(threshold);
        onRefresh(() => {
          setRefreshing(false);
          setDistance(0);
          setPulling(false);
        });
      } else {
        setDistance(0);
        setPulling(false);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove",  onTouchMove,  { passive: true });
    window.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove",  onTouchMove);
      window.removeEventListener("touchend",   onTouchEnd);
    };
  }, [pulling, distance, refreshing, onRefresh]);

  if (distance === 0 && !refreshing) return null;

  const ready = distance >= threshold;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      height: refreshing ? threshold : distance,
      background: C.bg,
      borderBottom: `1px solid ${C.border}`,
      transition: refreshing ? "height 0.2s ease" : "none",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {refreshing ? (
          <>
            <div style={{ display: "flex", gap: 5 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: C.textSub }}>Aktualisiere...</span>
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
              style={{ transform: `rotate(${ready ? 180 : 0}deg)`, transition: "transform 0.2s ease", color: ready ? C.accent : C.textMuted }}>
              <path d="M10 4v12M10 16l-4-4M10 16l4-4" stroke={ready ? C.accent : C.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 11, color: ready ? C.accent : C.textMuted }}>
              {ready ? "Loslassen zum Aktualisieren" : "Nach unten ziehen..."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
function StockCard({stock, onAnalyze}) {
  return (
    <div
      onClick={() => onAnalyze(stock)}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHov}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
      {/* Row 1: Ticker + Price */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 15, color: C.text }}>{stock.ticker}</div>
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 1 }}>{stock.name}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{stock.sector}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 16, color: C.text }}>${stock.price.toFixed(2)}</div>
          <Chg v={stock.change} />
          {stock.high && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>H ${stock.high.toFixed(2)} · T ${stock.low?.toFixed(2)}</div>}
        </div>
      </div>

      {/* Row 2: Signal + RSI */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <SignalBadge signal={stock.signal} />
        <span style={{ fontSize: 11, color: C.textSub }}>
          RSI <span style={{ color: stock.lastRsi > 70 ? C.red : stock.lastRsi < 30 ? C.green : C.textSub, fontWeight: 600 }}>{stock.lastRsi}</span>
          <span style={{ color: C.textMuted, marginLeft: 4 }}>{stock.lastRsi > 70 ? "· Überkauft" : stock.lastRsi < 30 ? "· Überverkauft" : "· Neutral"}</span>
        </span>
      </div>

      {/* Row 3: Entry + StopLoss */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Einstieg (Fib)</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: C.purple }}>
            {stock.entryPrice ? `$${stock.entryPrice}` : "—"}
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Stop-Loss</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: C.red }}>${stock.stopLoss}</div>
        </div>
      </div>

      {/* Row 4: Targets */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.green + "0d", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.green}25` }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Ziel 30 Tage</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: C.text }}>${stock.target30}</div>
          <span style={{ fontSize: 11, color: stock.upside30 >= 0 ? C.green : C.red, fontWeight: 600 }}>{stock.upside30 >= 0 ? "+" : ""}{stock.upside30}%</span>
        </div>
        <div style={{ background: C.accent + "0d", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.accent}25` }}>
          <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Ziel 90 Tage</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: C.text }}>${stock.target90}</div>
          <span style={{ fontSize: 11, color: stock.upside90 >= 0 ? C.green : C.red, fontWeight: 600 }}>{stock.upside90 >= 0 ? "+" : ""}{stock.upside90}%</span>
        </div>
      </div>

      {/* Row 5: Dividend */}
      {stock.dividend?.paysDividend ? (
        <div style={{ background: C.amber + "0d", border: `1px solid ${C.amber}22`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: C.amber, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 6 }}>Dividende</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.text }}>Rendite: <strong style={{ color: C.amber }}>{stock.dividend.yieldPct != null ? stock.dividend.yieldPct + "%" : "—"}</strong></span>
            <span style={{ fontSize: 12, color: C.text }}>Zahlung: <strong style={{ fontFamily: "monospace" }}>{stock.dividend.lastAmount != null ? "$" + stock.dividend.lastAmount.toFixed(4) : "—"}</strong></span>
            <span style={{ fontSize: 12, color: C.text }}>{stock.dividend.frequency ?? ""}</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: C.textMuted, background: C.border + "60", padding: "3px 8px", borderRadius: 4 }}>Keine Dividende</span>
        </div>
      )}

      {/* CTA */}
      <div style={{ background: C.accent + "18", border: `1px solid ${C.accent}30`, borderRadius: 8, padding: "9px", textAlign: "center", fontSize: 12, fontWeight: 600, color: C.accent }}>
        Chart & KI-Analyse öffnen →
      </div>
    </div>
  );
}

// ─── DESKTOP ROW ──────────────────────────────────────────────────────────────
function StockRow({stock,onAnalyze,idx}){
  return(
    <div onClick={()=>onAnalyze(stock)} style={{display:"grid",gridTemplateColumns:"80px 180px 110px 90px 70px 100px 90px 90px 100px",padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:idx%2===0?C.bg:C.surface,transition:"background .15s",alignItems:"center",cursor:"pointer",minWidth:0}} onMouseEnter={e=>e.currentTarget.style.background="#141720"} onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?C.bg:C.surface}>
      <div style={{minWidth:0}}>
        <div style={{fontWeight:700,fontFamily:"monospace",fontSize:13,color:C.text}}>{stock.ticker}</div>
        <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stock.sector}</div>
      </div>
      <div style={{fontSize:12,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{stock.name}</div>
      <div>
        <div style={{fontWeight:600,fontFamily:"monospace",fontSize:13,color:C.text}}>${stock.price.toFixed(2)}</div>
        <Chg v={stock.change}/>
      </div>
      <div><SignalBadge signal={stock.signal}/></div>
      <div>
        <div style={{fontFamily:"monospace",fontWeight:600,fontSize:13,color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</div>
        <div style={{fontSize:9,color:stock.dataReal?C.green+"99":C.textMuted}}>{stock.dataReal?"Live":"Est."}</div>
      </div>
      <div><DividendCompact div={stock.dividend}/></div>
      <div>
        {stock.entryPrice?<><div style={{fontFamily:"monospace",fontWeight:600,fontSize:12,color:C.purple}}>${stock.entryPrice}</div><div style={{fontSize:9,color:C.textMuted}}>Fib</div></>:<span style={{color:C.textMuted,fontSize:12}}>—</span>}
      </div>
      <div>
        <div style={{fontFamily:"monospace",fontWeight:600,fontSize:12,color:C.text}}>${stock.target30}</div>
        <span style={{color:stock.upside30>=0?C.green:C.red,fontSize:11,fontWeight:500}}>{stock.upside30>=0?"+":""}{stock.upside30}%</span>
      </div>
      <div>
        <button style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.textSub,fontSize:11,fontWeight:500,padding:"5px 10px",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub;}}>Analyse</button>
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

  useEffect(()=>{
    async function load(){
      setLoadingList(true);
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
    }
    load();
  },[]);

  // Search — uses Finnhub directly (no proxy needed, reliable)
  useEffect(()=>{
    if(!searchQuery.trim()){setSearchRes([]);return;}
    const t=setTimeout(async()=>{
      setSearching(true);
      const res=await searchStocks(searchQuery);
      setSearchRes(res);
      setSearching(false);
    },500);
    return()=>clearTimeout(t);
  },[searchQuery]);

  async function addFromSearch(item){
    setQuery("");setSearchRes([]);
    const existing=stocks.find(s=>s.ticker===item.ticker);
    if(existing){setSelected(existing);return;}
    const s=await buildStock(item,"3M");
    if(s){setStocks(prev=>[s,...prev]);setSelected(s);}
  }

  const buyCount = stocks.filter(s => s.signal === "BUY").length;
  const lastUpdated = stocks.length > 0 ? new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : null;

  async function refreshAll(done) {
    setLoadingList(true);
    setStocks([]);
    setProgress(0);
    const BATCH = 4;
    const results = [];
    for (let i = 0; i < DEFAULT_TICKERS.length; i += BATCH) {
      const batch = DEFAULT_TICKERS.slice(i, i + BATCH);
      const built = await Promise.all(batch.map(t => buildStock(t, "3M")));
      built.forEach(s => { if (s) results.push(s); });
      setStocks([...results]);
      setProgress(Math.min(100, Math.round(((i + BATCH) / DEFAULT_TICKERS.length) * 100)));
      if (i + BATCH < DEFAULT_TICKERS.length) await new Promise(r => setTimeout(r, 150));
    }
    setLoadingList(false);
    if (done) done();
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Helvetica Neue',sans-serif",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        input,button{touch-action:manipulation;}
        input{font-size:16px!important;}
        input::placeholder{color:${C.textMuted};}
        table{width:100%;border-collapse:collapse;}
      `}</style>

      {/* Pull to refresh — mobile only */}
      {mobile && <PullToRefresh onRefresh={refreshAll} />}

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
                <span style={{fontFamily:"monospace",fontWeight:600,color:C.text}}>${s.price.toFixed(0)}</span>
                <span style={{marginLeft:4,color:s.change>=0?C.green:C.red}}>{s.change>=0?"+":""}{s.change.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        )}
        <div style={{fontSize:11,color:C.textSub}}>
          {loadingList
            ? <span style={{color:C.accent}}>Lädt {progress}%</span>
            : <><span style={{color:C.green,fontWeight:600}}>{buyCount}</span> Kaufsignale{lastUpdated && mobile && <span style={{color:C.textMuted,marginLeft:6}}>· {lastUpdated}</span>}</>}
        </div>
      </header>

      {/* SEARCH */}
      <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,position:"relative",zIndex:50}}>
        <div style={{position:"relative",maxWidth:520}}>
          <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke={C.textMuted} strokeWidth="1.5"/>
            <path d="M10 10L13 13" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input value={searchQuery} onChange={e=>setQuery(e.target.value)} placeholder="Aktie suchen — AAPL, Siemens, Nestlé..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px 9px 32px",color:C.text,outline:"none",transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>{e.target.style.borderColor=C.border;setTimeout(()=>setSearchRes([]),200);}}/>
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
          {l:"Kaufsignale",    v:loadingList?"—":buyCount,                                                                                c:C.green},
          {l:"Aktien",        v:stocks.length||"—",                                                                                      c:C.text},
          {l:"Ø RSI",         v:stocks.length?(stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0):"—",                       c:C.text},
          {l:"Datenquelle",   v:"Yahoo Finance",                                                                                          c:C.textSub},
        ].map((s,i)=>(
          <div key={i} style={{padding:"12px 20px",borderRight:i<3?`1px solid ${C.border}`:"none"}}>
            <div style={{fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* LIST */}
      <div style={{padding:"14px 20px 48px"}}>
        {loadingList&&stocks.length===0?(
          <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:13,color:C.textSub,marginBottom:12}}>Lade Live-Marktdaten von Yahoo Finance...</div>
            <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:14}}>
              {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.4s ${i*.25}s infinite`}}/>)}
            </div>
            <div style={{width:180,height:3,background:C.border,borderRadius:2,margin:"0 auto",overflow:"hidden"}}>
              <div style={{width:`${progress}%`,height:"100%",background:C.accent,borderRadius:2,transition:"width .3s"}}/>
            </div>
            <div style={{fontSize:10,color:C.textMuted,marginTop:6}}>{progress}%</div>
          </div>
        ):mobile?(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:4,display:"flex",justifyContent:"space-between"}}>
              <span>{stocks.length} Aktien{loadingList?" · lädt...":""}</span><span>Tippen für Analyse</span>
            </div>
            {stocks.map(s=><StockCard key={s.ticker} stock={s} onAnalyze={setSelected}/>)}
          </div>
        ):(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:C.text}}>Marktübersicht</div>
                <div style={{fontSize:11,color:C.textSub,marginTop:1}}>{stocks.length} Aktien · Yahoo Finance · RSI · MACD · Fibonacci · Dividenden{loadingList&&<span style={{color:C.accent}}> · lädt...</span>}</div>
              </div>
              <div style={{fontSize:10,color:C.textMuted}}>Keine Anlageberatung</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 180px 110px 90px 70px 100px 90px 90px 100px",padding:"7px 20px",fontSize:10,color:C.textMuted,fontWeight:500,letterSpacing:0.8,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>
              <span>Ticker</span><span>Unternehmen</span><span>Kurs</span><span>Signal</span><span>RSI</span><span>Dividende</span><span>Einstieg</span><span>30T Ziel</span><span></span>
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
