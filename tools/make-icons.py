#!/usr/bin/env python3
"""
make-icons.py — renders the app icons with no image-library dependency.

Draws a leaf-and-fork mark over a rounded green field using signed distance
fields, then writes real PNGs with nothing but zlib and struct. Run it after
changing icons/icon.svg so the raster icons stay in sync:

    python3 tools/make-icons.py

ERRERLabs — MIT licensed.
"""

import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")

BG_TOP = (31, 111, 74)      # --green-700
BG_BOTTOM = (15, 46, 33)    # --green-900
LEAF = (200, 236, 216)
VEIN = (31, 111, 74)
FORK = (245, 250, 247)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def over(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def smoothstep(edge0, edge1, x):
    if edge0 == edge1:
        return 0.0 if x < edge0 else 1.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def rounded_rect_sdf(px, py, half, radius):
    """Signed distance to a rounded square centred at the origin."""
    qx = abs(px) - (half - radius)
    qy = abs(py) - (half - radius)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - radius


def ellipse_sdf(px, py, rx, ry):
    """Approximate signed distance to an ellipse — good enough for an icon."""
    k = math.hypot(px / rx, py / ry)
    return (k - 1.0) * min(rx, ry)


def segment_sdf(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / denom))
    return math.hypot(wx - t * vx, wy - t * vy)


def render(size, maskable=False):
    """Returns a list of rows, each a list of (r, g, b, a) tuples."""
    px_rows = []
    # A maskable icon must keep its content inside the safe circle (40% radius),
    # so the mark shrinks and the field bleeds to the edges.
    field_half = 0.5 if maskable else 0.44
    mark_scale = 0.62 if maskable else 0.78
    corner = 0.5 if maskable else 0.22

    for y in range(size):
        row = []
        for x in range(size):
            # Normalised coordinates in [-0.5, 0.5]
            u = (x + 0.5) / size - 0.5
            v = (y + 0.5) / size - 0.5

            d = rounded_rect_sdf(u, v, field_half, corner * field_half)
            field_a = 1.0 - smoothstep(0.0, 1.6 / size, d)
            if field_a <= 0.001:
                row.append((0, 0, 0, 0))
                continue

            # Vertical gradient with a soft highlight in the upper left.
            t = (v + 0.5)
            colour = lerp(BG_TOP, BG_BOTTOM, t * 0.95)
            glow = max(0.0, 1.0 - math.hypot(u + 0.16, v + 0.2) * 2.1)
            colour = over(colour, (255, 255, 255), glow * 0.10)

            mu, mv = u / mark_scale, v / mark_scale

            # --- leaf: two rotated ellipses intersected, tilted 35 degrees ---
            ang = math.radians(-35)
            lx = mu * math.cos(ang) - mv * math.sin(ang)
            ly = mu * math.sin(ang) + mv * math.cos(ang)
            lx -= 0.16
            # A vesica — the lens between two overlapping circles — is the
            # shape a leaf actually is: pointed at both ends, widest in the middle.
            r, offset = 0.34, 0.235
            leaf_d = max(
                math.hypot(lx, ly - offset) - r,
                math.hypot(lx, ly + offset) - r,
            )
            leaf_a = 1.0 - smoothstep(0.0, 2.0 / size, leaf_d)
            if leaf_a > 0:
                colour = over(colour, LEAF, leaf_a)
                tip = math.sqrt(r * r - offset * offset)
                vein = segment_sdf(lx, ly, -tip * 0.92, 0.0, tip * 0.92, 0.0) - 0.012
                colour = over(colour, VEIN, (1.0 - smoothstep(0.0, 2.0 / size, vein)) * leaf_a * 0.85)

            # --- fork: three tines, a neck and a handle, lower left ---
            fx, fy = mu + 0.235, mv
            tine_w = 0.030
            fork_d = 1e9
            for off in (-0.075, 0.0, 0.075):
                fork_d = min(fork_d, segment_sdf(fx, fy, off, -0.315, off, -0.105) - tine_w)
            fork_d = min(fork_d, segment_sdf(fx, fy, -0.105, -0.105, 0.105, -0.105) - 0.034)
            fork_d = min(fork_d, segment_sdf(fx, fy, 0.0, -0.12, 0.0, 0.075) - 0.046)
            fork_d = min(fork_d, segment_sdf(fx, fy, 0.0, 0.06, 0.0, 0.325) - 0.032)
            fork_a = 1.0 - smoothstep(0.0, 2.0 / size, fork_d)
            if fork_a > 0:
                colour = over(colour, FORK, fork_a)

            row.append((colour[0], colour[1], colour[2], round(field_a * 255)))
        px_rows.append(row)
    return px_rows


def write_png(path, rows):
    size = len(rows)
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-192.png", 192, True),
        ("maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
        ("favicon-32.png", 32, False),
    ]
    for name, size, maskable in targets:
        path = os.path.join(OUT, name)
        n = write_png(path, render(size, maskable))
        print(f"{name:24} {size:>4}px  {n / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
