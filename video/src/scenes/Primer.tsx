import React from 'react';
import {StarState} from './StarGL';
import {T} from './times';
import {C, MONO, SANS} from '../theme';
import {clamp, ease, inOutCubic, inOutSine, lerp, outCubic, outExpo, seg, smooth, vis} from '../lib/time';

// The primer: a star and its planet; the planet lost in the glare; a transit and its light curve; Earth
// and the Sun, where the dip is 1 part in 11,900.

const K_DWARF: [number, number, number] = [1.0, 0.36, 0.1];
const K_CORE: [number, number, number] = [1.0, 0.74, 0.44];
const SUN: [number, number, number] = [1.0, 0.66, 0.34];
const SUN_CORE: [number, number, number] = [1.0, 0.97, 0.9];
const EARTH_K = 1 / 109.1;
// sized so the central dip, with limb darkening, is exactly 1% (k^2 / mean brightness = 0.01)
const DEMO_K = Math.sqrt(0.01 * (1 - 0.55 / 3 - 0.2 / 6));

// Quadratic limb darkening, as in the shader.
const U1 = 0.55;
const U2 = 0.2;
const I = (r: number) => {
  const mu = Math.sqrt(Math.max(1 - r * r, 0));
  return 1 - U1 * (1 - mu) - U2 * (1 - mu) * (1 - mu);
};
const I_MEAN = 1 - U1 / 3 - U2 / 6;

/** Fractional dimming when a planet of radius k (in star radii) sits at distance z from the disc centre. */
export function transitDepth(z: number, k: number): number {
  if (z >= 1 + k) return 0;
  // overlap area of two circles (radii 1 and k, centre distance z), times the brightness under the planet
  let area: number;
  if (z <= 1 - k) area = Math.PI * k * k;
  else {
    const a = k * k * Math.acos(clamp((z * z + k * k - 1) / (2 * z * k), -1, 1));
    const b = Math.acos(clamp((z * z + 1 - k * k) / (2 * z), -1, 1));
    const c = 0.5 * Math.sqrt(Math.max((-z + k + 1) * (z + k - 1) * (z - k + 1) * (z + k + 1), 0));
    area = a + b - c;
  }
  const rc = Math.min(Math.max(z, 0), 1 - 1e-6);
  return (area * I(Math.min(rc, 0.999))) / (Math.PI * I_MEAN);
}

// Edge-on transits for phases C (a large planet, so the dip shows on an ordinary scale) and D (Earth):
// the planet moves around a circular orbit seen exactly edge-on, at these mid-transit times and speeds.
const tMidC = () => T.dims + 0.55;
// Earth crosses while the axis still shows 1%, so its dip looks flat; then the axis zooms 100x
const tMidD = () => T.earth + 1.3;
const SPEED_C = 0.36;   // radians per second
const SPEED_D = 0.9;    // Earth crosses quickly, so its dip is a narrow notch in a longer stretch of time
// phase A's orbit is tilted enough that the planet passes below the star, not across it
const TILT = 0.42;

type V3 = [number, number, number];
type Geo = {x: number; front: boolean; rel: V3};

/** The planet on an exactly edge-on orbit: x on screen, and its position relative to the star in 3D (x
 * right, y down, z toward us), from which the shader lights it: night side to us at transit, day side behind. */
function edgeOn(t: number, earth: boolean, sx: number): Geo {
  const a = 560;
  const th = (earth ? SPEED_D : SPEED_C) * (t - (earth ? tMidD() : tMidC()));
  return {x: sx + a * Math.sin(th), front: Math.cos(th) > 0, rel: [Math.sin(th), 0, Math.cos(th)]};
}

/** Unit vector from the planet toward the star. */
const toStar = (rel: V3): V3 => {
  const n = Math.hypot(...rel) || 1;
  return [-rel[0] / n, -rel[1] / n, -rel[2] / n];
};

const STAR_X = 960;
const STAR_Y_EDGE = 360;

