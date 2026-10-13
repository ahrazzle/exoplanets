"""Write docs/media/banner.svg, the README banner.

A limb-darkened star with a planet crossing it, and the light curve that crossing makes: the
curve's time axis is the planet's horizontal position, so the dip sits directly below the star.
The dip is computed from the drawing itself (quadratic limb darkening, the planet's disc
integrated over the star), with seeded noise for the photometry. The background stars are seeded
too, so the file is the same on every run. Standard library only:

    python3 docs/media/make_banner.py

The banner is drawn in the website's colours (site/style.css) and uses system fonts only, because
GitHub shows SVGs in README files as images (no web fonts, scripts or external files). The motion
is CSS and stops under prefers-reduced-motion; without it the still frame is mid-transit.
"""
import math
import os
import random

W, H = 1280, 400
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "banner.svg")

# Colours, from site/style.css
BG0, BG1 = "#04060c", "#0a1020"
INK, INK2, DIM = "#f4ede1", "#d3ccbe", "#939cb0"
AMBER, AMBER_HI, COOL = "#f0b25a", "#ffd9a0", "#8ec5e6"
SERIF = '"Iowan Old Style", "Charter", "Bitstream Charter", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif'
MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

# Geometry: the light curve runs from X0 to X1; the star is centred on that span.
X0, X1 = 702, 1214
CX, CY, R = (X0 + X1) / 2, 146, 98      # star
K, B = 0.15, 0.30                        # planet/star radius ratio, impact parameter
PR = K * R                               # planet radius (px)
PY = CY + B * R                          # planet track
U1, U2 = 0.45, 0.25                      # quadratic limb darkening
LY, DEPTH_PX = 292, 34                   # light-curve baseline and drawn depth of the deepest point
PERIOD_S = 11.0                          # one crossing, seconds
MOVE_END = 0.86                          # fraction of the loop spent crossing; the rest is a pause


def intensity(rho):
    """Quadratic limb darkening at fractional radius rho (0 centre, 1 limb)."""
    mu = math.sqrt(max(0.0, 1 - rho * rho))
    return 1 - U1 * (1 - mu) - U2 * (1 - mu) ** 2


def blocked(px):
    """Fraction of the star's light blocked by the planet centred at (px, PY)."""
    n_r, n_t, s = 24, 48, 0.0
    for i in range(n_r):
        rr = (i + 0.5) / n_r * PR
        for j in range(n_t):
            t = (j + 0.5) / n_t * 2 * math.pi
            x, y = px + rr * math.cos(t) - CX, PY + rr * math.sin(t) - CY
            d = math.hypot(x, y) / R
            if d < 1:
                s += intensity(d) * rr
    area = s * (PR / n_r) * (2 * math.pi / n_t)
    total = math.pi * R * R * (1 - U1 / 3 - U2 / 6)
    return area / total


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


