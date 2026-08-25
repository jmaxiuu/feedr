# Feedr — The Counter

Sit down. The kitchen picks, you eat.

Four taps, no scrolling: **Hungry?** → **How long you got?** → **What's the mood?** → the kitchen
plates something and prints you an order ticket. Don't like it? Reroll — but only twice. After
three picks the kitchen closes and you choose from what you were served. That's the whole point.

Zero dependencies, zero build step. It's a static site.

## Layout

```
index.html              the six screens, markup only
styles.css              the diner — palette lives in :root
js/app.js               screens, flow, rerolls, last call
js/picker.js            the picking rules — pure, no DOM, directly testable
js/catalog.js           loads + validates data/catalog.json
data/catalog.json       ← the only file you need to edit
manifest.webmanifest    home-screen install
sw.js                   offline shell
icons/                  app icons (icon.svg is the source of truth)
fonts/                  self-hosted woff2 — see Typography
tools/serve.py          local dev server (no-cache — use this, not http.server)
tools/add-video.py      adds videos with verified metadata
tools/make-icons.py     regenerates the PNG icons from icon.svg's shapes
```

## Typography

Two faces, both self-hosted so the installed app looks right offline:

- **Bricolage Grotesque** (variable, 400–800) — the questions, the buttons, video titles.
- **Courier Prime** (400/700) — the order ticket, the marquee, every small uppercase label.

Only the `latin` and `latin-ext` subsets are included (148 KB total), both under the SIL Open
Font License 1.1. Self-hosted rather than loaded from Google Fonts on purpose: a PWA that falls
back to system fonts the moment it goes offline isn't much of an installed app.

## Palette

2am green-black with exactly one pop of red. Every colour is a variable in the `:root` block at
the top of [`styles.css`](styles.css) — nothing below that block hardcodes one, so repainting the
app is that one block plus the icon.

| | |
|---|---|
| `--bg` `#0d120e` | the room |
| `--red` `#ff2d46` | the one pop: the punctuation, the CTA, the play arrows |
| `--paper` `#f6efdb` | the order ticket |
| `--ink` `#ece8d9` / `--ink-dim` `#97a08c` | type on the dark |

To repaint the icon, edit [`icons/icon.svg`](icons/icon.svg), mirror the colours in the constants
at the top of [`tools/make-icons.py`](tools/make-icons.py), and re-run it.

## Editing the catalog

Everything the app serves lives in [`data/catalog.json`](data/catalog.json).

```json
{ "id": "dQw4w9WgXcQ", "title": "…", "channel": "…", "min": 14, "mood": "comfort" }
```

**Don't hand-write these.** Use the import script — it pulls the real title and channel from
YouTube's oEmbed endpoint and measures the runtime with yt-dlp:

```bash
python3 -m venv .venv && .venv/bin/pip install yt-dlp
YTDLP=.venv/bin/yt-dlp python3 tools/add-video.py learn "https://youtu.be/VIDEOID"
```

It takes bare ids, watch URLs, `youtu.be` links or shorts links, skips anything already present,
and rewrites the file in its canonical format. `--check` re-verifies every video already in the
catalog and reports channels that renamed or runtimes that drifted.

oEmbed 401s for two different reasons that look identical from the outside: a wrong, private or deleted id, or a real public video whose uploader disabled embedding. The second case doesn't affect Feedr — it opens a normal watch-page link, not an iframe embed — so the script falls back to yt-dlp's own metadata, but only once yt-dlp itself confirms the video is public. A genuinely bad id still fails loudly.

Two reasons this matters. A single wrong character in an 11-character id gives you a dead link or
somebody else's video — during this project a search result put a Beta Squad video on the Chunkz
channel, and a 16-subscriber account had reuploaded an essay under the original's exact title.
And `min` drives the whole picker, so a guessed runtime silently breaks meal-length matching.

A video belongs to exactly one mood — the catalog enforces unique ids, so it can't sit in
two mood lists at once. If a video genuinely spans two, pick the closer fit and note the
other in a comment; duplicating the row would break the round-integrity checks above.

The `lengths` and `moods` lists drive the two question screens. Add a mood there, give it at least
one video, and it appears — no code changes. A mood's `tag` is the small line beside its name;
a length's `sub` is the same. Mark one entry in each list `"default": true` for the launch state.

If an edit is malformed the app says so on screen instead of failing silently: unknown mood, a
mood with no videos, or a stray comma all produce a readable error.

### How a pick is chosen

Within the chosen mood, anything running longer than **1.5× the meal** is treated as a stretch
and held back — it's only served once everything that fits has been offered, and the ticket
labels it ("RUNS LONG", or "BOTTOMLESS" past an hour). Among the videos that fit, Feedr flips a
coin between the two closest to the meal length so repeat rounds aren't identical. If nothing in
the mood fits at all, it serves the single closest rather than gambling across a huge gap.

Two exclusions are **hard rules**, not preferences, because variety is the product:

- never the same video twice in a round
- never the same channel twice in a round

When they leave nothing to serve, the round **ends early** rather than repeating itself — the
last-call screen then says "that's all the kitchen's got" instead of promising three. So a mood
needs at least 3 distinct channels to produce a full three-pick round. Game show has two, so it
gives rounds of two until it gains a third channel.

The picking logic lives in [`js/picker.js`](js/picker.js) as pure functions with no DOM, so it
can be exercised directly at thousands of rounds a second — the app imports the same file that
gets tested, rather than a copy of it. `OVERRUN` is at the top of that module.

```js
// paste into the console on a running Feedr to re-check the rules
const {pickFrom} = await import('/js/picker.js');
const cat = await (await fetch('/data/catalog.json')).json();
for (const m of cat.moods) for (const l of cat.lengths) for (let t=0; t<3000; t++) {
  const round = [];
  for (let i=0; i<3; i++) { const v = pickFrom(cat.videos, m.id, l.minutes, round); if(!v) break; round.push(v); }
  const ids = round.map(v=>v.id), ch = round.map(v=>v.channel);
  console.assert(ids.length === new Set(ids).size, 'duplicate video', m.label, l.label);
  console.assert(ch.length === new Set(ch).size, 'duplicate channel', m.label, l.label);
}
```

### The line on the ticket

The first plate of a round carries one line, under the ticket and above the CTA:

> — first bite's the hard one. after that you just eat.

That's the argument of the whole app in one sentence. Doomscrolling isn't a failure of choice,
it's a failure to *commit* — the next thumbnail is always plausibly better, so the first click
never happens. Feedr removes the search but not the temptation, which is why the line sits
exactly where the temptation lives: next to "not this".

It shows on **pick 1 only**. Repeating it on every reroll would turn an idea into nagging.
The marquee carries the same thought more quietly ("the first bite is the hardest", "stop
looking for better").

### The come-back check-in

Tap "Open in YouTube" and the video opens in a new tab. Return to Feedr and a small prompt
appears above the ticket — "so, how was the chef's choice?" — with **liked it** / **not for
me**.

It's driven by the Page Visibility API, not the click itself: clicking only *arms* it with
the video that was opened; it's `visibilitychange` firing with the tab visible again that
actually reveals the prompt. That's deliberate — a click means the tab is about to lose
focus, not that anyone watched anything, so showing it on click would ask before there's
anything to answer. It only ever appears after an actual round trip to YouTube, and it clears
itself (reroll, back, start over, a new pick) so it never shows for the wrong video.

The reaction is logged to `localStorage` under `feedr.feedback` — id, title, channel, mood,
runtime, liked, timestamp — capped at the last 500. Nothing reads that log yet; the picker in
[`js/picker.js`](js/picker.js) doesn't use it. It's there to log honestly, not to promise a
smarter kitchen it doesn't yet have.

Order numbers persist in `localStorage`, so the ticket keeps counting across relaunches instead
of resetting to #001 every time you open the app.

## Running it locally

The catalog is fetched, so `file://` won't work — you need a server:

```bash
python3 tools/serve.py
```

Then open http://localhost:8765. Use this rather than `python3 -m http.server`: plain
http.server sends no cache headers, so browsers apply heuristic caching and will serve you an
old `styles.css` against a new `index.html` — which looks exactly like the app is broken. This
one sends `Cache-Control: no-store`. If you do hit a stale page, hard-reload (⌘⇧R).

To try it from your phone on the same Wi‑Fi, use your Mac's LAN
address (`ipconfig getifaddr en0`) — though note that install-to-home-screen and the service
worker only work over HTTPS or on `localhost`.

## Deploying (free)

Any static host works. Everything is referenced with relative paths, so it runs from a
subdirectory too (e.g. a GitHub Pages project site).

**Netlify** — drag the `feedr` folder onto <https://app.netlify.com/drop>. Done, HTTPS included.
`netlify.toml` is already set up if you'd rather connect the repo for auto-deploys.

**GitHub Pages** — push to GitHub, then Settings → Pages → Source: **GitHub Actions**.
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes on every push to `main`.

**Cloudflare Pages / Vercel** — connect the repo; leave the build command empty and the output
directory as `/`.

## Installing on a phone

Open the deployed HTTPS URL and:

- **iOS Safari** — Share → *Add to Home Screen*.
- **Android Chrome** — the install prompt appears, or menu → *Install app*.

It launches full-screen with no browser chrome, and the shell works offline (opening a video
still needs a connection, obviously).

## Shipping an update

Edit files, then bump `CACHE` in [`sw.js`](sw.js) (`feedr-counter-v5` → `-v6`) and deploy. The old
cache is dropped on next launch. Catalog edits alone don't need a bump — `catalog.json` is fetched
network-first. If you add a new file to the app shell, add it to `SHELL` in `sw.js` too, or it
won't be there offline.
