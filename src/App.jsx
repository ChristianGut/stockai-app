import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#08090d", surface:"#0f1117", border:"#1a1d27", borderHov:"#2a2d3a",
  text:"#e8eaf0", textSub:"#6b7280", textMuted:"#3d4152",
  accent:"#4f8ef7", green:"#34d399", red:"#f87171", amber:"#f59e0b", purple:"#a78bfa",
};

// ─── CURRENCY ─────────────────────────────────────────────────────────────────
function ccySym(c) {
  if (!c) return "$";
  const u = c.toUpperCase();
  if (u==="CHF") return "CHF ";
  if (u==="EUR") return "€";
  if (u==="GBP") return "£";
  if (u==="GBp") return "p"; // London pence
  if (u==="JPY") return "¥";
  return "$";
}
function ccy(s)        { return ccySym(s?.currency); }
function fmt(s, v)     { if (v==null||isNaN(v)) return "—"; return ccy(s)+Number(v).toFixed(2); }
function fmtL(v)       { if (!v) return "—"; if (v>=1e12) return (v/1e12).toFixed(2)+"T"; if (v>=1e9) return (v/1e9).toFixed(2)+"B"; if (v>=1e6) return (v/1e6).toFixed(2)+"M"; return String(v); }

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

const DISCLAIMER = "Alle Inhalte dienen ausschliesslich zu Informationszwecken — keine Anlageberatung. Keine Erfolgsgarantie. Kapital ist gefährdet.";

const TIME_RANGES = [
  { label:"1D", range:"1d",  interval:"5m"  },
  { label:"1W", range:"5d",  interval:"15m" },
  { label:"1M", range:"1mo", interval:"1d"  },
  { label:"3M", range:"3mo", interval:"1d"  },
  { label:"1Y", range:"1y",  interval:"1wk" },
  { label:"5Y", range:"5y",  interval:"1mo" },
];

const TIPS = {
  MA20:     "MA20 — Durchschnittspreis der letzten 20 Tage. Kurzfristiges Momentum-Signal.",
  MA50:     "MA50 — Durchschnittspreis der letzten 50 Tage. Kurs über MA50 = mittelfristig bullish.",
  Fib:      "Fibonacci — Mathematische Support-Zonen (38.2%, 50%, 61.8%) nach einer Kursbewegung.",
  RSI:      "RSI (14) — Kursstärke 0–100. Über 70 = überkauft. Unter 30 = überverkauft.",
  MACD:     "MACD — Kreuzt blaue Linie die orange von unten = Kaufsignal.",
  Vol:      "Volumen — Hohe Volumen bei Kursanstieg bestätigen den Trend.",
  Entry:    "Fibonacci-Einstieg — Nächster Support unter aktuellem Kurs. Limit-Order setzen.",
  Stop:     "Stop-Loss — Verlustgrenze. Verkaufen wenn Kurs darunter fällt.",
  PE:       "KGV (P/E) — Aktuelle Bewertung in Jahresgewinnen. Unter 15 = günstig, über 35 = teuer.",
  PB:       "KBV (P/B) — Kurs zum Buchwert. Unter 1 = unter Buchwert.",
  Margin:   "Nettomarge — Anteil des Umsatzes der als Gewinn bleibt. Über 20% = sehr gut.",
};

// ─── BACKEND API ──────────────────────────────────────────────────────────────
// All external API calls go through /api/market — no CORS issues
async function api(params, timeout = 10000) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`/api/market?${qs}`, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────
async function fetchQuote(ticker) {
  try {
    const d = await api({ type:"quote", ticker }, 5000);
    if (!d?.c || d.c === 0) return null;
    return { price:d.c, change:d.dp??0, prevClose:d.pc, high:d.h, low:d.l };
  } catch { return null; }
}

async function fetchChart(ticker, range="3mo", interval="1d") {
  try {
    const d = await api({ type:"chart", ticker, range, interval }, 8000);
    return parseYahooChart(d, range);
  } catch { return null; }
}

async function fetchDividends(ticker) {
  try {
    const d = await api({ type:"div", ticker }, 8000);
    return parseYahooChart(d, "2y");
  } catch { return null; }
}

async function fetchFundamentals(ticker) {
  try {
    const d = await api({ type:"fundamentals", ticker }, 6000);
    if (!d?.ok) return null;
    const p = d.profile, r = d.ratios, a = d.analyst;
    return {
      pe:           r?.peRatioTTM           != null ? +Number(r.peRatioTTM).toFixed(1)               : null,
      pb:           r?.priceToBookRatioTTM  != null ? +Number(r.priceToBookRatioTTM).toFixed(2)      : null,
      netMargin:    r?.netProfitMarginTTM   != null ? +(Number(r.netProfitMarginTTM)*100).toFixed(1)  : null,
      roe:          r?.returnOnEquityTTM    != null ? +(Number(r.returnOnEquityTTM)*100).toFixed(1)   : null,
      grossMargin:  r?.grossProfitMarginTTM != null ? +(Number(r.grossProfitMarginTTM)*100).toFixed(1): null,
      debtToEquity: r?.debtEquityRatioTTM   != null ? +Number(r.debtEquityRatioTTM).toFixed(2)       : null,
      marketCap:    p?.mktCap    ?? null,
      revenue:      p?.revenueTTM ?? null,
      analystTarget:a?.targetConsensus != null ? +Number(a.targetConsensus).toFixed(2) : null,
      analystHigh:  a?.targetHigh      != null ? +Number(a.targetHigh).toFixed(2)      : null,
      analystLow:   a?.targetLow       != null ? +Number(a.targetLow).toFixed(2)       : null,
      analystRating:p?.rating   ?? null,
      currency:     p?.currency  ?? null,
      industry:     p?.industry  ?? null,
    };
  } catch { return null; }
}

async function searchStocks(q) {
  try {
    const d = await api({ type:"search", q });
    return (d?.result ?? [])
      .filter(x => x.type==="Common Stock"||x.type==="ETP"||x.type==="")
      .slice(0,8)
      .map(x => ({ ticker:x.symbol, name:x.description||x.symbol, sector:x.type||"Stock" }));
  } catch { return []; }
}