/** The close-up star's state at time t. */
export function starAt(t: number): StarState {
  const s: StarState = {
    opacity: 1, x: STAR_X, y: 470, r: 150, color: K_DWARF, core: K_CORE, glare: 0, halo: 0, exposure: 1.1, time: t,
    px: 0, py: 0, pr: 15, pFront: 0, pLit: 1, light: [0, 0, 1],
  };
  // A: arrival and the planet's orbit, seen a little from above
  // the star emerges from the dive as a glaring point at the centre, then opens into a disc
  const arrive = outExpo(seg(t, T.primer - 0.25, T.primer + 0.95));
  const emerge = 1 - outCubic(seg(t, T.primer - 0.1, T.primer + 0.7));
  const pull = ease(t, T.glare - 0.1, T.glare + 1.9, inOutCubic);
  const back = ease(t, T.passes - 0.6, T.passes + 0.6, inOutCubic);
  const R0 = lerp(2, 150, arrive);
  s.r = lerp(R0, 3.5, pull);
  s.glare = Math.max(pull * (1 - back), 0.85 * emerge);
  // the glare blooms slowly while we hold on it
  s.halo = Math.max(pull, 0.5 * emerge) + 0.25 * inOutSine(seg(t, T.glare + 1.6, T.passes - 0.4));
  s.opacity = seg(t, T.primer - 0.45, T.primer - 0.05);
  const a = lerp(470 * lerp(0.3, 1, arrive), 52, pull);
  // The orbit is tilted toward us; the planet starts on the far side, above the star, where we see its lit
  // face, and comes round in front later, while it is lost in the glare.
  const phi = 3.5 + (t - T.primer) * 0.42;
  const ox = Math.cos(phi);
  const oz = Math.sin(phi);
  s.px = STAR_X + a * ox;
  s.py = 470 + a * oz * TILT;
  s.pr = lerp(15, 2.2, pull);
  // in front of or behind the star; the shader hides it behind the disc pixel by pixel
  s.pFront = oz > 0 ? 1 : 0;
  s.pLit = lerp(1, 0.08, pull);
  const relA: V3 = [ox, oz * TILT, oz * Math.sqrt(1 - TILT * TILT)];
  s.light = toStar(relA);

  if (t >= T.passes - 0.6) {
    // C, D: edge-on; the star rises to make room for the light curve, then becomes the Sun
    const sy = lerp(470, STAR_Y_EDGE, back);
    const toSun = ease(t, T.earth - 0.2, T.earth + 0.6, inOutCubic);
    const R = lerp(lerp(3.5, 175, back), 190, toSun);
    s.y = sy;
    s.r = R;
    const mix3 = (p: number[], q: number[]): [number, number, number] => [lerp(p[0], q[0], toSun), lerp(p[1], q[1], toSun), lerp(p[2], q[2], toSun)];
    s.color = mix3(K_DWARF, SUN);
    s.core = mix3(K_CORE, SUN_CORE);
    // The large demo planet shrinks away out to the right before Earth appears, small, on the left: two
    // planets in turn, so neither jumps across the star.
    const inD = t >= T.earth - 0.2;
    const g = edgeOn(t, inD, STAR_X);
    // before the edge-on view settles, carry the planet in from where it was
    s.px = lerp(s.px, g.x, back);
    s.py = lerp(s.py, sy, back);
    s.pr = inD
      ? EARTH_K * R * seg(t, T.earth - 0.2, T.earth + 0.1)
      : lerp(s.pr, DEMO_K * R, back) * (1 - smooth(seg(t, T.earth - 0.6, T.earth - 0.2)));
    s.pFront = g.front ? 1 : 0;
    s.pLit = lerp(s.pLit, 1, back);
    const rel: V3 = [lerp(relA[0], g.rel[0], back), lerp(relA[1], g.rel[1], back), lerp(relA[2], g.rel[2], back)];
    s.light = toStar(rel);
    s.exposure = lerp(1.1, 1.0, toSun);
  }
  // E: hand over to the field of star systems
  s.opacity *= 1 - seg(t, T.lineUp - 0.2, T.lineUp + 0.6);
  return s;
}

/** Light-curve value (fractional dimming) of the demo transit or the Earth transit at time t. Earth's is
 * the blocked area alone, (R_Earth / R_Sun)^2 = 1 part in 11,900, the figure quoted on screen. */
function dipAt(t: number, earth: boolean) {
  const R = earth ? 190 : 175;
  const k = earth ? EARTH_K : DEMO_K;
  const g = edgeOn(t, earth, STAR_X);
  if (!g.front) return 0;
  const z = Math.abs(g.x - STAR_X) / R;
  return earth ? (transitDepth(z, k) * I_MEAN) / I(Math.min(z, 0.999)) : transitDepth(z, k);
}

const LC = {x0: 400, x1: 1520, y0: 690, h: 210};

