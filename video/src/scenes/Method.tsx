import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {LC} from '../lib/data';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {clamp, ease, inOutCubic, inOutSine, lerp, outCubic, seg, smooth, vis} from '../lib/time';

// How the search finds a planet, on TIC 4206066's real light curves (30-minute bins):
//   "Building on his method, we took every star like       a size line-up
//    the Sun or smaller"
//   "and joined up to eight years of observations"         TESS watched it in 2018, 2020 and 2025; joined
//   "One dip is too faint to see"                          zoom into one transit: lost in the noise
//   "But a planet's orbit always takes the same time,      gold marks every 3.18 days, then equal hops from
//    so its dips repeat at regular intervals"              each crossing to the next
//   "We don't know how long the orbit takes,               the interval becomes "?"; cut lines a guessed
//    so we try thousands of guesses"                       period apart sweep along the record
//   "For each guess, we cut the data into pieces that      the record is cut at the lines and the pieces
//    long and stack them"                                  stacked as rows; the guess keeps scanning
//   "When the guess is right, the dips line up and         at 3.18 days the gold column is straight and the
//    stand out from the noise"                             average of the rows shows the dip
// Gold marks the moments the planet crosses (from its known orbit): an illustration of where the dips are.
// The average curve below the stack is computed from the data at each trial period.

const STRIP = {x0: 230, x1: 1690, y: 470, k: 0.03};
const ZOOM = {half: 0.6, w: 1200, k: 0.08};
const STACK = {x0: 360, x1: 1560, y0: 180, y1: 590, k: 0.004};
const AVG = {y: 720, k: 0.11, bins: 72};
const P_START = 2.55;
const P_SWEEP = 1.3;    // the first guess shown, while the cut lines sweep along the record

type Pt = {t: number; f: number; sec: number; xs: number; inB: boolean};

function prepare(lc: LC) {
  const sectors = lc.rabtsevich.sectors;
  const b = lc.rabtsevich.planets[0];
  const spans = sectors.map((s) => s.t[s.t.length - 1] - s.t[0]);
  const total = spans.reduce((a, c) => a + c, 0);
  const gap = 24;
  const scale = (STRIP.x1 - STRIP.x0 - gap * (sectors.length - 1)) / total;
  const pts: Pt[] = [];
  let x = STRIP.x0;
  sectors.forEach((s, si) => {
    s.t.forEach((tt, i) => {
      const ph = ((((tt - b.t0) / b.P + 0.5) % 1) + 1) % 1 - 0.5;
      pts.push({t: tt, f: clamp(s.f[i], -1500, 1500), sec: si, xs: x + (tt - s.t[0]) * scale,
        inB: Math.abs(ph * b.P) < (0.5 * b.dur_h) / 24});
    });
    x += spans[si] * scale + gap;
  });
  // each sector's rows start at the planet's last crossing before the sector, so at the right period every
  // row has its crossing in the middle; rows are laid out for the shortest trial period, so they never move
  const ref = sectors.map((s) => b.t0 + Math.floor((s.t[0] - b.t0) / b.P) * b.P);
  const rowsPer = sectors.map((s, i) => Math.ceil((s.t[s.t.length - 1] - ref[i]) / P_START) + 1);
  const nRows = rowsPer.reduce((a, c) => a + c, 0);
  const groupGap = 10;
  const rowH = (STACK.y1 - STACK.y0 - groupGap * (sectors.length - 1)) / nRows;
  const rowBase: number[] = [];
  let acc = 0;
  rowsPer.forEach((n, i) => {
    rowBase.push(STACK.y0 + acc * rowH + i * groupGap);
    acc += n;
  });
  const transits: number[] = [];
  sectors.forEach((s) => {
    for (let k = Math.ceil((s.t[0] - b.t0) / b.P); b.t0 + k * b.P <= s.t[s.t.length - 1]; k++) transits.push(b.t0 + k * b.P);
  });
  // the transit to zoom into: the one in the last sector with the most data around it
  const sl = sectors[sectors.length - 1];
  const around = (tt: number) => sl.t.filter((x) => Math.abs(x - tt) < ZOOM.half).length;
  const tc = transits.filter((tt) => tt >= sl.t[0] && tt <= sl.t[sl.t.length - 1])
    .reduce((best, tt) => (around(tt) > around(best) ? tt : best), sl.t[0]);
  const stripX = (tt: number) => {
    let xx = STRIP.x0;
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      if (tt <= s.t[s.t.length - 1] || i === sectors.length - 1) return xx + (tt - s.t[0]) * scale;
      xx += spans[i] * scale + gap;
    }
    return xx;
  };
  return {pts, b, ref, rowsPer, rowBase, rowH, tc, transits, stripX, days: Math.round(total)};
}