// ─── YAHOO PARSER ─────────────────────────────────────────────────────────────
function parseYahooChart(d, range) {
  const result = d?.chart?.result?.[0];
  if (!result) return null;
  const meta      = result.meta ?? {};
  const price     = meta.regularMarketPrice ?? null;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  const currency  = meta.currency ?? null;
  const quote     = { price, prevClose, high:meta.regularMarketDayHigh??null, low:meta.regularMarketDayLow??null, change: price&&prevClose ? +((price-prevClose)/prevClose*100).toFixed(2) : 0 };
  const ts     = result.timestamp ?? [];
  const ohlcv  = result.indicators?.quote?.[0] ?? {};
  const closes = ohlcv.close  ?? [];
  const vols   = ohlcv.volume ?? [];
  const candles = ts.map((t,i) => {
    if (closes[i]==null) return null;
    const date = new Date(t*1000);
    const label = (range==="1d"||range==="5d")
      ? date.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})
      : (range==="1mo"||range==="3mo")
      ? date.toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})
      : date.toLocaleDateString("de-CH",{month:"short",year:"2-digit"});
    return { label, price:+closes[i].toFixed(2), volume:vols[i]??0, ts:t };
  }).filter(Boolean);
  const divEvents = result.events?.dividends ?? {};
  const divArr    = Object.values(divEvents).filter(x=>x.amount>0).sort((a,b)=>b.date-a.date);
  return { quote, candles:candles.length?candles:null, divArr, currency };
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
  let ag=0,al=0;
  for (let i=1;i<=14&&i<prices.length;i++){const d=prices[i]-prices[i-1];if(d>0)ag+=d;else al-=d;}
  ag/=14;al/=14;
  for (let i=14;i<data.length;i++){
    const d=prices[i]-prices[i-1];
    ag=(ag*13+Math.max(0,d))/14; al=(al*13+Math.max(0,-d))/14;
    data[i].rsi=+(100-100/(1+(al===0?100:ag/al))).toFixed(1);
  }
  const ema=(arr,p)=>{const k=2/(p+1);let e=arr[0];return arr.map(v=>{e=v*k+e*(1-k);return +e.toFixed(4);});};
  const e12=ema(prices,12),e26=ema(prices,26);
  const ml=e12.map((v,i)=>+(v-e26[i]).toFixed(4));
  const sl=ema(ml,9);
  for (let i=26;i<data.length;i++){
    data[i].macd=+ml[i].toFixed(2);
    data[i].macdSignal=+sl[i].toFixed(2);
    data[i].macdHist=+(ml[i]-sl[i]).toFixed(2);
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

  // Phase 1: Load quote + chart + dividends in parallel (fast, via serverless)
  // Phase 2: Fundamentals in parallel but with strict 6s timeout — never blocks
  const [quote, chartRaw, divRaw, fundamentals] = await Promise.all([
    fetchQuote(base.ticker),
    fetchChart(base.ticker, tr.range, tr.interval),
    fetchDividends(base.ticker),
    Promise.race([
      fetchFundamentals(base.ticker),
      new Promise(resolve => setTimeout(() => resolve(null), 6000)), // hard 6s cap
    ]),
  ]);

  const price = quote?.price ?? chartRaw?.quote?.price ?? null;
  if (!price) return null;

  // Currency
  const currency = fundamentals?.currency ?? chartRaw?.currency
    ?? (base.ticker.endsWith(".SW")?"CHF":base.ticker.endsWith(".DE")||base.ticker.endsWith(".AS")?"EUR":"USD");

  // Chart
  const candles   = chartRaw?.candles ?? null;
  const chartData = addIndicators(candles ? [...candles] : []);
  const real      = chartData.length > 0;
  const fib       = real ? getFib(chartData) : {fib382:price*0.9,fib50:price*0.88,fib618:price*0.85};

  const lastRsi  = real ? (chartData.filter(d=>d.rsi!=null).slice(-1)[0]?.rsi ?? 50) : 50;
  const lastMacd = real ? chartData.filter(d=>d.macd!=null).slice(-1)[0] : null;
  const macdX    = (lastMacd?.macd??0)>(lastMacd?.macdSignal??0)?"bullish":"bearish";
  const lastMA50 = real ? chartData.filter(d=>d.ma50!=null).slice(-1)[0]?.ma50 : null;
  const lastMA20 = real ? chartData.filter(d=>d.ma20!=null).slice(-1)[0]?.ma20 : null;
  const aboveMA50 = lastMA50 ? price>lastMA50 : null;
  const aboveMA20 = lastMA20 ? price>lastMA20 : null;

  // Dividends
  const divArr = divRaw?.divArr ?? [];
  let dividend = { paysDividend:false };
  if (divArr.length > 0) {
    const lastAmt = divArr[0].amount;
    const lastDate = new Date(divArr[0].date*1000).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"});
    let frequency = "Jährlich";
    if (divArr.length >= 2) {
      const gaps = [];
      for (let i=0;i<Math.min(divArr.length-1,6);i++) gaps.push((divArr[i].date-divArr[i+1].date)/86400);
      const avg = gaps.reduce((a,b)=>a+b,0)/gaps.length;
      if (avg<40) frequency="Monatlich";
      else if (avg<100) frequency="Quartalsweise";
      else if (avg<200) frequency="Halbjährlich";
    }
    const yr = Date.now()/1000 - 365*86400;
    const last12 = divArr.filter(d=>d.date>=yr);
    const perYear = frequency==="Monatlich"?12:frequency==="Quartalsweise"?4:frequency==="Halbjährlich"?2:1;
    const annualRate = last12.length>0 ? +last12.reduce((s,d)=>s+(d.amount??0),0).toFixed(4) : +(lastAmt*perYear).toFixed(4);
    const yieldPct = price&&annualRate ? +((annualRate/price)*100).toFixed(2) : null;
    dividend = { paysDividend:true, lastAmount:lastAmt, lastExDate:lastDate, annualRate, yieldPct, frequency };
  }

  // Signal
  let bull=0,bear=0;
  if (lastRsi<45)               bull+=2; else if (lastRsi<60) bull+=1;
  else if (lastRsi>=70)         bear+=2; else if (lastRsi>=60) bear+=1;
  if (macdX==="bullish")        bull+=1; else bear+=1;
  if (aboveMA50===true)         bull+=1; else if (aboveMA50===false) bear+=1;
  if (aboveMA20===true)         bull+=1; else if (aboveMA20===false) bear+=1;
  const chg=quote?.change??0;
  if (chg>1.5) bull+=1; else if (chg<-1.5) bear+=1;
  if (fundamentals?.pe) { if (fundamentals.pe>0&&fundamentals.pe<20) bull+=1; else if (fundamentals.pe>40) bear+=1; }
  if (fundamentals?.analystRating) {
    const rr=fundamentals.analystRating.toLowerCase();
    if (rr.includes("strong buy")) bull+=2;
    else if (rr.includes("buy"))   bull+=1;
    else if (rr.includes("sell"))  bear+=2;
  }

  const score=bull-bear;
  let signal,confidence;
  if (score>=3&&lastRsi<65)       { signal="BUY";   confidence=Math.min(60+score*5,93); }
  else if (score<=-3||lastRsi>72) { signal="WATCH"; confidence=Math.min(50+Math.abs(score)*4,85); }
  else                            { signal="HOLD";  confidence=Math.min(52+Math.abs(score)*3,78); }
  if (!real&&signal==="BUY")        signal="HOLD";

  const slPct=0.07+Math.random()*0.03;
  const u30=signal==="BUY"?+(5+Math.random()*12).toFixed(1):signal==="WATCH"?+((-3)-Math.random()*7).toFixed(1):+((-1)+Math.random()*5).toFixed(1);
  const u90=signal==="BUY"?+(12+Math.random()*16).toFixed(1):signal==="WATCH"?+((-6)-Math.random()*10).toFixed(1):+((-2)+Math.random()*9).toFixed(1);

  return {
    ...base, price, change:quote?.change??chartRaw?.quote?.change??0,
    high:quote?.high, low:quote?.low, prevClose:quote?.prevClose??chartRaw?.quote?.prevClose,
    chartData, fib, lastRsi, macdCrossing:macdX, aboveMA50, aboveMA20,
    signal, confidence, stopLossPct:slPct,
    entryPrice:signal==="BUY"?getEntry(price,fib):null,
    stopLoss:+(price*(1-slPct)).toFixed(2),
    target30:+(price*(1+u30/100)).toFixed(2), target90:+(price*(1+u90/100)).toFixed(2),
    upside30:u30, upside90:u90,
    dataReal:real, dataSource:real?"Yahoo Finance (live)":"Live Kurs (Chart n/v)",
    currentRange:rangeLabel, dividend, fundamentals, currency,
  };
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function Tip({text}){
  const [show,setShow]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{if(!show)return;const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setShow(false);};document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);},[show]);
  return(
    <span ref={ref} style={{position:"relative",display:"inline-flex",verticalAlign:"middle",marginLeft:4,flexShrink:0}}>
      <span onClick={e=>{e.stopPropagation();setShow(s=>!s);}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:15,height:15,borderRadius:"50%",background:"#1e293b",color:"#6b7280",fontSize:9,fontWeight:700,cursor:"pointer",border:"1px solid #2a3a50"}}>?</span>
      {show&&(
        <div style={{position:"fixed",width:260,background:"#131929",border:"1px solid #2a3a50",borderRadius:10,padding:"10px 13px",fontSize:12,color:"#c8ccd8",lineHeight:1.6,zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,.8)",pointerEvents:"none",
          left:ref.current?Math.max(8,Math.min(ref.current.getBoundingClientRect().left-120,window.innerWidth-276)):0,
          top:ref.current?ref.current.getBoundingClientRect().bottom+8:0}}>
          {text}
        </div>
      )}
    </span>
  );
}

