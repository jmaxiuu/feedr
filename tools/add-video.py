#!/usr/bin/env python3
"""Add videos to data/catalog.json with verified metadata.

    python3 tools/add-video.py <mood> <url-or-id> [<url-or-id> ...]
    python3 tools/add-video.py --check          # re-verify everything already in the catalog

Never write ids, titles or runtimes by hand. A single wrong character in an 11-char
YouTube id gives you a dead link or somebody else's video, and `min` drives the whole
picker — a guessed runtime silently breaks meal-length matching.

Title and channel come from YouTube's oEmbed endpoint; the runtime comes from yt-dlp:

    python3 -m venv .venv && .venv/bin/pip install yt-dlp
    YTDLP=.venv/bin/yt-dlp python3 tools/add-video.py learn https://youtu.be/...
"""

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "data" / "catalog.json"
YTDLP = os.environ.get("YTDLP") or shutil.which("yt-dlp")


def video_id(s):
    """Accept a bare id, a watch URL, a youtu.be link or a shorts link."""
    if re.fullmatch(r"[\w-]{11}", s):
        return s
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/embed/)([\w-]{11})", s)
    if not m:
        sys.exit(f"can't find a video id in: {s}")
    return m.group(1)


def fetch(vid):
    url = f"https://www.youtube.com/watch?v={vid}"
    if not YTDLP:
        sys.exit("yt-dlp not found. Install it and/or set YTDLP=/path/to/yt-dlp — see the "
                 "docstring. Runtimes must be measured, not guessed.")

    try:
        with urllib.request.urlopen(
            f"https://www.youtube.com/oembed?url={url}&format=json", timeout=20) as r:
            meta = json.load(r)
        title, channel = meta["title"].strip(), meta["author_name"]
    except Exception as e:
        # oEmbed 401s both for a wrong/private/deleted id and for a real, public video
        # whose uploader just disabled embedding — the error alone can't tell them apart.
        # Fall back to yt-dlp's own metadata, but only once yt-dlp itself confirms the
        # video is real and public, so a genuinely bad id still fails loudly.
        fields = "title", "channel", "availability"
        print_args = sum((["--print", f"%({f})s"] for f in fields), [])
        probe = subprocess.run([YTDLP, "--no-warnings", *print_args, url],
                               capture_output=True, text=True).stdout.splitlines()
        if len(probe) != len(fields) or probe[2] != "public":
            sys.exit(f"{vid}: not reachable via oEmbed ({e}), and yt-dlp couldn't confirm "
                     f"it's a public video either — wrong id, private, or deleted?")
        title, channel = probe[0], probe[1]

    dur = subprocess.run([YTDLP, "--no-warnings", "--print", "%(duration)s", url],
                         capture_output=True, text=True).stdout.strip()
    if not dur.isdigit():
        sys.exit(f"{vid}: yt-dlp returned no duration")
    return dict(id=vid, title=title, channel=channel, min=round(int(dur) / 60))


def write(d):
    """Rewrite the catalog: one video per line, grouped by mood, blank line between groups."""
    j = lambda x: json.dumps(x, ensure_ascii=False)
    groups = []
    for m in d["moods"]:
        vids = sorted((v for v in d["videos"] if v["mood"] == m["id"]),
                      key=lambda v: (v["channel"], v["min"]))
        groups.append(['    { "id": %s, "title": %s, "channel": %s, "min": %d, "mood": %s }'
                       % (j(v["id"]), j(v["title"]), j(v["channel"]), v["min"], j(v["mood"]))
                       for v in vids])
    total = sum(len(g) for g in groups)
    lines, seen = [], 0
    for gi, g in enumerate(groups):
        for line in g:
            seen += 1
            lines.append(line + ("," if seen < total else ""))
        if gi < len(groups) - 1:
            lines.append("")

    def block(key, items):
        body = ["    %s," % j(x) for x in items]
        body[-1] = body[-1].rstrip(",")
        return ['  "%s": [' % key] + body + ["  ],"]

    out = ["{", '  "$comment": %s,' % j(d["$comment"])]
    out += block("lengths", d["lengths"]) + block("moods", d["moods"])
    out += ['  "videos": ['] + lines + ["  ]", "}", ""]
    CATALOG.write_text("\n".join(out))
    json.loads(CATALOG.read_text())          # fail loudly rather than ship broken JSON


def main(argv):
    d = json.loads(CATALOG.read_text())
    moods = {m["id"] for m in d["moods"]}

    if argv and argv[0] == "--check":
        for v in d["videos"]:
            got = fetch(v["id"])
            drift = []
            if got["channel"] != v["channel"]:
                drift.append(f"channel {v['channel']!r} -> {got['channel']!r}")
            if abs(got["min"] - v["min"]) > 1:
                drift.append(f"min {v['min']} -> {got['min']}")
            print(("DRIFT " + v["id"] + ": " + "; ".join(drift)) if drift else "ok    " + v["id"])
        return

    if len(argv) < 2:
        sys.exit(__doc__)
    mood, refs = argv[0], argv[1:]
    if mood not in moods:
        sys.exit(f"unknown mood {mood!r} — pick one of: {', '.join(sorted(moods))}")

    have = {v["id"] for v in d["videos"]}
    for ref in refs:
        vid = video_id(ref)
        if vid in have:
            print(f"skip   {vid} (already in the catalog)")
            continue
        row = fetch(vid)
        row["mood"] = mood
        d["videos"].append(row)
        have.add(vid)
        print(f"added  {row['min']:>3} min  {row['channel']:<20}{row['title']}")
    write(d)
    print(f"\ncatalog: {len(d['videos'])} videos, "
          f"{len({v['channel'] for v in d['videos']})} channels")


if __name__ == "__main__":
    main(sys.argv[1:])
