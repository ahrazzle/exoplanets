import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {LC, Pixels} from '../lib/data';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {clamp, ease, fmt, inOutCubic, lerp, outBack, outCubic, rng, seg, vis} from '../lib/time';

// 7,459,491 signals; noise and eclipsing binaries among them; the pre-filters and 17 statistical tests
// (LEO-Vetter) as gates; the pixel check on TIC 127236638, whose dip comes from a star 94" away.

const N = 2600;
const GATE_X0 = 450;
const GATE_X1 = 1720;
const PRE_X = 320;
const LANE = {y0: 430, y1: 660};
// LEO-Vetter's 13 false-alarm and 4 false-positive tests, named for what each one throws out
const TESTS = [
  'signal too weak', 'too few transits', 'bad transit shape', 'not unique (folded)', 'not unique (local)',
  'depths disagree', 'one event dominates', 'bad model fit', 'sine-like wobble', 'impossible orbit',
  'lopsided dips', 'SNRs disagree', 'dips at data gaps',
  'odd–even differences', 'V-shaped dip', 'too big for a planet', 'secondary eclipse',
];
// the tests that look at the dip's shape, lit on "like a dip with the wrong shape"
const SHAPE_TESTS = ['bad transit shape', 'V-shaped dip'];
// C.text, C.text2 and C.gold as RGB, for mixing
const TEXT = [232, 238, 246];
const TEXT2 = [143, 163, 191];
const GOLD = [255, 200, 87];
const mixRGB = (a: number[], b: number[], u: number) => a.map((v, i) => lerp(v, b[i], u));
const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`;
// survival: pre-filters keep 609,021 of 7,459,491; the 17 tests keep 13,986 of those (about 80% per test)
const KEEP_PRE = 609021 / 7459491;
const KEEP_TEST = Math.pow(13986 / 609021, 1 / 17);

type Particle = {y: number; v: number; t0: number; fail: number; wob: number};

function particles(): Particle[] {
  const r = rng(11);
  const out: Particle[] = [];
  for (let i = 0; i < N; i++) {
    let fail = -1;
    if (r() > KEEP_PRE) fail = 0;
    else {
      for (let g = 1; g <= 17; g++) {
        if (r() > KEEP_TEST) {
          fail = g;
          break;
        }
      }
    }
    out.push({y: lerp(LANE.y0, LANE.y1, r()), v: 420 + 260 * r(), t0: r() * 7.0, fail, wob: r() * 6.28});
  }
  return out;
}

const gateX = (g: number) => (g === 0 ? PRE_X : GATE_X0 + ((g - 1) / 16) * (GATE_X1 - GATE_X0));

function counterAt(t: number) {
  // the count reaches 7.5 million as the narration says it
  const up = ease(t, T.turnedUp + 0.3, T.found + 2.2, outCubic);
  if (t < T.soEvery) return 7459491 * up;
  const a = seg(t, T.soEvery, T.seventeen + 0.6);
  const b = seg(t, T.seventeen + 0.6, T.pixel + 0.2);
  if (t < T.seventeen + 0.6) return Math.exp(lerp(Math.log(7459491), Math.log(609021), outCubic(a)));
  if (t < T.pixel + 0.2) return Math.exp(lerp(Math.log(609021), Math.log(13986), outCubic(b)));
  if (t < T.neighbour) return lerp(13986, 9962, outCubic(seg(t, T.pixel + 0.2, T.pixel + 1.2)));
  return Math.exp(lerp(Math.log(9962), Math.log(438), outCubic(seg(t, T.neighbour, T.neighbour + 0.8))));
}

const Mini: React.FC<{x: number; y: number; w: number; h: number; xs: number[]; ys: number[]; color: string; yr: [number, number]}> = ({
  x, y, w, h, xs, ys, color, yr,
}) => {
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const pts = xs
    .map((xx, i) => (Number.isFinite(ys[i]) ? `${(x + ((xx - x0) / (x1 - x0)) * w).toFixed(1)},${(y + ((yr[1] - ys[i]) / (yr[1] - yr[0])) * h).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');
  return <polyline points={pts} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" />;
};

