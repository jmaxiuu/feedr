import { loadCatalog } from "./catalog.js";

const MAX_PICKS = 3;          // 1 pick + 2 rerolls, then you choose from the 3
const OVERRUN = 1.5;          // a pick may run to 1.5x the meal before it counts as a stretch
const PLATING_MS = 850;       // how long the "On it." beat lasts
const ORDER_KEY = "feedr.orderNo";

const $ = id => document.getElementById(id);
const SCREENS = ["s0","s1","s2","s3","s4","s5","s6"];

let CATALOG = [];
let LENGTHS = [], MOODS = [];
let mealLen, mood, round = [], current = "s0";
let orderNo = Number(localStorage.getItem(ORDER_KEY)) || 0;   // survives a relaunch

/* ---------- screens ---------- */

function goto(id, step){
  SCREENS.forEach(s => $(s).classList.toggle("hidden", s !== id));
  current = id;
  $("stepLbl").textContent = step || " ";
  $("backBtn").disabled = !(id === "s1" || id === "s2" || id === "s4");
}

$("backBtn").onclick = () => {
  if(current === "s2") goto("s1", "1/2");
  else if(current === "s1") goto("s0");
  else if(current === "s4") goto("s2", "2/2");
};

/* ---------- the menu, rendered from the catalog ---------- */

function option(name, value, onPick){
  const b = document.createElement("button");
  b.className = "opt";
  const n = document.createElement("span"); n.className = "n"; n.textContent = name;
  const v = document.createElement("span"); v.className = "v"; v.textContent = value || "";
  b.append(n, v);
  b.onclick = onPick;
  return b;
}

function renderMenu(){
  $("lenOpts").replaceChildren(...LENGTHS.map(l =>
    option(l.label, l.sub, () => { mealLen = l.minutes; round = []; goto("s2", "2/2"); })));
  $("moodOpts").replaceChildren(...MOODS.map(m =>
    option(m.label, m.tag, () => { mood = m.id; round = []; serve(); })));
}

/* ---------- the pick ---------- */

function remaining(){
  const served = round.map(v => v.id);
  return CATALOG.filter(v => v.mood === mood && !served.includes(v.id));
}

function pick(){
  const pool = remaining();
  if(!pool.length) return null;

  // Closest-two-then-coin-flip alone will hand you a 2-hour podcast for a 20-minute lunch
  // whenever the mood is thin. Anything you can't finish in half again the meal is a
  // stretch, so it only gets served once everything that fits has been offered.
  const fits = pool.filter(v => v.min <= mealLen * OVERRUN);
  const bench = fits.length ? fits : pool;

  // Three picks from the same channel is a boring round, so skip channels already served.
  // A preference, not a rule — runtime fit still wins, since being handed the wrong length
  // is worse than being handed the same channel twice.
  const servedChannels = new Set(round.map(v => v.channel));
  const fresh = bench.filter(v => !servedChannels.has(v.channel));
  const shortlist = fresh.length ? fresh : bench;

  shortlist.sort((a,b) => Math.abs(a.min - mealLen) - Math.abs(b.min - mealLen));

  // Coin-flip between the two closest keeps repeat rounds from being identical — but only
  // when both actually fit. With nothing in range, take the closest and nothing else.
  const top = fits.length ? shortlist.slice(0,2) : shortlist.slice(0,1);
  return top[Math.floor(Math.random() * top.length)];
}

function fitText(v){
  if(v.min >= 60) return "BOTTOMLESS — PAUSE WHEN YOU'RE FULL";
  const d = v.min - mealLen;
  if(Math.abs(d) <= 3) return "FITS YOUR MEAL EXACTLY";
  if(d < 0) return "SHORT & SWEET — ROOM FOR DESSERT";
  if(v.min > mealLen * OVERRUN) return "RUNS LONG — YOU'LL BE PAUSING THIS ONE";
  return "RUNS LONG — CHEF'S CHOICE";
}

const watchUrl = v => "https://www.youtube.com/watch?v=" + v.id;

/* ---------- serving ---------- */

function serve(){
  if(round.length >= MAX_PICKS || (round.length && !remaining().length)) return lastCall();
  const v = pick();
  if(!v) return;
  goto("s3");
  setTimeout(() => {
    round.push(v);
    orderNo++;
    localStorage.setItem(ORDER_KEY, orderNo);

    $("tNo").textContent = "ORDER #" + String(orderNo).padStart(3,"0");
    $("tTime").textContent = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    $("tTitle").textContent = v.title;
    $("tMeta").textContent = v.channel + " · " + v.min + " MIN";
    $("tFit").textContent = "→ " + fitText(v);
    $("openBtn").href = watchUrl(v);            // a real anchor: survives standalone PWAs

    const left = MAX_PICKS - round.length, more = remaining().length > 0;
    const btn = $("rerollBtn");
    btn.textContent = (left > 0 && more) ? "not this (" + left + " left)" : "view all " + round.length;
    btn.onclick = (left > 0 && more) ? serve : lastCall;

    goto("s4");
    const t = $("ticket");
    t.classList.remove("in"); void t.offsetWidth; t.classList.add("in");
  }, PLATING_MS);
}

function lastCall(){
  const lc = $("lcOpts");
  lc.replaceChildren(...round.map(v => {
    const a = document.createElement("a");
    a.className = "lc-opt";
    a.href = watchUrl(v);
    a.target = "_blank";
    a.rel = "noopener";
    const text = document.createElement("span");
    const title = document.createElement("b"); title.textContent = v.title;
    const meta = document.createElement("small"); meta.textContent = v.channel + " · " + v.min + " min";
    text.append(title, meta);
    const play = document.createElement("span"); play.className = "p"; play.textContent = "▶";
    a.append(text, play);
    return a;
  }));
  goto("s5");
}

$("startBtn").onclick = () => goto("s1", "1/2");
$("overBtn").onclick = () => { round = []; goto("s0"); };
$("retryBtn").onclick = start;

/* ---------- boot ---------- */

async function start(){
  goto("s3");
  try{
    const data = await loadCatalog();
    CATALOG = data.videos;
    LENGTHS = data.lengths;
    MOODS   = data.moods;
    mealLen = data.defaultLen;
    mood    = data.defaultMood;
  }catch(err){
    console.error(err);
    $("faultMsg").textContent = err.message;
    return goto("s6");
  }
  renderMenu();
  goto("s0");
}

start();

if("serviceWorker" in navigator){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
}