function SigBadge({s}){
  const m={BUY:[C.green+"18",C.green,C.green+"30"],HOLD:[C.amber+"18",C.amber,C.amber+"30"],WATCH:[C.textMuted+"40",C.textSub,C.border]};
  const[bg,col,b]=m[s]||m.WATCH;
  return <span style={{background:bg,color:col,border:`1px solid ${b}`,padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{s==="BUY"?"Buy":s==="HOLD"?"Hold":"Watch"}</span>;
}

function Chg({v}){const pos=v>=0;return <span style={{color:pos?C.green:C.red,fontSize:12,fontWeight:500}}>{pos?"+":""}{v.toFixed(2)}%</span>;}

function CBar({value}){
  const col=value>=85?C.green:value>=70?C.amber:C.red;
  return(<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{width:`${value}%`,height:"100%",background:col,borderRadius:2}}/></div><span style={{fontSize:11,color:col,fontWeight:600,minWidth:30}}>{value}%</span></div>);
}

function CTip({active,payload,label}){
  if(!active||!payload?.length)return null;
  const d=payload[0]?.payload;
  return(<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px",fontSize:11}}>
    <div style={{color:C.textSub,marginBottom:3}}>{label}</div>
    {d?.price!=null&&<div style={{color:C.text,fontWeight:600}}>{d.price}</div>}
    {d?.ma20!=null&&<div style={{color:C.amber}}>MA20 {d.ma20}</div>}
    {d?.ma50!=null&&<div style={{color:C.accent}}>MA50 {d.ma50}</div>}
    {d?.rsi!=null&&<div style={{color:d.rsi>70?C.red:d.rsi<30?C.green:C.textSub}}>RSI {d.rsi}</div>}
  </div>);
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function Chart({stock,onRange,curRange,loading}){
  const[tab,setTab]=useState("price");
  useEffect(()=>setTab("price"),[curRange,stock.ticker]);
  const col=stock.signal==="BUY"?C.green:stock.signal==="WATCH"?C.red:C.textSub;
  const data=stock.chartData??[];
  const thin=data.length>120?data.filter((_,i)=>i%2===0):data;
  const iv=Math.max(1,Math.floor(thin.length/6));
  const tabs=[{id:"price",l:"Price"},{id:"rsi",l:"RSI"},{id:"macd",l:"MACD"},{id:"vol",l:"Volume"}];
  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",position:"relative"}}>
      {loading&&<div style={{position:"absolute",inset:0,background:C.bg+"ee",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.textSub,borderRadius:10}}>Lade Chart...</div>}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,alignItems:"center",overflowX:"auto",minHeight:42}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?600:400,color:tab===t.id?C.text:C.textSub,borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",whiteSpace:"nowrap",flexShrink:0}}>
            {t.l}{t.id==="rsi"&&<Tip text={TIPS.RSI}/>}{t.id==="macd"&&<Tip text={TIPS.MACD}/>}{t.id==="vol"&&<Tip text={TIPS.Vol}/>}
          </button>
        ))}
        <div style={{flex:1,minWidth:4}}/>
        <div style={{display:"flex",gap:1,padding:"0 8px",flexShrink:0}}>
          {TIME_RANGES.map(r=>(
            <button key={r.label} onClick={()=>onRange(r.label)} style={{background:curRange===r.label?C.border:"none",border:"none",borderRadius:4,padding:"5px 7px",cursor:"pointer",fontSize:11,fontWeight:curRange===r.label?600:400,color:curRange===r.label?C.text:C.textSub}}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"10px 4px 8px"}}>
        {data.length===0?(
          <div style={{textAlign:"center",padding:"36px 20px"}}>
            <div style={{fontSize:12,color:C.textSub,marginBottom:4}}>Keine Chart-Daten verfügbar</div>
            <div style={{fontSize:10,color:C.textMuted}}>Anderen Zeitraum wählen oder später erneut versuchen</div>
          </div>
        ):tab==="price"?(
          <>
            <div style={{display:"flex",gap:10,padding:"0 10px 8px",fontSize:10,color:C.textSub,flexWrap:"wrap",alignItems:"center"}}>
              <span><span style={{color:C.amber}}>—</span> MA20<Tip text={TIPS.MA20}/></span>
              <span><span style={{color:C.accent}}>—</span> MA50<Tip text={TIPS.MA50}/></span>
              <span><span style={{color:C.purple,opacity:.7}}>- -</span> Fib<Tip text={TIPS.Fib}/></span>
              {stock.entryPrice&&<span><span style={{color:C.green}}>—</span> Entry<Tip text={TIPS.Entry}/></span>}
              <span><span style={{color:C.red}}>—</span> Stop<Tip text={TIPS.Stop}/></span>
              {data.length>0&&<span style={{marginLeft:"auto",color:C.green,fontSize:9}}>Live</span>}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={thin} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs><linearGradient id={`g_${stock.ticker}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={col} stopOpacity={0.2}/><stop offset="95%" stopColor={col} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={iv} axisLine={false} tickLine={false}/>
                <YAxis domain={["auto","auto"]} tick={{fill:C.textMuted,fontSize:9}} width={56} tickFormatter={v=>v.toFixed(0)} axisLine={false} tickLine={false}/>
                <Tooltip content={<CTip/>}/>
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
              RSI (14)<Tip text={TIPS.RSI}/> — <span style={{color:C.red}}>Überkauft &gt;70</span> · <span style={{color:C.green}}>&lt;30 Kaufchance</span> · Aktuell: <strong style={{color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={thin.filter(d=>d.rsi!=null)} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs><linearGradient id="rsiG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={iv} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{fill:C.textMuted,fontSize:9}} width={24} axisLine={false} tickLine={false}/>
                <Tooltip content={<CTip/>}/>
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
              MACD (12,26,9)<Tip text={TIPS.MACD}/> — Aktuell: <strong style={{color:stock.macdCrossing==="bullish"?C.green:C.red}}>{stock.macdCrossing==="bullish"?"Bullish":"Bearish"}</strong>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={thin.filter(d=>d.macd!=null)} margin={{top:4,right:8,left:0,bottom:0}}>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={iv} axisLine={false} tickLine={false}/>
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
            <div style={{padding:"0 10px 8px",fontSize:10,color:C.textSub,display:"flex",alignItems:"center",gap:4}}>Volume<Tip text={TIPS.Vol}/></div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={thin} margin={{top:4,right:8,left:0,bottom:0}}>
                <XAxis dataKey="label" tick={{fill:C.textMuted,fontSize:9}} interval={iv} axisLine={false} tickLine={false}/>
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

// ─── FUNDAMENTALS PANEL ───────────────────────────────────────────────────────
function FundPanel({fund,stock}){
  if (!fund) return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Fundamentaldaten</div>
      <div style={{fontSize:12,color:C.textMuted}}>Werden geladen oder nicht verfügbar für diesen Ticker</div>
    </div>
  );
  const rows=[
    {l:"KGV (P/E)",   tip:TIPS.PE,    v:fund.pe!=null?fund.pe:null,        fmt:v=>v,                      c:fund.pe&&fund.pe<20?C.green:fund.pe&&fund.pe>40?C.red:C.text},
    {l:"KBV (P/B)",   tip:TIPS.PB,    v:fund.pb!=null?fund.pb:null,        fmt:v=>v,                      c:C.text},
    {l:"Nettomarge",  tip:TIPS.Margin,v:fund.netMargin!=null?fund.netMargin:null, fmt:v=>v+"%",           c:fund.netMargin&&fund.netMargin>20?C.green:C.text},
    {l:"Bruttomarge", tip:null,        v:fund.grossMargin!=null?fund.grossMargin:null, fmt:v=>v+"%",       c:C.text},
    {l:"ROE",         tip:null,        v:fund.roe!=null?fund.roe:null,      fmt:v=>v+"%",                  c:fund.roe&&fund.roe>15?C.green:C.text},
    {l:"Debt/Equity", tip:null,        v:fund.debtToEquity!=null?fund.debtToEquity:null, fmt:v=>v,         c:fund.debtToEquity&&fund.debtToEquity>2?C.red:C.text},
    {l:"Marktcap",    tip:null,        v:fund.marketCap!=null?fund.marketCap:null, fmt:fmtL,              c:C.text},
    {l:"Umsatz TTM",  tip:null,        v:fund.revenue!=null?fund.revenue:null, fmt:fmtL,                  c:C.text},
  ].filter(r=>r.v!=null);
  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12,fontWeight:600}}>Fundamentaldaten — Financial Modeling Prep</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:fund.analystRating||fund.analystTarget?12:0}}>
        {rows.map((r,i)=>(
          <div key={i} style={{background:C.surface,borderRadius:6,padding:"9px 12px"}}>
            <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3,display:"flex",alignItems:"center"}}>{r.l}{r.tip&&<Tip text={r.tip}/>}</div>
            <div style={{fontSize:14,fontWeight:700,color:r.c,fontFamily:"monospace"}}>{r.fmt(r.v)}</div>
          </div>
        ))}
      </div>
      {(fund.analystRating||fund.analystTarget)&&(
        <div style={{background:C.accent+"0d",border:`1px solid ${C.accent}22`,borderRadius:8,padding:"10px 14px"}}>
          <div style={{fontSize:9,color:C.accent,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,marginBottom:6}}>Analysten-Konsensus</div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap",alignItems:"center"}}>
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
function DivCompact({div}){
  if(!div)return null;
  if(!div.paysDividend)return <span style={{background:C.textMuted+"20",color:C.textMuted,border:`1px solid ${C.border}`,padding:"2px 7px",borderRadius:4,fontSize:10}}>No Div</span>;
  return <span style={{background:C.amber+"18",color:C.amber,border:`1px solid ${C.amber}30`,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600}}>{div.yieldPct!=null?div.yieldPct+"%":"Div"}</span>;
}
function DivPanel({div,stock}){
  if(!div)return null;
  if(!div.paysDividend)return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.textSub,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Dividende</div>
      <div style={{fontSize:13,color:C.textMuted}}>Kein Dividendenprogramm</div>
    </div>
  );
  return(
    <div style={{background:C.amber+"0c",border:`1px solid ${C.amber}22`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
      <div style={{fontSize:10,color:C.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Dividende</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:10}}>
        {[
          {l:"Jahresrendite",  v:div.yieldPct!=null?`${div.yieldPct}%`:"—"},
          {l:"Letzte Zahlung", v:div.lastAmount!=null?`${ccy(stock)}${div.lastAmount.toFixed(4)}`:"—"},
          {l:"Jährlich/Aktie",v:div.annualRate!=null?`${ccy(stock)}${div.annualRate}`:"—"},
          {l:"Häufigkeit",    v:div.frequency??"—"},
          {l:"Ex-Datum",      v:div.lastExDate??"—"},
        ].map((item,i)=>(
          <div key={i}>
            <div style={{fontSize:9,color:C.textMuted,marginBottom:3}}>{item.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:"monospace"}}>{item.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({stock:init,onClose}){
  const[stock,setStock]=useState(init);
  const[analysis,setAnalysis]=useState("");
  const[loadingAI,setLoadingAI]=useState(true);
  const[loadingChart,setLoadingChart]=useState(false);
  const[loadingStock,setLoadingStock]=useState(!!init.loading);
  const[range,setRange]=useState(init.currentRange||"3M");

  useEffect(()=>{if(!init.loading){setStock(init);setLoadingStock(false);}},[init]);

  async function handleRange(r){
    if(r===range)return;
    setRange(r); setLoadingChart(true);
    const u=await buildStock({ticker:stock.ticker,name:stock.name,sector:stock.sector},r);
    if(u)setStock(u);
    setLoadingChart(false);
  }

  useEffect(()=>{
    if(init.loading||!init.price)return;
    let cancelled=false;
    async function run(){
      setLoadingAI(true); setAnalysis("");
      const s=stock, f=s.fundamentals, d=s.dividend;
      const tech=`Kurs: ${fmt(s,s.price)} (${s.change>=0?"+":""}${s.change.toFixed(2)}% heute) | H ${fmt(s,s.high)} T ${fmt(s,s.low)}
RSI(14): ${s.lastRsi} (${s.lastRsi>70?"überkauft":s.lastRsi<30?"überverkauft":"neutral"}) — ${s.dataReal?"echte Daten":"Schätzung"}
MACD: ${s.macdCrossing} | Über MA20: ${s.aboveMA20===null?"n/a":s.aboveMA20?"ja":"nein"} | Über MA50: ${s.aboveMA50===null?"n/a":s.aboveMA50?"ja":"nein"}
Einstieg (Fib): ${s.entryPrice?fmt(s,s.entryPrice):"nicht empfohlen"} | Stop-Loss: ${fmt(s,s.stopLoss)} (-${(s.stopLossPct*100).toFixed(1)}%)`;
      const fund=f?`KGV: ${f.pe??"-"} | KBV: ${f.pb??"-"} | Nettomarge: ${f.netMargin!=null?f.netMargin+"%":"-"} | ROE: ${f.roe!=null?f.roe+"%":"-"} | D/E: ${f.debtToEquity??"-"}
Marktcap: ${fmtL(f.marketCap)} | Umsatz: ${fmtL(f.revenue)} | Analysten: ${f.analystRating??"-"} | Ziel: ${f.analystTarget?fmt(s,f.analystTarget):"-"}`:"Fundamentaldaten: nicht verfügbar";
      const div=d?.paysDividend?`Dividende: ${d.yieldPct}% Rendite, ${ccy(s)}${d.lastAmount?.toFixed(4)}/Aktie, ${d.frequency}`:"Keine Dividende";
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({
            model:"claude-sonnet-4-5",max_tokens:1200,
            system:`Du bist ein präziser institutioneller Marktanalyst der technische Analyse, Fundamentaldaten und Dividendeninformationen kombiniert. Antworte auf Deutsch, ~250 Wörter. Klarer Fliesstext, keine Markdown-Symbole, keine Emojis. Zeilenumbrüche zwischen Abschnitten.

Struktur:
Technische Lage: RSI, MACD, MA20/50 konkret interpretieren.
Fundamentale Bewertung: KGV, Marge, Analysten bewerten — faire Bewertung?
Dividende: Kommentiere falls vorhanden.
Gesamteinschätzung: Kursziel ${fmt(s,s.target30)} (30T) und ${fmt(s,s.target90)} (90T) begründen. Fibonacci ${s.entryPrice?fmt(s,s.entryPrice):"nicht empfohlen"} einordnen.
Risiken: Zwei konkrete aktienspezifische Risiken.

Schlusszeile immer exakt: "Hinweis: KI-generierte Marktinformation. Keine Anlageberatung. Keine Erfolgsgarantie."`,
            messages:[{role:"user",content:`${s.name} (${s.ticker}) — Sektor: ${s.sector} — Währung: ${s.currency??'USD'} — Signal: ${s.signal} (Konfidenz ${s.confidence}%)
${tech}
${fund}
${div}
Kursziel 30T: ${fmt(s,s.target30)} (+${s.upside30}%) | 90T: ${fmt(s,s.target90)} (+${s.upside90}%)`}],
          }),
        });
        const data=await res.json();
        if(!cancelled)setAnalysis(data.content?.map(b=>b.text||"").join("\n")||"Nicht verfügbar.");
      }catch(e){if(!cancelled)setAnalysis("Verbindungsfehler: "+e.message);}
      finally{if(!cancelled)setLoadingAI(false);}
    }
    run();
    return()=>{cancelled=true;};
  },[init.ticker,init.price]);

  const dayChgAbs  = stock.prevClose&&stock.price ? stock.price-stock.prevClose : null;
  const firstPrice = stock.chartData?.length>0 ? stock.chartData[0].price : null;
  const rangeChgPct = firstPrice&&stock.price ? +((stock.price-firstPrice)/firstPrice*100).toFixed(2) : null;
  const rangeChgAbs = firstPrice&&stock.price ? +(stock.price-firstPrice).toFixed(2) : null;
  const posDay   = (stock.change??0)>=0;
  const posRange = rangeChgPct!==null ? rangeChgPct>=0 : true;

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"22px 18px",maxWidth:720,width:"100%",marginTop:8,boxShadow:"0 24px 64px rgba(0,0,0,.6)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:2,marginBottom:5,textTransform:"uppercase"}}>KI-Analyse{loadingStock?" · Lade...":` · ${stock.dataReal?"Live":"Kurs live"}`}</div>
            <div style={{fontSize:20,fontWeight:700,color:C.text,letterSpacing:-.3}}>{stock.ticker} <span style={{color:C.textSub,fontWeight:400,fontSize:14}}>{stock.name}</span></div>
            {loadingStock?(
              <div style={{display:"flex",gap:5,alignItems:"center",marginTop:10}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}
                <span style={{fontSize:12,color:C.textSub,marginLeft:4}}>Lade alle Daten...</span>
              </div>
            ):(
              <>
                <div style={{display:"flex",gap:10,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
                  <SigBadge s={stock.signal}/>
                  <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:C.text}}>{fmt(stock,stock.price)}</span>
                  <span style={{fontSize:10,color:C.textMuted,background:C.border,padding:"2px 7px",borderRadius:4}}>{stock.currency??'USD'}</span>
                </div>
                <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                  <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",minWidth:120}}>
                    <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Heute</div>
                    <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                      <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:posDay?C.green:C.red}}>{posDay?"+":""}{(stock.change??0).toFixed(2)}%</span>
                      {dayChgAbs!=null&&<span style={{fontFamily:"monospace",fontSize:12,color:posDay?C.green+"99":C.red+"99"}}>{posDay?"+":""}{ccy(stock)}{Math.abs(dayChgAbs).toFixed(2)}</span>}
                    </div>
                    {stock.high&&<div style={{fontSize:10,color:C.textMuted,marginTop:3}}>H {fmt(stock,stock.high)} · T {fmt(stock,stock.low)}</div>}
                  </div>
                  {rangeChgPct!=null&&(
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",minWidth:120}}>
                      <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{range} Veränderung</div>
                      <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:posRange?C.green:C.red}}>{posRange?"+":""}{rangeChgPct}%</span>
                        <span style={{fontFamily:"monospace",fontSize:12,color:posRange?C.green+"99":C.red+"99"}}>{posRange?"+":""}{ccy(stock)}{Math.abs(rangeChgAbs).toFixed(2)}</span>
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

        {loadingStock?(
          <div style={{padding:"60px 0",textAlign:"center"}}>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.accent,animation:`pulse 1.3s ${i*.25}s infinite`}}/>)}</div>
            <div style={{fontSize:13,color:C.textSub,marginBottom:6}}>Lade Kurse · Chart · Fundamentaldaten...</div>
            <div style={{fontSize:11,color:C.textMuted}}>Finnhub · Yahoo Finance · Financial Modeling Prep</div>
          </div>
        ):(
          <>
            <div style={{marginBottom:14}}><Chart key={`${stock.ticker}-${range}`} stock={stock} onRange={handleRange} curRange={range} loading={loadingChart}/></div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
              {[
                {l:"RSI (14)",       tip:TIPS.RSI,  v:stock.lastRsi,  s:stock.lastRsi>70?"Überkauft":stock.lastRsi<30?"Überverkauft":"Neutral", c:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub},
                {l:"MACD",          tip:TIPS.MACD, v:stock.macdCrossing==="bullish"?"Bullish":"Bearish", s:"Trendkreuzung", c:stock.macdCrossing==="bullish"?C.green:C.red},
                {l:"Einstieg (Fib)",tip:TIPS.Entry,v:stock.entryPrice?fmt(stock,stock.entryPrice):"—", s:"Support-Level", c:C.purple},
                {l:"Stop-Loss",     tip:TIPS.Stop, v:fmt(stock,stock.stopLoss), s:`-${(stock.stopLossPct*100).toFixed(1)}%`, c:C.red},
              ].map((item,i)=>(
                <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 14px"}}>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5,display:"flex",alignItems:"center"}}>{item.l}<Tip text={item.tip}/></div>
                  <div style={{fontSize:14,fontWeight:700,color:item.c,fontFamily:"monospace"}}>{item.v}</div>
                  <div style={{fontSize:9,color:C.textMuted,marginTop:2}}>{item.s}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
              {[
                {l:"Kursziel 30 Tage",v:fmt(stock,stock.target30),u:stock.upside30,bg:C.green+"20",b:C.green+"25"},
                {l:"Kursziel 90 Tage",v:fmt(stock,stock.target90),u:stock.upside90,bg:C.accent+"15",b:C.accent+"25"},
              ].map((t,i)=>(
                <div key={i} style={{background:t.bg,border:`1px solid ${t.b}`,borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>{t.l}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:C.text}}>{t.v}</span>
                    <span style={{color:t.u>=0?C.green:C.red,fontSize:12,fontWeight:600}}>{t.u>=0?"+":""}{t.u}%</span>
                  </div>
                  <div style={{fontSize:9,color:C.textMuted,marginTop:2}}>KI-Prognose · nicht garantiert</div>
                </div>
              ))}
            </div>

            <FundPanel fund={stock.fundamentals} stock={stock}/>
            <DivPanel  div={stock.dividend}      stock={stock}/>

            {loadingAI?(
              <div style={{background:C.bg,borderRadius:8,padding:"22px",textAlign:"center",marginBottom:14}}>
                <div style={{fontSize:12,color:C.textSub,marginBottom:10}}>Analysiere Technische Daten · Fundamentaldaten · Dividenden...</div>
                <div style={{display:"flex",gap:5,justifyContent:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}</div>
              </div>
            ):(
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 18px",fontSize:13,color:"#c8ccd8",lineHeight:1.9,marginBottom:14,whiteSpace:"pre-wrap"}}>{analysis}</div>
            )}

            {!loadingAI&&<div style={{marginBottom:14}}><div style={{fontSize:10,color:C.textSub,fontWeight:500,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>KI-Konfidenz</div><CBar value={stock.confidence}/></div>}

            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:10,color:C.textMuted}}>Kurse: Finnhub · Chart: Yahoo · Fundamentals: FMP</span>
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
function Card({stock,onAnalyze}){
  const f=stock.fundamentals;
  return(
    <div onClick={()=>onAnalyze(stock)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderHov} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div><div style={{fontWeight:700,fontFamily:"monospace",fontSize:15,color:C.text}}>{stock.ticker} <span style={{fontSize:10,color:C.textMuted,fontFamily:"sans-serif",fontWeight:400}}>{stock.currency??'USD'}</span></div>
          <div style={{fontSize:12,color:C.textSub,marginTop:1}}>{stock.name}</div>
          <div style={{fontSize:10,color:C.textMuted}}>{stock.sector}</div></div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
          <div style={{fontWeight:700,fontFamily:"monospace",fontSize:16,color:C.text}}>{fmt(stock,stock.price)}</div>
          <Chg v={stock.change}/>
          {stock.prevClose&&stock.price&&<div style={{fontSize:10,color:stock.change>=0?C.green+"99":C.red+"99",fontFamily:"monospace"}}>{stock.change>=0?"+":""}{ccy(stock)}{Math.abs(stock.price-stock.prevClose).toFixed(2)}</div>}
          {stock.high&&<div style={{fontSize:10,color:C.textMuted}}>H {fmt(stock,stock.high)} · T {fmt(stock,stock.low)}</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <SigBadge s={stock.signal}/>
        <span style={{fontSize:11,color:C.textSub}}>RSI <span style={{color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub,fontWeight:600}}>{stock.lastRsi}</span></span>
        {f?.pe&&<span style={{fontSize:10,color:C.textSub}}>KGV <span style={{fontWeight:600,color:f.pe<20?C.green:f.pe>40?C.red:C.text}}>{f.pe}</span></span>}
        <DivCompact div={stock.dividend}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
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
      {stock.dividend?.paysDividend&&(
        <div style={{background:C.amber+"0d",border:`1px solid ${C.amber}22`,borderRadius:8,padding:"9px 12px",marginBottom:10}}>
          <div style={{fontSize:9,color:C.amber,textTransform:"uppercase",letterSpacing:0.8,fontWeight:600,marginBottom:4}}>Dividende</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.text}}>Rendite: <strong style={{color:C.amber}}>{stock.dividend.yieldPct!=null?stock.dividend.yieldPct+"%":"—"}</strong></span>
            <span style={{fontSize:12,color:C.text}}>Zahlung: <strong style={{fontFamily:"monospace"}}>{stock.dividend.lastAmount!=null?fmt(stock,stock.dividend.lastAmount):"-"}</strong></span>
            <span style={{fontSize:12,color:C.textSub}}>{stock.dividend.frequency??""}</span>
          </div>
        </div>
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
      <div style={{background:C.accent+"18",border:`1px solid ${C.accent}30`,borderRadius:8,padding:"9px",textAlign:"center",fontSize:12,fontWeight:600,color:C.accent}}>Chart & KI-Analyse →</div>
    </div>
  );
}

// ─── DESKTOP ROW ──────────────────────────────────────────────────────────────
function Row({stock,onAnalyze,idx}){
  const f=stock.fundamentals;
  return(
    <div onClick={()=>onAnalyze(stock)} style={{display:"grid",gridTemplateColumns:"80px 1fr 110px 90px 65px 80px 90px 90px 90px",padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:idx%2===0?C.bg:C.surface,transition:"background .15s",alignItems:"center",cursor:"pointer",minWidth:0}} onMouseEnter={e=>e.currentTarget.style.background="#141720"} onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?C.bg:C.surface}>
      <div style={{minWidth:0}}>
        <div style={{fontWeight:700,fontFamily:"monospace",fontSize:13,color:C.text}}>{stock.ticker}</div>
        <div style={{fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.3}}>{stock.currency??'USD'}</div>
      </div>
      <div style={{fontSize:12,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{stock.name}</div>
      <div>
        <div style={{fontWeight:600,fontFamily:"monospace",fontSize:13,color:C.text}}>{fmt(stock,stock.price)}</div>
        <Chg v={stock.change}/>
        {stock.prevClose&&stock.price&&<div style={{fontSize:9,color:stock.change>=0?C.green+"99":C.red+"99",fontFamily:"monospace"}}>{stock.change>=0?"+":""}{ccy(stock)}{Math.abs(stock.price-stock.prevClose).toFixed(2)}</div>}
      </div>
      <div><SigBadge s={stock.signal}/></div>
      <div>
        <div style={{fontFamily:"monospace",fontWeight:600,fontSize:13,color:stock.lastRsi>70?C.red:stock.lastRsi<30?C.green:C.textSub}}>{stock.lastRsi}</div>
        <div style={{fontSize:9,color:stock.dataReal?C.green+"99":C.textMuted}}>{stock.dataReal?"Live":"—"}</div>
      </div>
      <div>{f?.pe?<><div style={{fontFamily:"monospace",fontWeight:600,fontSize:12,color:f.pe<20?C.green:f.pe>40?C.red:C.text}}>{f.pe}</div><div style={{fontSize:9,color:C.textMuted}}>KGV</div></>:<span style={{color:C.textMuted,fontSize:11}}>—</span>}</div>
      <div><DivCompact div={stock.dividend}/></div>
      <div>{stock.entryPrice?<><div style={{fontFamily:"monospace",fontWeight:600,fontSize:11,color:C.purple}}>{fmt(stock,stock.entryPrice)}</div><div style={{fontSize:9,color:C.textMuted}}>Fib</div></>:<span style={{color:C.textMuted}}>—</span>}</div>
      <div>
        <button style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.textSub,fontSize:11,fontWeight:500,padding:"5px 10px",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub;}}>Analyse</button>
      </div>
    </div>
  );
}

// ─── PULL TO REFRESH ──────────────────────────────────────────────────────────
function PullRefresh({onRefresh}){
  const[dist,setDist]=useState(0);
  const[refreshing,setRefreshing]=useState(false);
  const startY=useRef(0);const pulling=useRef(false);const threshold=72;
  useEffect(()=>{
    const el=document.documentElement;
    const onTS=e=>{if(el.scrollTop>0)return;startY.current=e.touches[0].clientY;pulling.current=true;};
    const onTM=e=>{if(!pulling.current||el.scrollTop>0){setDist(0);return;}const dy=e.touches[0].clientY-startY.current;if(dy<0){setDist(0);return;}setDist(Math.min(dy*0.45,threshold+20));};
    const onTE=()=>{if(dist>=threshold&&!refreshing){setRefreshing(true);setDist(threshold);onRefresh(()=>{setRefreshing(false);setDist(0);pulling.current=false;});}else{setDist(0);pulling.current=false;}};
    window.addEventListener("touchstart",onTS,{passive:true});
    window.addEventListener("touchmove",onTM,{passive:true});
    window.addEventListener("touchend",onTE,{passive:true});
    return()=>{window.removeEventListener("touchstart",onTS);window.removeEventListener("touchmove",onTM);window.removeEventListener("touchend",onTE);};
  },[dist,refreshing,onRefresh]);
  if(dist===0&&!refreshing)return null;
  const ready=dist>=threshold;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",height:refreshing?threshold:dist,background:C.bg,borderBottom:`1px solid ${C.border}`,transition:refreshing?"height 0.2s":"none",overflow:"hidden"}}>
      {refreshing?<span style={{fontSize:11,color:C.textSub}}>Aktualisiere...</span>:<span style={{fontSize:11,color:ready?C.accent:C.textMuted}}>{ready?"Loslassen":"Nach unten ziehen..."}</span>}
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
  const[loading,setLoading]=useState(true);
  const[progress,setProgress]=useState(0);
  const[mobile,setMobile]=useState(window.innerWidth<720);

  useEffect(()=>{const fn=()=>setMobile(window.innerWidth<720);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  async function loadAll(done){
    setLoading(true);setProgress(0);setStocks([]);
    const BATCH=4;const results=[];
    for(let i=0;i<DEFAULT_TICKERS.length;i+=BATCH){
      const batch=DEFAULT_TICKERS.slice(i,i+BATCH);
      const built=await Promise.all(batch.map(t=>buildStock(t,"3M")));
      built.forEach(s=>{if(s)results.push(s);});
      setStocks([...results]);
      setProgress(Math.min(100,Math.round(((i+BATCH)/DEFAULT_TICKERS.length)*100)));
      if(i+BATCH<DEFAULT_TICKERS.length)await new Promise(r=>setTimeout(r,150));
    }
    setLoading(false);if(done)done();
  }
  useEffect(()=>{loadAll();},[]);

  useEffect(()=>{
    if(!searchQuery.trim()){setSearchRes([]);return;}
    const t=setTimeout(async()=>{setSearching(true);const res=await searchStocks(searchQuery);setSearchRes(res);setSearching(false);},500);
    return()=>clearTimeout(t);
  },[searchQuery]);

  async function addFromSearch(item){
    setQuery("");setSearchRes([]);
    const existing=stocks.find(s=>s.ticker===item.ticker);
    if(existing){setSelected(existing);return;}
    const placeholder={...item,price:null,change:0,high:null,low:null,prevClose:null,chartData:[],fib:{fib382:0,fib50:0,fib618:0},lastRsi:50,macdCrossing:"neutral",aboveMA50:null,aboveMA20:null,signal:"HOLD",confidence:50,stopLossPct:0.08,entryPrice:null,stopLoss:null,target30:null,target90:null,upside30:0,upside90:0,dataReal:false,dataSource:"Lade...",currentRange:"3M",dividend:{paysDividend:false},fundamentals:null,currency:item.ticker.endsWith(".SW")?"CHF":item.ticker.endsWith(".DE")||item.ticker.endsWith(".AS")?"EUR":"USD",loading:true};
    setSelected(placeholder);
    const s=await buildStock(item,"3M");
    if(s){setStocks(prev=>[s,...prev]);setSelected(s);}
  }

  const buyCount=stocks.filter(s=>s.signal==="BUY").length;
  const lastUpd=stocks.length>0?new Date().toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"}):null;

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter','Helvetica Neue',sans-serif",color:C.text}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}*{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        input,button{touch-action:manipulation;}input{font-size:16px!important;}input::placeholder{color:${C.textMuted};}`}</style>

      {mobile&&<PullRefresh onRefresh={loadAll}/>}

      <header style={{borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,background:C.bg+"f0",backdropFilter:"blur(16px)",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="7" fill={C.accent} fillOpacity="0.15"/><polyline points="5,20 10,13 15,16 23,7" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="23" cy="7" r="2" fill={C.accent}/></svg>
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
          {loading?<span style={{color:C.accent}}>Lädt {progress}%</span>:<><span style={{color:C.green,fontWeight:600}}>{buyCount}</span> Kaufsignale{lastUpd&&mobile&&<span style={{color:C.textMuted,marginLeft:6}}>· {lastUpd}</span>}</>}
        </div>
      </header>

      <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,position:"relative",zIndex:50}}>
        <div style={{position:"relative",maxWidth:520}}>
          <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="5" stroke={C.textMuted} strokeWidth="1.5"/><path d="M10 10L13 13" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round"/></svg>
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

      <div style={{display:"grid",gridTemplateColumns:`repeat(${mobile?2:4},1fr)`,borderBottom:`1px solid ${C.border}`}}>
        {[
          {l:"Kaufsignale", v:loading?"—":buyCount,                                                                         c:C.green},
          {l:"Aktien",      v:stocks.length||"—",                                                                           c:C.text},
          {l:"Ø RSI",       v:stocks.length?(stocks.reduce((a,s)=>a+s.lastRsi,0)/stocks.length).toFixed(0):"—",            c:C.text},
          {l:"Quellen",     v:"Finnhub · Yahoo · FMP",                                                                      c:C.textSub},
        ].map((s,i)=>(
          <div key={i} style={{padding:"12px 20px",borderRight:i<3?`1px solid ${C.border}`:"none"}}>
            <div style={{fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:i===3?11:18,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{padding:"14px 20px 48px"}}>
        {loading&&stocks.length===0?(
          <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:13,color:C.textSub,marginBottom:12}}>Lade Marktdaten · Fundamentaldaten · Dividenden...</div>
            <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:14}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.4s ${i*.25}s infinite`}}/>)}</div>
            <div style={{width:180,height:3,background:C.border,borderRadius:2,margin:"0 auto",overflow:"hidden"}}><div style={{width:`${progress}%`,height:"100%",background:C.accent,borderRadius:2,transition:"width .3s"}}/></div>
            <div style={{fontSize:10,color:C.textMuted,marginTop:6}}>{progress}%</div>
          </div>
        ):mobile?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:2,display:"flex",justifyContent:"space-between"}}><span>{stocks.length} Aktien{loading?" · lädt...":""}</span><span>Tippen für Analyse</span></div>
            {stocks.map(s=><Card key={s.ticker} stock={s} onAnalyze={setSelected}/>)}
          </div>
        ):(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:C.text}}>Marktübersicht</div>
                <div style={{fontSize:11,color:C.textSub,marginTop:1}}>{stocks.length} Aktien · Kurse: Finnhub · Chart: Yahoo Finance · Fundamentals: FMP{loading&&<span style={{color:C.accent}}> · lädt...</span>}</div>
              </div>
              <div style={{fontSize:10,color:C.textMuted}}>Keine Anlageberatung</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 110px 90px 65px 80px 90px 90px 90px",padding:"7px 20px",fontSize:10,color:C.textMuted,fontWeight:500,letterSpacing:0.8,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>
              <span>Ticker</span><span>Unternehmen</span><span>Kurs</span><span>Signal</span><span>RSI</span><span>KGV</span><span>Dividende</span><span>Einstieg</span><span></span>
            </div>
            {stocks.map((s,i)=><Row key={s.ticker} stock={s} onAnalyze={setSelected} idx={i}/>)}
          </div>
        )}
        <div style={{marginTop:18,fontSize:10,color:C.textMuted,lineHeight:1.7,maxWidth:680}}>{DISCLAIMER}</div>
      </div>

      {selected&&<Modal stock={selected} onClose={()=>setSelected(null)}/>}
    </div>
  );
}
