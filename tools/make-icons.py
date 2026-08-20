#!/usr/bin/env python3
"""Render the PNG app icons from the same shapes as icons/icon.svg.

Stdlib only — no Pillow, no build step. Run it after editing the mark:

    python3 tools/make-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG = (0x0D, 0x12, 0x0E)
PLAY = (0xF6, 0xEF, 0xDB)
STOPS = [(0.00, (0xFF, 0x70, 0x80)), (0.42, (0xFF, 0x2D, 0x46)), (1.00, (0xB3, 0x08, 0x1E))]


def lerp(a, b, t):
    return a + (b - a) * t


def amber_at(t):
    """Sample the radial gradient ramp used by the Feed-me button."""
    t = min(max(t, 0.0), 1.0)
    for (p0, c0), (p1, c1) in zip(STOPS, STOPS[1:]):
        if t <= p1:
            k = (t - p0) / (p1 - p0)
            return tuple(lerp(c0[i], c1[i], k) for i in range(3))
    return STOPS[-1][1]


def coverage(d):
    """Signed distance (in pixels, negative inside) -> antialiased coverage."""
    return min(max(0.5 - d, 0.0), 1.0)


def sd_round_rect(x, y, w, h, r):
    qx = abs(x - w / 2) - (w / 2 - r)
    qy = abs(y - h / 2) - (h / 2 - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_triangle(x, y, pts):
    """Distance to a convex triangle: farthest of its three half-planes."""
    worst = -1e9
    for i in range(3):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % 3]
        ex, ey = bx - ax, by - ay
        n = math.hypot(ex, ey)
        # inward-consistent normal (triangle points are given clockwise in y-down space)
        worst = max(worst, ((x - ax) * ey - (y - ay) * ex) / n)
    return worst


def over(dst, src, a):
    return tuple(lerp(dst[i], src[i], a) for i in range(3))


def render(size, maskable=False, square=False):
    """maskable: shrink the mark into Android's 80% safe zone. square: no rounded corners."""
    s = size
    corner = 0.0 if square else s * 0.2227
    inset = 0.72 if maskable else 1.0

    cx = cy = s / 2
    r = s * 0.3047 * inset          # amber disc
    ring = s * 0.3594 * inset       # faint outer ring
    ring_w = s * 0.0391 * inset

    # gradient focal point: CSS `circle at 32% 28%` of the disc's bounding box
    fx, fy = cx - 0.36 * r, cy - 0.44 * r
    fmax = r * 1.9803               # focal -> farthest corner of that box

    tri = [
        (cx - 0.30 * r, cy - 0.44 * r),
        (cx + 0.46 * r, cy),
        (cx - 0.30 * r, cy + 0.44 * r),
    ]

    rows = []
    for py in range(s):
        row = bytearray()
        y = py + 0.5
        for px in range(s):
            x = px + 0.5

            bg_a = 1.0 if square else coverage(sd_round_rect(x, y, s, s, corner))
            if bg_a <= 0.0:
                row += b"\x00\x00\x00\x00"
                continue

            col = BG

            ring_a = coverage(abs(math.hypot(x - cx, y - cy) - ring) - ring_w / 2)
            if ring_a > 0:
                col = over(col, (0xFF, 0x2D, 0x46), ring_a * 0.16)

            disc_a = coverage(math.hypot(x - cx, y - cy) - r)
            if disc_a > 0:
                col = over(col, amber_at(math.hypot(x - fx, y - fy) / fmax), disc_a)

            tri_a = coverage(sd_triangle(x, y, tri))
            if tri_a > 0:
                col = over(col, PLAY, tri_a)

            row += bytes(int(c + 0.5) for c in col) + bytes([int(bg_a * 255 + 0.5)])
        rows.append(bytes(row))
    return s, rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"{path.name}  {len(png) / 1024:.1f} KB")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, kwargs in {
        "icon-192.png": dict(size=192),
        "icon-512.png": dict(size=512),
        "icon-maskable-512.png": dict(size=512, maskable=True, square=True),
        "apple-touch-icon-180.png": dict(size=180, square=True),
    }.items():
        size, rows = render(**kwargs)
        write_png(OUT / name, size, rows)
