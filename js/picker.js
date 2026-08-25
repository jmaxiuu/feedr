/**
 * What the kitchen serves. Pure functions, no DOM — so this exact file can be exercised
 * by a test at thousands of rounds a second, and the app can't drift from what was tested.
 */

export const OVERRUN = 1.5;   // a pick may run to 1.5x the meal before it counts as a stretch

/**
 * The next video for a round, or null when nothing is left that respects the rules.
 *
 * Two hard exclusions — variety is the product, so neither is a preference:
 *   - never the same video twice in a round
 *   - never the same channel twice in a round
 * When they leave nothing, the round ends early rather than repeating itself.
 *
 * `seen` is different: it's a lifetime "already watched" set, not a within-round rule, and
 * it's a preference, not a hard wall. A thin mood a regular gets served from a lot will
 * eventually run out of unwatched videos entirely — when that happens this falls back to
 * repeating rather than serving nothing, the same way OVERRUN falls back when nothing fits.
 */
export function pickFrom(catalog, mood, mealLen, round, seen = new Set()){
  const servedIds = new Set(round.map(v => v.id));
  const servedChannels = new Set(round.map(v => v.channel));
  const pool = catalog.filter(v =>
    v.mood === mood && !servedIds.has(v.id) && !servedChannels.has(v.channel));
  if(!pool.length) return null;

  const unseen = pool.filter(v => !seen.has(v.id));
  const candidates = unseen.length ? unseen : pool;

  // Closest-two-then-coin-flip alone would hand you a 2-hour podcast for a 20-minute lunch
  // whenever the mood is thin. Anything you can't finish in half again the meal is a stretch,
  // so it's only served once everything that fits has been offered.
  const fits = candidates.filter(v => v.min <= mealLen * OVERRUN);
  const bench = (fits.length ? fits : candidates).slice();
  bench.sort((a,b) => Math.abs(a.min - mealLen) - Math.abs(b.min - mealLen));

  // Coin-flip between the two closest keeps repeat rounds from being identical — but only
  // when both actually fit. With nothing in range, take the closest and nothing else.
  const top = fits.length ? bench.slice(0,2) : bench.slice(0,1);
  return top[Math.floor(Math.random() * top.length)];
}

/** Is there anything left this round could still be offered? Drives the reroll label. */
export function hasMore(catalog, mood, round){
  return pickFrom(catalog, mood, Infinity, round) !== null;
}

export function fitText(v, mealLen){
  if(v.min >= 60) return "BOTTOMLESS — PAUSE WHEN YOU'RE FULL";
  const d = v.min - mealLen;
  if(Math.abs(d) <= 3) return "FITS YOUR MEAL EXACTLY";
  if(d < 0) return "SHORT & SWEET — ROOM FOR DESSERT";
  if(v.min > mealLen * OVERRUN) return "RUNS LONG — YOU'LL BE PAUSING THIS ONE";
  return "RUNS LONG — CHEF'S CHOICE";
}
