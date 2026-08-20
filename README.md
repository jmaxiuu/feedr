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
js/app.js               flow, picking, rerolls, last call
js/catalog.js           loads + validates data/catalog.json
data/catalog.json       ← the only file you need to edit
manifest.webmanifest    home-screen install
sw.js                   offline shell
icons/                  app icons (icon.svg is the source of truth)
fonts/                  self-hosted woff2 — see Typography
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

Two reasons this matters. A single wrong character in an 11-character id gives you a dead link or
somebody else's video — during this project a search result put a Beta Squad video on the Chunkz
channel, and a 16-subscriber account had reuploaded an essay under the original's exact title.
And `min` drives the whole picker, so a guessed runtime silently breaks meal-length matching.

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

Within a round it also avoids repeating a channel, so three rerolls give three different
creators. Preference, not rule — the fallback order is:

1. fits the meal + fresh channel
2. fits the meal + repeat channel
3. over-long + fresh channel
4. over-long + repeat channel

Runtime fit deliberately outranks channel variety: being handed the wrong length is worse than
being handed the same channel twice. **A mood needs at least 3 distinct channels** at a given
length to guarantee a repeat-free round.

That multiplier is `OVERRUN` at the top of [`js/app.js`](js/app.js).

Order numbers persist in `localStorage`, so the ticket keeps counting across relaunches instead
of resetting to #001 every time you open the app.

## Running it locally

The catalog is fetched, so `file://` won't work — you need a server:

```bash
cd feedr && python3 -m http.server 8000
```

Then open http://localhost:8000. To try it from your phone on the same Wi‑Fi, use your Mac's LAN
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

Edit files, then bump `CACHE` in [`sw.js`](sw.js) (`feedr-counter-v1` → `-v2`) and deploy. The old
cache is dropped on next launch. Catalog edits alone don't need a bump — `catalog.json` is fetched
network-first. If you add a new file to the app shell, add it to `SHELL` in `sw.js` too, or it
won't be there offline.
