import { loadCatalog } from "./catalog.js";
import { OVERRUN, pickFrom, hasMore, fitText } from "./picker.js";

const MAX_PICKS = 3;          // 1 pick + 2 rerolls, then you choose from the 3
const PLATING_MS = 850;       // how long the "On it." beat lasts
const ORDER_KEY = "feedr.orderNo";
const FEEDBACK_KEY = "feedr.feedback";
const FEEDBACK_ACK_MS = 1400; // how long "glad it landed." sits before the check-in folds away
const SEEN_KEY = "feedr.seen";

const $ = id => document.getElementById(id);
const SCREENS = ["s0","s1","s2","s3","s4","s5","s6"];

let CATALOG = [];
let LENGTHS = [], MOODS = [];
let mealLen, mood, round = [], current = "s0", plating = false;
let orderNo = Number(localStorage.getItem(ORDER_KEY)) || 0;   // survives a relaunch
let feedbackVideo = null;     // the video just sent to YouTube, waiting on a reaction

// Every video id actually opened, ever — not just this round. No account needed for this:
// one device, one browser, one localStorage entry is exactly the "profile" this wants.
let seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));

function markSeen(v){
  if(seen.has(v.id)) return;
  seen.add(v.id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

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
  else if(current === "s4"){ resetFeedback(); goto("s2", "2/2"); }
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

const pick = () => pickFrom(CATALOG, mood, mealLen, round, seen);

const watchUrl = v => "https://www.youtube.com/watch?v=" + v.id;

/* ---------- the come-back check-in ----------
   Fires from visibilitychange, not the anchor's click — a click only means the tab is
   about to lose focus, not that anyone watched anything. Arming on click and revealing on
   return means it only ever appears after an actual trip to YouTube and back. */

function armFeedback(v){ feedbackVideo = v; }

function resetFeedback(){
  feedbackVideo = null;
  $("feedback").classList.add("hidden");
  $("feedbackBtns").classList.remove("hidden");
  $("feedbackQ").textContent = "so, how was the chef's choice?";
}

function recordFeedback(liked){
  if(!feedbackVideo) return;
  const v = feedbackVideo;
  const log = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
  log.push({ id: v.id, title: v.title, channel: v.channel, mood, min: v.min,
             liked, at: new Date().toISOString() });
  while(log.length > 500) log.shift();      // keep it tidy — this isn't a database
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(log));

  feedbackVideo = null;                      // stop a stray visibilitychange re-arming it
  $("feedbackBtns").classList.add("hidden");
  $("feedbackQ").textContent = liked ? "glad it landed." : "noted, moving on.";
  setTimeout(resetFeedback, FEEDBACK_ACK_MS);
}

$("fbLike").onclick = () => recordFeedback(true);
$("fbDislike").onclick = () => recordFeedback(false);

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && feedbackVideo && current === "s4"){
    $("feedback").classList.remove("hidden");
  }
});

/* ---------- serving ---------- */

function serve(){
  if(plating) return;                        // a second tap mid-plating must not start a pick
  if(round.length >= MAX_PICKS) return lastCall();
  const v = pick();
  if(!v) return round.length ? lastCall() : undefined;

  // Claim it now, not when the ticket prints. The old code pushed inside the timeout, so a
  // reroll tapped during the 850ms beat picked against a stale round and could serve a
  // duplicate.
  round.push(v);
  plating = true;
  resetFeedback();                             // a new plate makes any pending check-in stale
  goto("s3");
  setTimeout(() => {
    plating = false;
    orderNo++;
    localStorage.setItem(ORDER_KEY, orderNo);

    $("tNo").textContent = "ORDER #" + String(orderNo).padStart(3,"0");
    $("tTime").textContent = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    $("tTitle").textContent = v.title;
    $("tMeta").textContent = v.channel + " · " + v.min + " MIN";
    $("tFit").textContent = "→ " + fitText(v, mealLen);
    $("openBtn").href = watchUrl(v);            // a real anchor: survives standalone PWAs
    $("openBtn").onclick = () => { armFeedback(v); markSeen(v); };

    // say it once, on the first plate, where "maybe the next one's better" starts
    $("biteNote").classList.toggle("hidden", round.length !== 1);

    const left = MAX_PICKS - round.length;
    const more = hasMore(CATALOG, mood, round);
    const btn = $("rerollBtn");
    btn.textContent = (left > 0 && more) ? "not this (" + left + " left)" : "view all " + round.length;
    btn.onclick = (left > 0 && more) ? serve : lastCall;

    goto("s4");
    const t = $("ticket");
    t.classList.remove("in"); void t.offsetWidth; t.classList.add("in");
  }, PLATING_MS);
}

function lastCall(){
  resetFeedback();                             // the ticket area is about to show the chooser instead
  // a thin mood can run out of fresh channels before three, so don't promise three
  $("lcSub").textContent = round.length === MAX_PICKS
    ? "that's your three. pick one & eat"
    : "that's all the kitchen's got. pick one & eat";
  const lc = $("lcOpts");
  lc.replaceChildren(...round.map(v => {
    const a = document.createElement("a");
    a.className = "lc-opt";
    a.href = watchUrl(v);
    a.target = "_blank";
    a.rel = "noopener";
    a.onclick = () => markSeen(v);
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
$("overBtn").onclick = () => { round = []; resetFeedback(); goto("s0"); };
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
