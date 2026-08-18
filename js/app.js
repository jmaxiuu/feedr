import { loadCatalog } from "./catalog.js";

const MAX_PICKS = 3;          // 1 pick + 2 rerolls, then you choose from the 3
const OVERRUN = 1.5;          // a pick may run to 1.5x the meal before it counts as a stretch
const PLATING_MS = 900;       // how long the "cooking" beat lasts

const $ = id => document.getElementById(id);

let CATALOG = [];             // videos
let LENGTHS = [], MOODS = [];
let mealLen, mood, orderCount = 0;
let round = [];               // picks served this round

/* ---------- controls ---------- */

function renderChips(){
  const lenBox = $("lenChips"), moodBox = $("moodChips");
  lenBox.replaceChildren(...LENGTHS.map(l => chip(l.label, l.sub, l.minutes === mealLen)));
  moodBox.replaceChildren(...MOODS.map(m => chip(m.label, m.sub, m.id === mood)));

  bindChips(lenBox, i => mealLen = LENGTHS[i].minutes);
  bindChips(moodBox, i => mood = MOODS[i].id);
}

function chip(label, sub, on){
  const b = document.createElement("button");
  b.className = on ? "chip on" : "chip";
  b.append(label);
  if(sub){
    const s = document.createElement("small");
    s.textContent = sub;
    b.append(s);
  }
  return b;
}

function bindChips(box, setter){
  box.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if(!chip) return;
    const kids = [...box.children];
    kids.forEach(c => c.classList.remove("on"));
    chip.classList.add("on");
    setter(kids.indexOf(chip));
    resetRound();
  });
}

/* ---------- the pick ---------- */

function resetRound(){ round = []; }

function pick(){
  const served = round.map(v => v.id);
  // strictly same mood — the chips are a promise. If the pantry's empty, we stop serving.
  const pool = CATALOG.filter(v => v.mood === mood && !served.includes(v.id));
  if(!pool.length) return null;

  // Closest-two-then-coin-flip on its own will hand you a 2-hour podcast for a 20-minute
  // lunch whenever the mood is thin. Anything you can't finish in half again the meal is a
  // stretch, so it only gets served once everything that fits has been offered.
  const fits = pool.filter(v => v.min <= mealLen * OVERRUN);
  const bench = fits.length ? fits : pool;

  // Three picks from the same channel is a boring round, so skip channels already served.
  // It's a preference, not a rule — a thin mood would otherwise run out of things to offer,
  // and being handed the wrong runtime is worse than being handed the same channel twice.
  const servedChannels = new Set(round.map(v => v.channel));
  const fresh = bench.filter(v => !servedChannels.has(v.channel));
  const shortlist = fresh.length ? fresh : bench;

  shortlist.sort((a,b) => Math.abs(a.min - mealLen) - Math.abs(b.min - mealLen));

  // Flipping a coin between the two closest keeps repeat rounds from being identical — but
  // only when both actually fit. With nothing in range, take the closest and nothing else.
  const top = fits.length ? shortlist.slice(0,2) : shortlist.slice(0,1);
  return top[Math.floor(Math.random() * top.length)];
}

function moodHasMore(){
  const served = round.map(v => v.id);
  return CATALOG.some(v => v.mood === mood && !served.includes(v.id));
}

function fitText(v){
  if(v.min >= 60) return "Bottomless — pause when you're full";
  const d = v.min - mealLen;
  if(Math.abs(d) <= 3) return "Perfect fit for your meal";
  if(d < 0) return "Short & sweet — room for dessert";
  if(v.min > mealLen * OVERRUN) return "Runs long — you'll be pausing this one";
  return "A little longer — chef's choice";
}

/* ---------- screens ---------- */

const SCREENS = { idle:"block", cooking:"block", ticketWrap:"flex", fault:"block" };

function show(el){
  for(const [id, mode] of Object.entries(SCREENS)){
    $(id).style.display = id === el ? mode : "none";
  }
}

function openVideo(v){
  const url = "https://www.youtube.com/watch?v=" + v.id;
  // installed PWAs sometimes refuse window.open — fall back to navigating away
  if(!window.open(url, "_blank", "noopener")) location.href = url;
}

function updateRerollBtn(){
  const left = MAX_PICKS - round.length;
  const btn = $("rerollBtn");
  if(left > 0 && moodHasMore()){
    btn.textContent = "↻ Not this (" + left + " left)";
    btn.onclick = serve;
  }else{
    btn.textContent = "☰ View all " + round.length + (round.length === 1 ? " option" : " options");
    btn.onclick = showChooser;
  }
}

function showChooser(){
  // last call: you pick from what was served. No more rerolls, no going back.
  $("ticket").style.display = "none";
  $("tActions").style.display = "none";
  const c = $("chooser");
  c.querySelectorAll(".opt").forEach(o => o.remove());
  round.forEach(v => {
    const b = document.createElement("button");
    b.className = "opt";
    const text = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = v.title;
    const meta = document.createElement("small");
    meta.textContent = v.channel + " · " + v.min + " min";
    text.append(title, meta);
    const go = document.createElement("span");
    go.className = "go";
    go.textContent = "▶";
    b.append(text, go);
    b.onclick = () => openVideo(v);
    c.appendChild(b);
  });
  c.style.display = "flex";
}

function serve(){
  if(round.length >= MAX_PICKS) return showChooser();
  const v = pick();
  if(!v) return round.length ? showChooser() : null;
  show("cooking");
  setTimeout(() => {
    round.push(v);
    orderCount++;
    $("orderNo").textContent = "Order #" + String(orderCount).padStart(4,"0");
    $("orderTime").textContent = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    $("tTitle").textContent = v.title;
    $("tMeta").textContent = v.channel + " · " + v.min + " min";
    $("tFit").textContent = fitText(v);
    $("openBtn").onclick = () => openVideo(v);
    show("ticketWrap");
    $("chooser").style.display = "none";
    $("ticket").style.display = "block";
    $("tActions").style.display = "flex";
    const t = $("ticket");
    t.classList.remove("printed"); void t.offsetWidth; t.classList.add("printed");
    $("controls").style.opacity = ".35";
    updateRerollBtn();
  }, PLATING_MS);
}

/* ---------- boot ---------- */

async function start(){
  show("cooking");
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
    return show("fault");
  }
  renderChips();
  show("idle");
}

$("feedBtn").addEventListener("click", () => { resetRound(); serve(); });
$("backBtn").addEventListener("click", () => { resetRound(); show("idle"); $("controls").style.opacity = "1"; });
$("retryBtn").addEventListener("click", start);

start();

if("serviceWorker" in navigator){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
}