// the pieces leave the record for the stack from here, and the guess holds at P_START while they fly
const flyT0 = () => T.stacked + 0.9;
const scanT0 = () => T.stacked + 2.7;

/** The guessed period: it sweeps up to P_START along the record, holds while the pieces are stacked, then
 * scans on, slowing as it reaches the planet's period on "When the guess is right". */
function periodAt(t: number, best: number) {
  if (t < flyT0()) return lerp(P_SWEEP, P_START, inOutSine(seg(t, T.guesses + 0.2, flyT0())));
  return lerp(P_START, best, outCubic(seg(t, scanT0(), T.rightOne)));
}

export const Method: React.FC<{t: number; lc: LC}> = ({t, lc}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const d = useMemo(() => prepare(lc), [lc]);
  const best = d.b.P;
  const P = periodAt(t, best);
  const lock = seg(t, T.rightOne - 0.1, T.rightOne + 0.4);

  // timing of each step
  const timelineA = outCubic(seg(t, T.joined + 0.05, T.joined + 0.6));
  const joinU = ease(t, T.joined + 1.0, T.joined + 2.6, inOutCubic);
  const zoomIn = ease(t, T.oneDip - 0.3, T.oneDip + 0.9, inOutCubic);
  const zoomOut = ease(t, T.repeat - 0.1, T.repeat + 0.9, inOutCubic);
  const zoomU = zoomIn * (1 - zoomOut);
  const goldA = Math.max(seg(t, T.oneDip + 0.5, T.oneDip + 0.9) * (1 - zoomOut), seg(t, T.repeat + 0.6, T.repeat + 1.6));
  const stackT0 = flyT0();
  const fade = 1 - seg(t, T.turnedUp - 0.4, T.turnedUp + 0.2);

  // phase-binned average of every row at the current trial period
  const avg = useMemo(() => {
    const sum = new Float64Array(AVG.bins);
    const cnt = new Float64Array(AVG.bins);
    for (const p of d.pts) {
      const u = (p.t - d.ref[p.sec]) / P;
      const ph = u - Math.round(u);
      const k = Math.min(AVG.bins - 1, Math.floor((ph + 0.5) * AVG.bins));
      sum[k] += p.f;
      cnt[k] += 1;
    }
    return Array.from(sum, (s, k) => (cnt[k] ? s / cnt[k] : 0));
  }, [d, P]);

  useLayoutEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== W * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (timelineA <= 0 || fade <= 0) return;
    const tAxis = (tt: number) => lerp(STRIP.x0, STRIP.x1, (tt - 1325) / (4100 - 1325));
    for (const p of d.pts) {
      // strip: on the time axis, then joined
      const xStrip = lerp(tAxis(p.t), p.xs, joinU);
      const yStrip = STRIP.y - p.f * STRIP.k * lerp(0.35, 1, joinU);
      // zoom: one transit's surroundings fill the width
      const xZoom = 960 + ((p.t - d.tc) / ZOOM.half) * (ZOOM.w / 2);
      const yZoom = STRIP.y - p.f * ZOOM.k;
      let x = lerp(xStrip, xZoom, zoomU);
      let y = lerp(yStrip, yZoom, zoomU);
      // stack: the row this point falls in at the current trial period
      const u = (p.t - d.ref[p.sec]) / P;
      const k = Math.round(u);
      const ph = u - k;
      const rowY = d.rowBase[p.sec] + (k + 0.5) * d.rowH;
      const xs = (STACK.x0 + STACK.x1) / 2 + ph * (STACK.x1 - STACK.x0);
      const ys = rowY - p.f * STACK.k * d.rowH * 2.5;
      // pieces leave the strip one row at a time, top to bottom
      const order = (d.rowBase[p.sec] - STACK.y0 + k * d.rowH) / (STACK.y1 - STACK.y0);
      const su = smooth(clamp((t - stackT0 - order * 0.9) / 0.8));
      x = lerp(x, xs, su);
      y = lerp(y, ys, su);
      // in the stack, points near the ends of a row fade, so points that move to the next row do not pop
      const edge = lerp(1, smooth(clamp((0.5 - Math.abs(ph)) / 0.07)), su);
      const a = timelineA * fade * edge;
      if (p.inB && goldA > 0) {
        // once the column is straight it glows gently while we hold on it
        const pulse = 1 + lock * 0.35 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 0.8 * Math.max(0, t - T.rightOne)));
        g.fillStyle = `rgba(255,200,87,${(0.35 + 0.65 * goldA) * a})`;
        const sz = lerp(lerp(2.6, 6, zoomU), 4.2, su) * pulse;
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      } else {
        g.fillStyle = `rgba(92,225,230,${0.6 * a})`;
        const sz = lerp(lerp(2.2, 5, zoomU), 2.2, su);
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    // the average of every row, below the stack
    const avgA = seg(t, stackT0 + 1.1, stackT0 + 1.6) * fade;
    if (avgA > 0) {
      g.lineWidth = 3.5;
      g.strokeStyle = `rgba(${Math.round(lerp(92, 255, lock))},${Math.round(lerp(225, 200, lock))},${Math.round(lerp(230, 87, lock))},${avgA})`;
      g.beginPath();
      avg.forEach((v, i) => {
        const x = STACK.x0 + ((i + 0.5) / AVG.bins) * (STACK.x1 - STACK.x0);
        const y = AVG.y - v * AVG.k;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
  });

  // labels
  const lineup = vis(t, T.weTook, T.joined + 0.15, 0.45, 0.4);
  const watched = vis(t, T.joined + 0.1, T.joined + 2.3, 0.4, 0.4);
  const joinedLab = vis(t, T.joined + 2.4, T.oneDip - 0.1, 0.4, 0.3);
  const yearsA = timelineA * (1 - joinU);
  const dipLab = vis(t, T.oneDip + 0.6, T.repeat + 0.1, 0.4, 0.3);
  const schedLab = vis(t, T.repeat + 0.8, T.guesses, 0.4, 0.4);
  const unknown = seg(t, T.dontKnow + 0.1, T.dontKnow + 0.5);
  const guessLab = vis(t, T.guesses + 0.1, T.rightOne + 0.1, 0.4, 0.3);
  // the guess label rises above the stack as the pieces fly into it
  const guessY = lerp(250, 128, ease(t, flyT0() + 0.2, flyT0() + 1.2, inOutCubic));
  const rightLab = vis(t, T.rightOne, T.turnedUp, 0.4, 0.4);
  const avgLab = vis(t, stackT0 + 1.4, T.turnedUp, 0.5, 0.4);
  const secYears = lc.rabtsevich.sectors.map((s) => s.year);
  const tAxisL = (tt: number) => lerp(STRIP.x0, STRIP.x1, (tt - 1325) / (4100 - 1325));
  const halfDur = ((0.5 * d.b.dur_h) / 24 / ZOOM.half) * (ZOOM.w / 2);
  const ticksA = seg(t, T.repeat + 0.5, T.repeat + 0.6) * (1 - 0.5 * seg(t, T.dontKnow, T.dontKnow + 0.5)) *
    (1 - seg(t, flyT0() - 0.2, flyT0() + 0.3));
  // where the joined record skips the years between visits, so the hops stop there
  const joinsA = vis(t, T.repeat + 0.8, T.guesses - 0.1, 0.5, 0.4);
  const joins = lc.rabtsevich.sectors.slice(1).map((s, i) => {
    const prev = lc.rabtsevich.sectors[i];
    const end = prev.t[prev.t.length - 1];
    return {x: (d.stripX(end) + d.stripX(s.t[0] + 1e-6)) / 2, years: Math.round((s.t[0] - end) / 365.25)};
  });
  // equal hops from each crossing to the next, drawn left to right
  const hopsA = (1 - seg(t, T.guesses - 0.2, T.guesses + 0.3)) * (1 - 0.5 * seg(t, T.dontKnow, T.dontKnow + 0.5));
  // cut lines a guessed period apart, sweeping along the record until the pieces fly
  const cutsA = seg(t, T.guesses + 0.1, T.guesses + 0.5) * (1 - seg(t, flyT0() + 0.1, flyT0() + 0.6));
  const cuts: number[] = [];
  if (cutsA > 0) {
    lc.rabtsevich.sectors.forEach((sec, si) => {
      const t1 = sec.t[sec.t.length - 1];
      for (let k = Math.floor((sec.t[0] - d.ref[si]) / P - 0.5); d.ref[si] + (k + 0.5) * P <= t1; k++) {
        const tt = d.ref[si] + (k + 0.5) * P;
        if (tt >= sec.t[0]) cuts.push(d.stripX(tt));
      }
    });
  }

  return (
    <div style={{position: 'absolute', inset: 0, opacity: fade}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {/* the size line-up: stars like the Sun or smaller */}
        <g opacity={lineup}>
          {[
            {r: 1.0, c: '#FFF1D6', l: 'the Sun', x: 700},
            {r: 0.65, c: '#FFC27A', l: 'orange dwarfs', x: 1000},
            {r: 0.35, c: '#FF9A55', l: 'red dwarfs', x: 1230},
            {r: 0.15, c: '#FF7A45', l: '', x: 1380},
          ].map((s, i) => {
            const u = outCubic(seg(t, T.weTook + i * 0.12, T.weTook + 0.6 + i * 0.12));
            const R = 130 * s.r * u * (1 + 0.05 * inOutSine(seg(t, T.weTook + 0.5, T.joined + 0.2)));
            return (
              <g key={i}>
                <defs>
                  <radialGradient id={`sz${i}`}>
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="0.55" stopColor={s.c} />
                    <stop offset="1" stopColor={s.c} stopOpacity={0.55} />
                  </radialGradient>
                </defs>
                <circle cx={s.x} cy={470} r={R * 1.25} fill={s.c} opacity={0.12} />
                <circle cx={s.x} cy={470} r={R} fill={`url(#sz${i})`} />
                <text x={s.x} y={470 + 130 + 60} fill={i === 0 ? C.text : C.text2} fontFamily={SANS} fontSize={32} textAnchor="middle" opacity={u}>
                  {s.l}
                </text>
              </g>
            );
          })}
          <text x={960} y={196} fill={C.text} fontFamily={MONO} fontSize={48} textAnchor="middle">4,039,203 stars</text>
          <text x={960} y={248} fill={C.text2} fontFamily={SANS} fontSize={30} textAnchor="middle">
            cooler than 6,500 K and less than 1.5 times the Sun's size
          </text>
        </g>

        {/* the time axis */}
        <g opacity={yearsA} fontFamily={MONO} fontSize={26} fill={C.text2}>
          {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => {
            const tt = 1484.5 + (y - 2019) * 365.25;
            return (
              <g key={y}>
                <line x1={tAxisL(tt)} x2={tAxisL(tt)} y1={600} y2={612} stroke={C.text2} />
                <text x={tAxisL(tt)} y={642} textAnchor="middle">{y}</text>
              </g>
            );
          })}
          <line x1={STRIP.x0} x2={STRIP.x1} y1={600} y2={600} stroke={C.grid} />
        </g>
        <g opacity={yearsA} fontFamily={MONO} fontSize={30} fill={C.text}>
          {lc.rabtsevich.sectors.map((s, i) => (
            <text key={i} x={tAxisL(s.t[0])} y={STRIP.y - 64}>{secYears[i]}</text>
          ))}
        </g>
        <text x={960} y={250} fill={C.text} fontFamily={SANS} fontSize={40} textAnchor="middle" opacity={watched}>
          TESS watched this star a month or two at a time
        </text>
        <g opacity={joinedLab} fontFamily={SANS}>
          <text x={960} y={250} fill={C.text} fontSize={40} textAnchor="middle">joined: {d.days} days of measurements</text>
          <text x={960} y={300} fill={C.text2} fontSize={30} textAnchor="middle">TIC 4206066, a reading every 30 minutes</text>
        </g>

        {/* one dip, lost in the noise */}
        <g opacity={dipLab}>
          <rect x={960 - halfDur} y={STRIP.y - 150} width={2 * halfDur} height={300} fill={C.gold} opacity={0.14} />
          <text x={960} y={STRIP.y - 170} fill={C.gold} fontFamily={SANS} fontSize={40} fontWeight={600} textAnchor="middle">
            a dip is hiding here
          </text>
          <text x={960} y={STRIP.y + 210} fill={C.text2} fontFamily={SANS} fontSize={32} textAnchor="middle">
            too faint to see on its own
          </text>
        </g>

        {/* the schedule */}
        <g opacity={ticksA}>
          {d.transits.map((tt, i) => {
            const x = d.stripX(tt);
            const f = (x - STRIP.x0) / (STRIP.x1 - STRIP.x0);
            const on = seg(t, T.repeat + 0.6 + f, T.repeat + 0.8 + f);
            return <line key={i} x1={x} x2={x} y1={STRIP.y - 70} y2={STRIP.y - 46} stroke={C.gold} strokeWidth={3} opacity={on} />;
          })}
        </g>
        <g opacity={hopsA}>
          {d.transits.slice(1).map((tt, i) => {
            const t0 = d.transits[i];
            // no hop across the years between TESS's visits
            if (tt - t0 > 1.5 * d.b.P) return null;
            const x0 = d.stripX(t0);
            const x1 = d.stripX(tt);
            const f = (x0 - STRIP.x0) / (STRIP.x1 - STRIP.x0);
            const u = outCubic(seg(t, T.regular + 0.1 + 1.6 * f, T.regular + 0.45 + 1.6 * f));
            if (u <= 0) return null;
            const xm = lerp(x0, x1, u);
            const y = STRIP.y - 76;
            // a hop, drawn as far as it has got
            const pts: string[] = [];
            for (let k = 0; k <= 12; k++) {
              const x = lerp(x0, xm, k / 12);
              const v = (x - x0) / (x1 - x0);
              pts.push(`${x.toFixed(1)},${(y - 120 * v * (1 - v)).toFixed(1)}`);
            }
            return <polyline key={i} points={pts.join(' ')} fill="none" stroke={C.gold} strokeWidth={2} strokeOpacity={0.8} />;
          })}
        </g>
        <g opacity={joinsA} fontFamily={SANS}>
          {joins.map((j, i) => (
            <g key={i}>
              <line x1={j.x} x2={j.x} y1={STRIP.y - 112} y2={STRIP.y + 70} stroke={C.text2} strokeOpacity={0.6} strokeWidth={1.6} strokeDasharray="4 5" />
              <text x={j.x} y={STRIP.y + 104} fill={C.text2} fontSize={28} textAnchor="middle">{j.years} years later</text>
            </g>
          ))}
        </g>
        <g opacity={schedLab} fontFamily={SANS}>
          <text x={960} y={250} fill={C.gold} fontSize={40} fontWeight={600} textAnchor="middle" opacity={1 - unknown}>
            a planet crosses every 3.18 days
          </text>
          <text x={960} y={250} fill={C.gold} fontSize={40} fontWeight={600} textAnchor="middle" opacity={unknown}>
            a planet crosses every <tspan fontFamily={MONO}>?</tspan> days
          </text>
          <text x={960} y={300} fill={C.text2} fontSize={30} textAnchor="middle">gold: the moments it crosses</text>
        </g>
        {/* the guesses: cut lines a guessed period apart */}
        <g opacity={cutsA}>
          {cuts.map((x, i) => (
            <line key={i} x1={x} x2={x} y1={STRIP.y - 110} y2={STRIP.y + 110} stroke={C.text} strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="5 5" />
          ))}
        </g>

        {/* the stack */}
        <g opacity={guessLab * (1 - seg(t, T.rightOne - 0.1, T.rightOne + 0.3))} fontFamily={SANS}>
          <text x={960} y={guessY} fill={C.text} fontSize={40} textAnchor="middle">
            guess: every <tspan fontFamily={MONO}>{P.toFixed(2)}</tspan> days
          </text>
        </g>
        <g opacity={rightLab} fontFamily={SANS}>
          <text x={960} y={128} fill={C.gold} fontSize={40} fontWeight={600} textAnchor="middle">
            the right guess, 3.18 days: the dips line up
          </text>
        </g>
        <g opacity={avgLab} fontFamily={SANS}>
          <text x={STACK.x0} y={AVG.y + 90} fill={C.text2} fontSize={30}>average of all the pieces</text>
          <text x={(STACK.x0 + STACK.x1) / 2 + 40} y={AVG.y + 90} fill={C.gold} fontSize={32} opacity={lock}>
            ↑ the dip stands out from the noise
          </text>
        </g>
      </svg>
      <canvas ref={ref} style={{position: 'absolute', inset: 0, width: W, height: H}} />
    </div>
  );
};

export const methodVisible = (t: number) => t > T.weTook - 0.3 && t < T.turnedUp + 0.3;
