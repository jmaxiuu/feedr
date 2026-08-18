# Feedr

One tap picks what you watch while you eat. No scrolling, no menu paralysis.

Pick a meal length and a mood, hit **Feed me**, and Feedr prints an order ticket with a
single video. Don't like it? Reroll — but only twice. After three picks the kitchen
closes and you choose from what you were served. That's the whole point.

Zero dependencies, zero build step. It's a static site.

## Layout

```
index.html              markup only
styles.css              the diner
js/app.js               the app: chips, picking, rerolls, the forced choice
js/catalog.js           loads + validates data/catalog.json
data/catalog.json       ← the only file you need to edit
manifest.webmanifest    home-screen install
sw.js                   offline shell
icons/                  app icons (icon.svg is the source of truth)
fonts/                  self-hosted woff2 — see Typography below
tools/make-icons.py     regenerates the PNG icons from icon.svg's shapes
```

## Typography

Two faces, both self-hosted so the installed app looks right offline:

- **Bricolage Grotesque** (variable, 400–800) — the sign out front: the logo, every button
  and chip, and video titles wherever they appear.
- **Courier Prime** (400/700) — the kitchen printer: the order ticket and all of the small
  uppercase labels.

Only the `latin` and `latin-ext` subsets are included (148 KB total). Both are licensed under
the SIL Open Font License 1.1. To swap a face, drop the woff2 in `fonts/`, update the
`@font-face` blocks and the `--display` / `--mono` variables at the top of
[`styles.css`](styles.css), and update the precache list in [`sw.js`](sw.js).

## Palette

Every colour the app uses is a variable in the `:root` block at the top of
[`styles.css`](styles.css) — nothing below that block hardcodes one. Repainting the app is
that block plus the icon.

Three palettes exist as commits on `main`, so you can flip between them:

```bash
git log --oneline          # find the palette commits
git checkout <sha>         # then hard-reload the page
```

| | accent | fill / type on it | CTA |
|---|---|---|---|
| **gold** | `#ffb224` | `#ffb224`, near-black type | `#e4572e` |
| **red** | `#ff2626` | `#d10000`, white type | `#d10000` |
| **orange** | `#ff8c1a` | `#ff8c1a`, near-black type | `#cc3d17` |

Two things to know if you retune it. A fill light enough to read as gold or orange cannot
carry white text — white on `#ff8c1a` is 2.3:1 — so those palettes put near-black on the
fill instead. And a red accent swallows the "Open in YouTube" button: gold and orange keep
the CTA as its own distinct hue, red can't.

The service worker cache is named after the palette (`feedr-orange`), so switching commits
drops the previous cache instead of serving you a stale shell.

Every text/background pair clears WCAG AA at its rendered size, with one known exception:
gold's CTA `#e4572e` is 3.68:1 against white. It is the prototype's original value, kept as
it was for comparison — `#cc3d17` is the nearest passing red if you settle on gold.

To repaint the icon, edit [`icons/icon.svg`](icons/icon.svg), mirror the colours in the
constants at the top of [`tools/make-icons.py`](tools/make-icons.py), and re-run it.

## Editing the catalog

Everything the app serves lives in [`data/catalog.json`](data/catalog.json).

```json
{ "id": "dQw4w9WgXcQ", "title": "…", "channel": "…", "min": 14, "mood": "comfort" }
```

- `id` — the bit after `watch?v=` in a YouTube URL.
- `min` — runtime in minutes. See how picking works below; exact numbers aren't critical.
- `mood` — must match one of the `id`s in the `moods` list.

### How a pick is chosen

Within the selected mood, anything running longer than **1.5× the meal** is treated as a
stretch and held back — it's only served once everything that fits has already been offered,
and the ticket labels it ("Runs long", or "Bottomless" past an hour). Among the videos that
do fit, Feedr flips a coin between the two closest to the meal length so repeat rounds
aren't identical. If nothing in the mood fits at all, it serves the single closest rather
than gambling across a huge gap.

That multiplier is `OVERRUN` at the top of [`js/app.js`](js/app.js) — raise it if you want
long videos offered more freely, lower it to be stricter.

A mood needs a decent spread of runtimes to feel good. If every video in a mood is an hour
plus, a "Snack" request there has nothing short to offer and will serve a long one.

The `lengths` and `moods` lists drive the chips at the top of the screen. Add a mood there,
give it at least one video, and a new chip appears — no code changes. Mark one entry in each
list with `"default": true` to set what's selected on launch.

If an edit is malformed the app says so on screen instead of failing silently: unknown mood,
a mood with no videos, or a stray comma all produce a readable error.

## Running it locally

The catalog is fetched, so `file://` won't work — you need a server:

```bash
cd feedr && python3 -m http.server 8000
```

Then open http://localhost:8000. To try it from your phone on the same Wi‑Fi, use your Mac's
LAN address (`ipconfig getifaddr en0`) — though note that install-to-home-screen and the
service worker only work over HTTPS or on `localhost`.

## Deploying (free)

Any static host works. Everything is referenced with relative paths, so it runs from a
subdirectory too (e.g. a GitHub Pages project site).

**Netlify** — drag the `feedr` folder onto <https://app.netlify.com/drop>. Done, HTTPS included.
`netlify.toml` is already set up if you'd rather connect the repo for auto-deploys.

**GitHub Pages** — push to GitHub, then Settings → Pages → Source: **GitHub Actions**.
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes on every push to `main`.

**Cloudflare Pages / Vercel** — connect the repo; leave the build command empty and the
output directory as `/`.

## Installing on a phone

Open the deployed HTTPS URL and:

- **iOS Safari** — Share → *Add to Home Screen*.
- **Android Chrome** — the install prompt appears, or menu → *Install app*.

It launches full-screen with no browser chrome, and the shell works offline (opening a
video still needs a connection, obviously).

## Shipping an update

Edit files, then bump `CACHE` in [`sw.js`](sw.js) (`feedr-v6` → `feedr-v7`) and deploy. The
old cache is dropped on next launch. Catalog edits alone don't need a bump — `catalog.json`
is fetched network-first.