/** Overlays for the primer: orbit path, labels, the light curve. */
export const PrimerOverlay: React.FC<{t: number}> = ({t}) => {
  const s = starAt(t);
  const pull = ease(t, T.glare - 0.1, T.glare + 1.9, inOutCubic);
  const arrive = outExpo(seg(t, T.primer - 0.25, T.primer + 0.95));

  // A/B: the orbit ellipse and labels
  const orbitA = vis(t, T.primer + 0.3, T.passes - 0.2, 0.8, 0.5);
  const a = lerp(470 * lerp(0.3, 1, arrive), 52, pull);
  const labA = vis(t, T.primer + 0.6, T.passes - 0.3, 0.5, 0.4);
  const starLab = vis(t, T.primer + 0.9, T.glare + 0.3, 0.5, 0.4);
  // The planet's label always sits to its upper left, so it never crosses the star: while the orbit is
  // large (the planet passes above the star, on the far side) it rides with the planet; as the star shrinks
  // into a glaring point it settles at a fixed spot beside the glare, and only the leader line follows.
  const settle = smooth(pull);
  const lx = lerp(s.px - 40, STAR_X - 70, settle);    // right edge of the text
  const ly = lerp(s.py - 44, 470 - 70, settle);       // baseline
  const lineX = lx + 6;
  const lineY = ly + 6;
  const ring = vis(t, T.glare + 1.2, T.passes - 0.3, 0.6, 0.4);

  // C/D: light curve panel
  const lcA = vis(t, T.passes + 0.2, T.lineUp + 0.4, 0.6, 0.6);
  const earthPhase = t >= T.earth - 0.2;
  // the y axis magnifies 100 times, geometrically, so the motion reads as a steady zoom
  const zoomY = ease(t, T.partIn - 0.15, T.partIn + 0.75, inOutCubic);
  const axisRange = earthPhase ? 0.015 * Math.pow(0.01, zoomY) : 0.015;
  const tStartC = T.passes + 0.4;
  const tEndC = T.earth - 0.4;
  const tStartD = T.earth + 0.05;
  const tEndD = T.earth + 2.6;
  // The curve's pen is always straight below the planet (at its x on screen), so the dip lines up with the
  // star above it, edge to edge. Left of where the pen starts, the line is flat at 100%.
  const trace = (t0: number, t1: number, earth: boolean, rng: number) => {
    const n = 260;
    const now = Math.min(t, t1);
    if (now <= t0) return '';
    const yOf = (d: number) => LC.y0 + 30 + (d / rng) * (LC.h - 50);
    const pt = (tt: number) => `${clamp(edgeOn(tt, earth, STAR_X).x, LC.x0, LC.x1).toFixed(1)},${yOf(dipAt(tt, earth)).toFixed(1)}`;
    const pts: string[] = [`${LC.x0},${yOf(0).toFixed(1)}`];
    for (let i = 0; i <= n; i++) {
      const tt = t0 + ((t1 - t0) * i) / n;
      if (tt > now) break;
      pts.push(pt(tt));
    }
    pts.push(pt(now));
    return pts.join(' ');
  };
  const traceC = trace(tStartC, tEndC, false, 0.015);
  const traceD = earthPhase ? trace(tStartD, tEndD, true, axisRange) : '';
  const fadeC = 1 - seg(t, T.earth - 0.3, T.earth + 0.3);
  const yTick = (frac: number) => LC.y0 + 30 + (frac / (earthPhase ? axisRange : 0.015)) * (LC.h - 50);
  const zoomed = earthPhase && zoomY > 0.5;
  const tick2 = zoomed ? 0.0001 : 0.01;
  const pct = (frac: number) => `${(100 * (1 - frac)).toFixed(zoomed ? 2 : 0)}%`;
  const dimLab = vis(t, tMidC() + 0.9, T.earth - 0.2, 0.4, 0.4);
  const zoomLab = vis(t, T.partIn - 0.1, T.lineUp + 0.2, 0.3, 0.4) * seg(zoomY, 0.1, 0.25);
  // the lower gridline only where it cannot collide with the 100% label
  const t2a = clamp((yTick(tick2) - (yTick(0) + 30)) / 30) * clamp((LC.y0 + LC.h + 20 - yTick(tick2)) / 40);
  const notchA = vis(t, T.partIn + 0.7, T.lineUp + 0.3, 0.4, 0.4);
  // the notch is under the Sun: half its width is the Sun's radius plus Earth's
  const notchX = STAR_X;
  const notchHalf = 190 + 190 * EARTH_K;
  const earthLab = vis(t, T.earth + 0.3, T.lineUp, 0.5, 0.4);
  const sunLab = vis(t, T.earth + 0.2, T.lineUp, 0.5, 0.4);
  const earthNear = vis(t, tMidD() - 1.2, tMidD() + 1.2, 0.3, 0.3);

  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
      {/* the whole orbit: tilted enough that it never crosses the star's disc */}
      <g opacity={orbitA * 0.55}>
        <ellipse cx={STAR_X} cy={470} rx={a} ry={a * TILT} fill="none" stroke={C.text2} strokeWidth={1.6} strokeDasharray="2 8" />
      </g>
      {/* labels */}
      <g opacity={labA} fontFamily={SANS}>
        <line x1={s.px + (lineX - s.px) * 0.12} y1={s.py + (lineY - s.py) * 0.12} x2={lineX} y2={lineY} stroke={C.text} strokeWidth={1.8} />
        <text x={lx} y={ly} fill={C.text} fontSize={40} fontWeight={500} textAnchor="end">exoplanet</text>
        {/* a fixed-size marker; only its dashes turn, slowly */}
        <circle cx={s.px} cy={s.py} r={18} fill="none" stroke={C.text} strokeWidth={1.8}
          strokeDasharray="3 5" strokeDashoffset={-t * 10} opacity={ring} />
      </g>
      <g opacity={starLab} fontFamily={SANS}>
        <text x={STAR_X + s.r * 0.8 + 34} y={470 + s.r * 0.8 + 44} fill={C.text2} fontSize={34}>a star</text>
      </g>

      {/* light curve */}
      <g opacity={lcA}>
        <line x1={LC.x0} x2={LC.x1} y1={yTick(0)} y2={yTick(0)} stroke={C.grid} strokeWidth={1} />
        <line x1={LC.x0} x2={LC.x1} y1={yTick(tick2)} y2={yTick(tick2)} stroke={C.grid} strokeWidth={1} strokeDasharray="4 6" opacity={t2a} />
        {/* "100%" becomes "100.00%" by crossfading, not by swapping text */}
        <text x={LC.x0 - 16} y={yTick(0) + 9} fill={C.text2} fontSize={28} fontFamily={MONO} textAnchor="end"
          opacity={1 - (earthPhase ? seg(zoomY, 0.35, 0.65) : 0)}>100%</text>
        <text x={LC.x0 - 16} y={yTick(0) + 9} fill={C.text2} fontSize={28} fontFamily={MONO} textAnchor="end"
          opacity={earthPhase ? seg(zoomY, 0.35, 0.65) : 0}>100.00%</text>
        <text x={LC.x0 - 16} y={yTick(tick2) + 9} fill={C.text2} fontSize={28} fontFamily={MONO} textAnchor="end" opacity={t2a}>{pct(tick2)}</text>
        <text x={LC.x0} y={LC.y0 - 10} fill={C.text2} fontSize={26} fontFamily={SANS} letterSpacing={1.5}>
          STAR'S BRIGHTNESS
        </text>
        <text x={LC.x1} y={LC.y0 + LC.h + 30} fill={C.text2} fontSize={26} fontFamily={SANS} textAnchor="end" letterSpacing={1.5}>
          TIME →
        </text>
        <polyline points={traceC} fill="none" stroke={C.cyan} strokeWidth={4.5} strokeLinejoin="round" opacity={fadeC} />
        <polyline points={traceD} fill="none" stroke={C.cyan} strokeWidth={4.5} strokeLinejoin="round" />
        <g opacity={dimLab}>
          <text x={STAR_X} y={yTick(0.01) + 48}
            fill={C.cyan} fontSize={38} textAnchor="middle" fontFamily={MONO}>−1%</text>
        </g>
        <g opacity={zoomLab}>
          <text x={LC.x1} y={LC.y0 - 10} fill={C.cyan} fontSize={30} fontFamily={MONO} textAnchor="end">
            zoomed in {Math.round(Math.pow(100, zoomY))}×
          </text>
        </g>
        <g opacity={notchA} fontFamily={SANS}>
          <text x={notchX + notchHalf + 36} y={LC.y0 + 120} fill={C.text} fontSize={46} fontWeight={600}>1 part in 11,900</text>
          <text x={notchX + notchHalf + 36} y={LC.y0 + 162} fill={C.text2} fontSize={30}>for 13 hours, once a year</text>
        </g>
      </g>
      <g opacity={sunLab} fontFamily={SANS}>
        <text x={STAR_X - 205} y={STAR_Y_EDGE + 212} fill={C.text2} fontSize={36} textAnchor="end">the Sun</text>
      </g>
      <g opacity={earthLab} fontFamily={SANS}>
        <line x1={s.px} y1={STAR_Y_EDGE - 18} x2={s.px} y2={STAR_Y_EDGE - 236} stroke={C.earth} strokeWidth={2} />
        <circle cx={s.px} cy={STAR_Y_EDGE} r={13} fill="none" stroke={C.earth} strokeWidth={2} opacity={earthNear} />
        <text x={s.px + 12} y={STAR_Y_EDGE - 244} fill={C.earth} fontSize={38} fontWeight={500}>Earth, to scale</text>
      </g>
    </svg>
  );
};

export const primerVisible = (t: number) => t > T.primer - 0.4 && t < T.lineUp + 1;