export const Funnel: React.FC<{t: number; lc: LC; px: Pixels}> = ({t, lc, px}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const ps = useMemo(particles, []);
  const tStream = T.turnedUp - 0.2;
  const streamA = vis(t, T.turnedUp - 0.3, T.pixel + 0.8, 0.6, 0.55);
  const gatesOn = outCubic(seg(t, T.soEvery - 0.3, T.soEvery + 0.5));

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
    if (streamA <= 0) return;
    g.globalCompositeOperation = 'lighter';
    // until the gates appear, nothing is removed: the stream is all 7.5 million signals
    const tg = T.soEvery - 0.2;
    for (const p of ps) {
      // particles loop through the frame, entering at the left
      const period = (W + 200) / p.v;
      const age = ((t - tStream - p.t0) % period + period) % period;
      if (t - tStream - p.t0 < 0) continue;
      let x = -100 + age * p.v;
      const born = t - age;                       // when this lap entered the frame
      const filtered = born + (gateX(Math.max(p.fail, 0)) + 100) / p.v > tg;
      const y = p.y + Math.sin(p.wob + x * 0.01) * 6;
      let col = 'rgba(92,225,230,0.75)';
      let a = 1;
      if (p.fail >= 0 && filtered && gatesOn > 0) {
        const gx = gateX(p.fail);
        if (x > gx) {
          // rejected here: turn coral, fall away and fade
          const since = (x - gx) / p.v;
          x = gx + since * 60;
          const fy = y + since * since * 400;
          a = Math.max(0, 1 - since * 1.4);
          if (a <= 0) continue;
          g.fillStyle = `rgba(255,93,115,${0.8 * a * streamA})`;
          g.fillRect(x - 1.5, fy - 1.5, 3, 3);
          continue;
        }
      }
      // particles already past the point where they would fail when the gates appear fade out with them
      if (p.fail >= 0 && !filtered && x > gateX(p.fail)) a *= 1 - gatesOn;
      if (a <= 0.01) continue;
      if (p.fail < 0 && filtered && gatesOn > 0 && x > GATE_X1) col = 'rgba(255,200,87,0.95)';
      // a short streak along the direction of travel, brightest at the head
      const alpha = parseFloat(col.match(/[\d.]+\)$/)![0]) * a * streamA;
      const len = p.v * 0.03;
      const grad = g.createLinearGradient(x - len, y, x, y);
      grad.addColorStop(0, col.replace(/[\d.]+\)$/, '0)'));
      grad.addColorStop(1, col.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`));
      g.strokeStyle = grad;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x - len, y);
      g.lineTo(x, y);
      g.stroke();
    }
    // gates
    if (gatesOn > 0) {
      g.globalCompositeOperation = 'source-over';
      for (let k = 0; k <= 17; k++) {
        const x = gateX(k);
        const appear = clamp(gatesOn * 1.2 - k * 0.03);
        g.strokeStyle = k === 0 ? `rgba(232,238,246,${0.5 * appear * streamA})` : `rgba(232,238,246,${0.35 * appear * streamA})`;
        g.lineWidth = k === 0 ? 2 : 1.5;
        g.beginPath();
        g.moveTo(x, LANE.y0 - 30);
        g.lineTo(x, LANE.y1 + 30);
        g.stroke();
      }
    }
  });

  const count = counterAt(t);
  const counterA = vis(t, T.turnedUp, T.howKnow + 0.6, 0.4, 0.4);
  const survive = seg(t, T.neighbour + 0.1, T.neighbour + 0.6);
  const noiseA = vis(t, T.noise - 0.1, T.soEvery + 0.1, 0.4, 0.4);
  const ebA = vis(t, T.pairs - 0.1, T.soEvery + 0.1, 0.4, 0.4);
  const pop = (a: number, t0: number) => `scale(${0.85 + 0.15 * outBack(seg(t, t0, t0 + 0.5))})`;
  const fa = lc.inverted;
  const eb = lc.eb.find((e) => e.tic === 348773952)!;
  const gateLab = vis(t, T.seventeen - 0.2, T.pixel + 0.8, 0.4, 0.55);
  const preLab = vis(t, T.soEvery + 0.1, T.pixel + 0.8, 0.4, 0.55);

  // pixel check
  const pixA = vis(t, T.pixel + 0.8, T.howKnow - 0.1, 0.5, 0.45);
  const diffU = ease(t, T.isTheDip + 0.3, T.isTheDip + 1.1, inOutCubic);
  const arrowU = ease(t, T.neighbour - 0.1, T.neighbour + 0.6, inOutCubic);
  const rejA = outCubic(seg(t, T.neighbour + 0.7, T.neighbour + 1.1));
  const cell = 34;
  const n = px.n;
  const gx0 = 960 - (n * cell) / 2;
  const gy0 = 480 - (n * cell) / 2;
  const maxOut = Math.max(...px.meanOut.flat());
  const maxDiff = Math.max(...px.diff.flat());
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const vo = Math.sqrt(Math.max(px.meanOut[r][c], 0) / maxOut);
      const vd = Math.max(px.diff[r][c], 0) / maxDiff;
      // out of transit: blue-white; difference: the pixels that dimmed glow coral
      const ro = 40 + 190 * vo, go = 60 + 185 * vo, bo = 90 + 165 * vo;
      const rd = 18 + 237 * Math.sqrt(vd), gd = 22 + 71 * Math.sqrt(vd), bd = 40 + 75 * Math.sqrt(vd);
      const rr = lerp(ro, rd, diffU), gg = lerp(go, gd, diffU), bb = lerp(bo, bd, diffU);
      const delay = ((r + c) / (2 * n)) * 0.5;
      const on = outCubic(seg(t, T.pixel + 0.8 + delay, T.pixel + 1.3 + delay));
      cells.push(
        <rect key={`${r}-${c}`} x={gx0 + c * cell + 1} y={gy0 + (n - 1 - r) * cell + 1} width={cell - 2} height={cell - 2}
          fill={`rgb(${rr | 0},${gg | 0},${bb | 0})`} opacity={on} />,
      );
    }
  }
  const sx = (col: number) => gx0 + (col + 0.5) * cell;
  const sy = (row: number) => gy0 + (n - 1 - row + 0.5) * cell;
  const [tc, tr] = px.target;
  // the neighbour that produces the dip: the brightest TIC star near the difference-image peak
  let pk = [0, 0];
  let best = -1;
  px.snr.forEach((row, r) => row.forEach((v, c) => {
    if (v > best) {
      best = v;
      pk = [c, r];
    }
  }));
  const nb = px.stars
    .filter((s) => Math.hypot(s[0] - pk[0], s[1] - pk[1]) < 1.5)
    .sort((a, b) => a[2] - b[2])[0];

  return (
    <div style={{position: 'absolute', inset: 0}}>
      <canvas ref={ref} style={{position: 'absolute', inset: 0, width: W, height: H}} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <g opacity={preLab * streamA} fontFamily={SANS} fontSize={26} fill={C.text2}>
          <text x={PRE_X} y={LANE.y1 + 74} textAnchor="middle">pre-filters</text>
        </g>
        <g opacity={gateLab * streamA} fontFamily={SANS}>
          <text x={(GATE_X0 + GATE_X1) / 2} y={118} textAnchor="middle" fill={C.text} fontSize={44} fontWeight={500}>
            17 statistical tests
          </text>
          {/* the two families of LEO-Vetter tests, bracketed */}
          {[{a: 1, b: 13, lab: 'false alarms: noise and glitches'}, {a: 14, b: 17, lab: 'false positives: other stars'}].map((g) => (
            <g key={g.lab}>
              <path d={`M ${gateX(g.a) - 8} 182 v -10 H ${gateX(g.b) + 8} v 10`} fill="none" stroke={C.text2} strokeWidth={1.6} />
              <text x={(gateX(g.a) + gateX(g.b)) / 2} y={162} textAnchor="middle" fill={C.text2} fontSize={24}>{g.lab}</text>
            </g>
          ))}
        </g>
        {/* each gate names what it throws out (LEO-Vetter's tests); on "each looking for a different warning
            sign" a highlight runs along them, and on "a dip with the wrong shape" the two shape tests stay lit */}
        <g fontFamily={SANS} fontSize={25}>
          {TESTS.map((name, i) => {
            const x = gateX(i + 1);
            const on = outCubic(seg(t, T.seventeen - 0.1 + i * 0.07, T.seventeen + 0.3 + i * 0.07));
            const sweep = Math.max(0, 1 - Math.abs(t - (T.warning + 0.2 + i * 0.1)) / 0.35);
            const shape = SHAPE_TESTS.includes(name) ? seg(t, T.wrongShape + 0.6, T.wrongShape + 1.0) : 0;
            const fill = rgb(mixRGB(mixRGB(TEXT2, TEXT, sweep), GOLD, shape));
            return (
              <text key={name} x={x + 4} y={LANE.y0 - 40} opacity={on * gateLab * streamA} fill={fill}
                transform={`rotate(-50 ${x + 4} ${LANE.y0 - 40})`}>
                {name}
              </text>
            );
          })}
        </g>
        {/* specimens */}
        <g opacity={noiseA * streamA} transform={`translate(620 790) ${pop(noiseA, T.noise - 0.1)}`}>
          <rect x={-170} y={-100} width={340} height={200} rx={12} fill="rgba(8,13,26,0.85)" stroke={C.grid} />
          <Mini x={-140} y={-35} w={280} h={110} xs={fa.fold_x_h} ys={fa.fold_ppm} color={C.cyan} yr={[-9000, 2500]} />
          <text x={-140} y={-55} fill={C.text} fontFamily={SANS} fontSize={32}>noise</text>
        </g>
        <g opacity={ebA * streamA} transform={`translate(1300 790) ${pop(ebA, T.pairs - 0.1)}`}>
          <rect x={-210} y={-100} width={420} height={200} rx={12} fill="rgba(8,13,26,0.85)" stroke={C.grid} />
          <Mini x={-180} y={-35} w={360} h={115} xs={eb.x_h} ys={eb.ppm} color={C.cyan} yr={[-110000, 8000]} />
          <text x={-180} y={-55} fill={C.text} fontFamily={SANS} fontSize={32}>two stars eclipsing</text>
        </g>
        {/* pixel check */}
        <g opacity={pixA}>
          <rect x={gx0 - 14} y={gy0 - 14} width={n * cell + 28} height={n * cell + 28} rx={10} fill="rgba(6,10,20,0.9)" />
          {cells}
          <g opacity={outCubic(seg(t, T.pixel + 1.5, T.pixel + 2.0))}>
            <circle cx={sx(tc)} cy={sy(tr)} r={30} fill="none" stroke={C.gold} strokeWidth={3} />
            <text x={sx(tc) - 44} y={sy(tr) + 6} fill={C.gold} fontFamily={SANS} fontSize={36} textAnchor="end" stroke="rgba(6,10,20,0.9)" strokeWidth={8} paintOrder="stroke">the star we expected</text>
          </g>
          {nb && (
            <g opacity={arrowU}>
              <line x1={sx(tc)} y1={sy(tr)} x2={lerp(sx(tc), sx(nb[0]), arrowU)} y2={lerp(sy(tr), sy(nb[1]), arrowU)} stroke={C.coral} strokeWidth={3} />
              <circle cx={sx(nb[0])} cy={sy(nb[1])} r={30} fill="none" stroke={C.coral} strokeWidth={3} />
              <text x={sx(nb[0]) + 44} y={sy(nb[1]) + 8} fill={C.coral} fontFamily={SANS} fontSize={38} fontWeight={600} stroke="rgba(6,10,20,0.9)" strokeWidth={8} paintOrder="stroke">
                the dip is here
              </text>
              <text x={sx(nb[0]) + 44} y={sy(nb[1]) + 48} fill={C.text2} fontFamily={SANS} fontSize={30} stroke="rgba(6,10,20,0.9)" strokeWidth={8} paintOrder="stroke">
                a neighbour {nb[4].toFixed(0)}″ away
              </text>
            </g>
          )}
          <text x={gx0} y={gy0 - 30} fill={C.text2} fontFamily={MONO} fontSize={22} letterSpacing={1}>
            TIC {px.tic} · TESS SECTOR {px.sector} · EACH SQUARE IS ONE PIXEL, 21″ ACROSS
          </text>
          <g opacity={diffU} fontFamily={SANS} fontSize={28}>
            <text x={gx0 + n * cell + 30} y={gy0 + 30} fill={C.coral}>■</text>
            <text x={gx0 + n * cell + 56} y={gy0 + 30} fill={C.text2}>pixels that dimmed</text>
            <text x={gx0 + n * cell + 56} y={gy0 + 64} fill={C.text2}>during the dips</text>
          </g>
          <g opacity={rejA} transform={`translate(${gx0 + n * cell + 40} ${gy0 + n * cell - 40}) rotate(-6)`}>
            <rect x={0} y={-46} width={250} height={64} rx={7} fill="none" stroke={C.coral} strokeWidth={3} />
            <text x={125} y={2} fill={C.coral} fontFamily={MONO} fontSize={40} fontWeight={700} textAnchor="middle">REJECTED</text>
          </g>
        </g>
      </svg>
      <div style={{position: 'absolute', left: 104, top: 74, opacity: counterA}}>
        {/* the count turns gold and its label changes by crossfading */}
        <div style={{position: 'relative', height: 60, fontFamily: MONO, fontSize: 60, lineHeight: 1}}>
          <div style={{position: 'absolute', left: 0, top: 0, color: C.text, opacity: 1 - survive}}>{fmt(count)}</div>
          <div style={{position: 'absolute', left: 0, top: 0, color: C.gold, opacity: survive}}>{fmt(count)}</div>
        </div>
        <div style={{position: 'relative', height: 40, fontFamily: SANS, fontSize: 30, color: C.text2, marginTop: 10}}>
          <div style={{position: 'absolute', left: 0, top: 0, opacity: 1 - survive, whiteSpace: 'nowrap'}}>repeating dips</div>
          <div style={{position: 'absolute', left: 0, top: 0, opacity: survive, whiteSpace: 'nowrap'}}>candidates survive</div>
        </div>
      </div>
    </div>
  );
};

export const funnelVisible = (t: number) => t > T.turnedUp - 0.4 && t < T.howKnow + 1.1;