# Light curve, sampled every 2 px; the deepest point is drawn DEPTH_PX below the baseline.
xs = [X0 + i * 2 for i in range((X1 - X0) // 2 + 1)]
dips = [blocked(x) for x in xs]
scale = DEPTH_PX / max(dips)
ys = [LY + d * scale for d in dips]
curve = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in zip(xs, ys))

rng = random.Random(4206066)
phot = []
for x, y in zip(xs, ys):
    phot.append((x, y + rng.gauss(0, 4.2)))

# Background stars: dust everywhere, a few brighter ones that twinkle.
dust = []
for _ in range(300):
    x, y = rng.uniform(8, W - 8), rng.uniform(8, H - 8)
    if math.hypot(x - CX, y - CY) < R + 6:
        continue
    dust.append((x, y, 0.35 + 0.8 * rng.random() ** 2, 0.10 + 0.45 * rng.random() * rng.random()))
bright = []
for _ in range(16):
    x, y = rng.uniform(30, W - 30), rng.uniform(24, H - 24)
    if math.hypot(x - CX, y - CY) < R + 30 or (40 < x < 660 and 60 < y < 360):
        continue
    bright.append((x, y, 0.9 + 0.7 * rng.random(), rng.uniform(3.5, 7.5), rng.uniform(0, 6)))


# Star surface: radial gradient whose stops follow the limb-darkening law.
def mix(c0, c1, t):
    a = [int(c0[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02x}" for i in range(3))


star_stops = []
for rho in (0, 0.3, 0.5, 0.65, 0.78, 0.87, 0.93, 0.97, 1.0):
    i = intensity(rho)                    # 1 at centre, about 0.3 at the limb
    t = (1 - i) / (1 - intensity(1.0))    # 0 centre .. 1 limb
    col = mix("#fff0d2", "#ffc878", min(1, t / 0.55)) if t < 0.55 else mix("#ffc878", "#c2601f", (t - 0.55) / 0.45)
    star_stops.append(f'<stop offset="{rho:.2f}" stop-color="{col}"/>')

# Keyframes. The planet and scan line move in x only; the dot on the curve follows the samples.
x_start, x_end = X0, X1
mid = CX


def pct(i, n):
    return f"{100 * MOVE_END * i / n:.3f}".rstrip("0").rstrip(".") + "%"


n = 48
dot_frames = []
for i in range(n + 1):
    x = x_start + (x_end - x_start) * i / n
    y = LY + blocked(x) * scale
    dot_frames.append(f"{pct(i, n)}{{transform:translate({f(x - mid)}px,{f(y - LY)}px)}}")
dot_frames.append(f"100%{{transform:translate({f(x_end - mid)}px,0px)}}")

css = f"""
.serif{{font-family:{SERIF}}}
.mono{{font-family:{MONO}}}
.mv{{animation:mv {PERIOD_S}s linear infinite}}
.dot{{animation:dot {PERIOD_S}s linear infinite}}
.reveal{{animation:reveal {PERIOD_S}s linear infinite}}
.trail{{animation:trail {PERIOD_S}s linear infinite}}
.edge{{animation:edge {PERIOD_S}s linear infinite}}
.tw{{animation:tw 5s ease-in-out infinite}}
@keyframes mv{{0%{{transform:translateX({f(x_start - mid)}px)}}{100 * MOVE_END:g}%,100%{{transform:translateX({f(x_end - mid)}px)}}}}
@keyframes dot{{{"".join(dot_frames)}}}
@keyframes reveal{{0%{{transform:scaleX(0)}}{100 * MOVE_END:g}%,100%{{transform:scaleX(1)}}}}
@keyframes trail{{0%,{100 * MOVE_END:g}%{{opacity:1}}97%,100%{{opacity:0}}}}
@keyframes edge{{0%{{opacity:0}}6%,{100 * MOVE_END - 4:g}%{{opacity:1}}{100 * MOVE_END:g}%,100%{{opacity:0}}}}
@keyframes tw{{0%,100%{{opacity:.35}}50%{{opacity:1}}}}
@media (prefers-reduced-motion:reduce){{.mv,.dot,.reveal,.trail,.edge,.tw{{animation:none}}}}
"""

o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">')
o.append('<title id="t">Multi-sector TESS transit searches</title>')
o.append('<desc id="d">Independent TESS transit searches. A planet crosses a limb-darkened star, and below it '
         'the light curve dips while the planet is in front of the star. These are planet candidates, not confirmed planets.</desc>')
o.append(f"<style>{css}</style>")
o.append("<defs>")
o.append(f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1124"/><stop offset=".7" stop-color="{BG0}"/></linearGradient>')
o.append('<radialGradient id="neb1" cx="960" cy="150" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#283e78" stop-opacity=".42"/><stop offset="1" stop-color="#283e78" stop-opacity="0"/></radialGradient>')
o.append('<radialGradient id="neb2" cx="0" cy="0" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1e2850" stop-opacity=".45"/><stop offset="1" stop-color="#1e2850" stop-opacity="0"/></radialGradient>')
o.append(f'<radialGradient id="surf" cx="{f(CX)}" cy="{f(CY)}" r="{f(R)}" gradientUnits="userSpaceOnUse">{"".join(star_stops)}</radialGradient>')
o.append(f'<radialGradient id="halo" cx="{f(CX)}" cy="{f(CY)}" r="{f(R * 2.1)}" gradientUnits="userSpaceOnUse">'
         f'<stop offset=".44" stop-color="{AMBER}" stop-opacity=".30"/><stop offset=".6" stop-color="{AMBER}" stop-opacity=".09"/>'
         f'<stop offset="1" stop-color="{AMBER}" stop-opacity="0"/></radialGradient>')
o.append(f'<clipPath id="disc"><circle cx="{f(CX)}" cy="{f(CY)}" r="{f(R)}"/></clipPath>')
o.append('<clipPath id="card"><rect width="1280" height="400" rx="18"/></clipPath>')
# granulation: faint turbulence on the disc
o.append('<filter id="gran" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="7"/>'
         '<feColorMatrix values="0 0 0 0 .62  0 0 0 0 .3  0 0 0 0 .08  2.2 0 0 0 -1.05"/></filter>')
o.append('<filter id="soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>')
# the bright curve is revealed from the left by a rect that scales from X0
o.append(f'<clipPath id="drawn"><rect class="reveal" x="{X0 - 4}" y="{LY - 30}" width="{X1 - X0 + 8}" height="{DEPTH_PX + 60}" '
         f'style="transform-origin:{X0 - 4}px {LY}px"/></clipPath>')
o.append("</defs>")

o.append('<g clip-path="url(#card)">')
o.append(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')
o.append(f'<rect width="{W}" height="{H}" fill="url(#neb1)"/><rect width="{W}" height="{H}" fill="url(#neb2)"/>')
o.append('<g fill="#ece8de">' + "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r:.2f}" opacity="{a:.2f}"/>' for x, y, r, a in dust) + "</g>")
o.append('<g fill="#fff6e6">' + "".join(
    f'<circle class="tw" cx="{f(x)}" cy="{f(y)}" r="{r:.2f}" style="animation-duration:{d:.1f}s;animation-delay:-{dl:.1f}s"/>'
    for x, y, r, d, dl in bright) + "</g>")

# star
o.append(f'<circle cx="{f(CX)}" cy="{f(CY)}" r="{f(R * 2.1)}" fill="url(#halo)"/>')
o.append(f'<circle cx="{f(CX)}" cy="{f(CY)}" r="{f(R)}" fill="url(#surf)"/>')
o.append(f'<rect x="{f(CX - R)}" y="{f(CY - R)}" width="{f(2 * R)}" height="{f(2 * R)}" filter="url(#gran)" clip-path="url(#disc)" opacity=".3"/>')
# transit chord
o.append(f'<line x1="{X0}" y1="{f(PY)}" x2="{X1}" y2="{f(PY)}" stroke="{COOL}" stroke-opacity=".22" stroke-dasharray="2 5"/>')

# light curve frame: baseline ticks and labels
o.append(f'<line x1="{X0}" y1="{LY}" x2="{X1}" y2="{LY}" stroke="#a4b6de" stroke-opacity=".16"/>')
o.append(f'<g class="mono" font-size="12" letter-spacing="1.6" fill="{DIM}">'
         f'<text x="{X0}" y="{LY - 18}">BRIGHTNESS</text>'
         f'<text x="{X1}" y="{LY + DEPTH_PX + 30}" text-anchor="end">TIME &#8594;</text></g>')
o.append('<g fill="#c9d3ea" opacity=".42">' + "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.2"/>' for x, y in phot) + "</g>")
o.append(f'<path d="{curve}" fill="none" stroke="{AMBER}" stroke-opacity=".22" stroke-width="1.6"/>')
o.append(f'<g class="trail" clip-path="url(#drawn)"><path d="{curve}" fill="none" stroke="{AMBER}" stroke-width="5" opacity=".35" filter="url(#soft)"/>'
         f'<path d="{curve}" fill="none" stroke="{AMBER_HI}" stroke-width="1.9" stroke-linejoin="round"/></g>')

# moving parts, drawn at the mid-transit position; the animation moves them in x
y_mid = LY + blocked(mid) * scale
o.append(f'<g class="mv" transform="translate(0 0)"><g class="edge">'
         f'<line x1="{f(mid)}" y1="{f(PY + PR + 4)}" x2="{f(mid)}" y2="{f(LY - 8)}" stroke="{COOL}" stroke-opacity=".38" stroke-dasharray="3 4"/>'
         f'<circle cx="{f(mid)}" cy="{f(PY)}" r="{f(PR + 3)}" fill="none" stroke="{COOL}" stroke-opacity=".5"/>'
         f'<circle cx="{f(mid)}" cy="{f(PY)}" r="{f(PR)}" fill="{BG0}"/></g></g>')
o.append(f'<g class="dot" transform="translate(0 {f(y_mid - LY)})"><g class="edge">'
         f'<circle cx="{f(mid)}" cy="{LY}" r="7" fill="{AMBER}" opacity=".25"/>'
         f'<circle cx="{f(mid)}" cy="{LY}" r="3.2" fill="{AMBER_HI}"/></g></g>')

# text
o.append(f'<g transform="translate(64 78)">'
         f'<svg width="30" height="20" viewBox="0 0 30 20" y="-15"><circle cx="15" cy="7.5" r="5.6" fill="none" stroke="{AMBER}" stroke-width="1.4"/>'
         f'<circle cx="17.4" cy="9" r="1.6" fill="{INK}"/><path d="M1 16.5 H10.5 L12.2 18.6 H17.8 L19.5 16.5 H29" fill="none" stroke="{COOL}" stroke-width="1.4"/></svg>'
         f'<text class="mono" x="44" y="0" font-size="15" letter-spacing="3.2" fill="{COOL}">INDEPENDENT TESS TRANSIT SEARCHES</text></g>')
o.append(f'<text class="serif" x="62" y="164" font-size="56" fill="{INK}" letter-spacing="-.5">Faint transits in light</text>')
o.append(f'<text class="serif" x="62" y="228" font-size="56" font-style="italic" fill="{AMBER_HI}" letter-spacing="-.5">TESS had already recorded</text>')
o.append(f'<g transform="translate(64 262)"><rect width="262" height="32" rx="2" fill="{AMBER}" fill-opacity=".12" stroke="{AMBER}" stroke-opacity=".7"/>'
         f'<text class="mono" x="131" y="21" font-size="13.5" letter-spacing="1.8" fill="{AMBER_HI}" text-anchor="middle">CANDIDATES &#183; NOT CONFIRMED</text></g>')
o.append(f'<text class="mono" x="64" y="346" font-size="13.5" letter-spacing="1.6" fill="{DIM}">'
         f'NASA TESS &#183; MULTI-SECTOR &#183; K AND M DWARFS &#183; TOI HOSTS &#183; FULL SKY</text>')

# amber corner brackets and the card edge
o.append(f'<g fill="none" stroke="{AMBER}" stroke-width="1.5" opacity=".8"><path d="M28 50 V28 H50"/><path d="M{W - 28} {H - 50} V{H - 28} H{W - 50}"/></g>')
o.append("</g>")
o.append(f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="17.5" fill="none" stroke="#a4b6de" stroke-opacity=".22"/>')
o.append("</svg>")

with open(OUT, "w") as fh:
    fh.write("\n".join(o) + "\n")
print(OUT, os.path.getsize(OUT), "bytes")
