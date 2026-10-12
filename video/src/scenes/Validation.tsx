import React from 'react';
import {LC} from '../lib/data';
import {MapView, skyToScreen} from '../lib/proj';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {ease, inOutCubic, lerp, outBack, outCubic, rng, seg, vis} from '../lib/time';

// How do we know the filter works? (1) It finds known planets blind: TOI-700 b and c, L 98-59 b, c and d,
// and both of Rabtsevich's signals, each shown as its folded transit from our own search. (2) Flipped
// light curves: L 98-59's dips become bumps; in a flipped light curve any dip found is a false alarm (TIC
// 37904598's, from the inverted-light-curve test). (3) The measured false-alarm rates; the weakest signals,
// about half false alarms, are left out of the candidates.

const POS: Record<string, [number, number]> = {
  'TOI-700': [164.437, -86.9607],
  'L 98-59': [203.3189, -76.8138],
  'TIC 4206066': [79.9495, -24.4484],
};
// TOI-700 has four known planets, of which our search found b and c; L 98-59's three transiting planets
// are b, c and d. Rabtsevich's two signals are unconfirmed candidates, so they come last, on "without
// being told where they are", labelled as his and in a different colour from the known planets.
const CARDS: {star: string; title: string; found: string; color: string; x: number; order: number}[] = [
  {star: 'TIC 4206066', title: 'Rabtsevich’s star', found: 'his 2 unconfirmed signals ✓', color: '#FFE6B0', x: 400, order: 2},
  {star: 'TOI-700', title: 'TOI-700', found: 'planets b and c found ✓', color: C.gold, x: 960, order: 0},
  {star: 'L 98-59', title: 'L 98-59', found: 'planets b, c and d found ✓', color: C.gold, x: 1520, order: 1},
];

const Fold: React.FC<{x: number; y: number; w: number; h: number; xs: number[]; ys: number[]; depth: number; u: number; color?: string}> = ({
  x, y, w, h, xs, ys, depth, u, color = C.cyan,
}) => {
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const lo = -depth * 1.35;
  const hi = depth * 0.45;
  const n = Math.max(2, Math.floor(xs.length * u));
  const pts = xs
    .slice(0, n)
    .map((xx, i) => (Number.isFinite(ys[i]) ? `${(x + ((xx - x0) / (x1 - x0)) * w).toFixed(1)},${(y + ((hi - ys[i]) / (hi - lo)) * h).toFixed(1)}` : ''))
    .filter(Boolean);
  return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" />;
};

export const Known: React.FC<{t: number; lc: LC; view: MapView}> = ({t, lc, view}) => {
  const a = vis(t, T.howKnow + 0.2, T.howOften - 0.1, 0.5, 0.4);
  const v = view;
  // the cards sit left to right in the order their stars sit on the map, so the leader lines never
  // cross, and appear in narration order, at equal intervals: the two known systems first, Rabtsevich's
  // star last
  const cards = CARDS.map((card) => {
    const c = lc.controls.find((q) => q.star === card.star)!;
    const cx = card.x;
    const [mx, my] = skyToScreen(v, ...POS[c.star]);
    const mark = outBack(seg(t, T.howKnow + 0.5 + card.order * 0.25, T.howKnow + 1.0 + card.order * 0.25));
    const d0 = T.findsKnown + card.order * 0.8;
    const u = outCubic(seg(t, d0, d0 + 0.6));
    const cw = 500;
    const ch = 236;
    const sw = (cw - 44 - (c.signals.length - 1) * 18) / c.signals.length;
    return (
      <g key={c.star}>
        <g opacity={Math.min(1, mark)}>
          <circle cx={mx} cy={my} r={(16 + 3 * Math.sin(t * 4 + card.order)) * mark} fill="none" stroke={C.text} strokeWidth={2.4} />
          <circle cx={mx} cy={my} r={4.5} fill={C.text} />
        </g>
        <g opacity={u}>
          <line x1={cx} y1={70 + ch} x2={mx} y2={my - 18} stroke={C.text} strokeOpacity={0.55} strokeWidth={1.8} />
          <g transform={`translate(${cx - cw / 2} ${70 + (1 - u) * 20})`}>
            <rect width={cw} height={ch} rx={12} fill="rgba(6,10,20,0.88)" stroke={C.grid} />
            <text x={22} y={46} fill={C.text} fontFamily={SANS} fontSize={36} fontWeight={600}>{card.title}</text>
            <text x={22} y={84} fill={card.color} fontFamily={SANS} fontSize={31}>{card.found}</text>
            {c.signals.map((s, k) => {
              const sx = 22 + k * (sw + 18);
              const uu = seg(t, d0 + 0.3 + k * 0.15, d0 + 1.1 + k * 0.15);
              return (
                <g key={k}>
                  <Fold x={sx} y={100} w={sw} h={86} xs={s.x_h} ys={s.ppm} depth={s.depth_ppm} u={uu} />
                  <text x={sx + sw / 2} y={220} fill={C.text2} fontFamily={MONO} fontSize={24} textAnchor="middle" opacity={uu}>
                    {s.P < 10 ? s.P.toFixed(2) : s.P.toFixed(1)} d
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </g>
    );
  });
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: a}}>
      {cards}
    </svg>
  );
};

export const knownVisible = (t: number) => t > T.howKnow && t < T.howOften + 0.3;

// ---- the flip and the false alarms ----
//   "But how often does noise fool it?"                                  L 98-59's light curve: planets and noise
//   "To measure that, we need data with the same noise, but no planets."  what the test needs, above the curve
//   "So we took 400,000 stars and flipped their data upside down."       the curve turns over
//   "That turns a planet's dip into a bump, which the search ignores."   its planets' dips are now bumps
//   "But noise wiggles both ways, so it still makes fake dips."          noise's dips light up (coral)
//   "Anything the search finds there is a false alarm."                  a real one: TIC 37904598, flipped
//   "Counting them tells us how many of our candidates are likely        the measured rates, by strength
//    false alarms, too."
//   "Weak dips were about half false alarms, so we left them out."       the weak row struck out

const PANEL = {x0: 260, x1: 1660, y: 470, k: 0.085};
// the 382 weakest dips that passed every check, one square each; 50 of them (chosen at random here) are the
// ones the filter keeps
const WAFFLE = {x0: 1100, y0: 330, cols: 23, rows: 17, cell: 21, pitch: 26};
const WAFFLE_KEEP: boolean[] = (() => {
  const r = rng(51);
  const keep = new Array(382).fill(false);
  let n = 0;
  while (n < 50) {
    const i = Math.floor(r() * 382);
    if (!keep[i]) {
      keep[i] = true;
      n++;
    }
  }
  return keep;
})();
const rgbMix = (a: number[], b: number[], u: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',')})`;

export const Flip: React.FC<{t: number; lc: LC}> = ({t, lc}) => {
  const a = vis(t, T.howOften + 0.05, T.result + 0.3, 0.45, 0.5);
  const l = lc.l9859;
  const inv = lc.inverted;
  const flip = ease(t, T.flipped - 0.1, T.flipped + 1.1, inOutCubic);
  const draw = ease(t, T.howOften, T.howOften + 1.4, (u) => u);
  // the chart replaces everything before it, for good: earlier layers never come back as it fades
  const chartIn = outCubic(seg(t, T.counting - 0.3, T.counting + 0.2));
  const chartA = chartIn * (1 - seg(t, T.trainFilter - 0.4, T.trainFilter + 0.1));
  // the false-alarm filter, trained on the fake dips, then run on the weakest dips
  const filterA = seg(t, T.trainFilter - 0.1, T.trainFilter + 0.4);
  const boxA = outCubic(seg(t, T.trainFilter + 0.8, T.trainFilter + 1.3));
  const waffleA = outCubic(seg(t, T.weakest - 0.1, T.weakest + 0.5));
  const scan = seg(t, T.fifty - 0.2, T.fifty + 1.0);
  const keptLab = outCubic(seg(t, T.fifty + 0.9, T.fifty + 1.4));
  const transits: number[] = [];
  for (const p of l.planets) {
    for (let k = Math.ceil((l.t[0] - p.t0) / p.P); p.t0 + k * p.P < l.t[l.t.length - 1]; k++) transits.push(p.t0 + k * p.P);
  }
  const inTransit = (tt: number) => transits.some((q) => Math.abs(tt - q) < 0.03);
  const xOfL = (tt: number) => PANEL.x0 + ((tt - l.t[0]) / (l.t[l.t.length - 1] - l.t[0])) * (PANEL.x1 - PANEL.x0);
  // turning over: heights scale by cos(180 deg x flip), so the dips flatten and come out as bumps
  const turn = Math.cos(Math.PI * flip);
  const yOfL = (f: number) => PANEL.y - Math.max(-2600, Math.min(2600, f)) * PANEL.k * turn;
  // the noise's own dips once flipped: readings that were well above average before (2.2 sigma)
  const sigma = Math.sqrt(l.f.reduce((s, v, i) => s + (inTransit(l.t[i]) ? 0 : v * v), 0) / l.f.length);
  const nL = Math.floor(l.t.length * draw);
  let line = '';
  const dips: React.ReactNode[] = [];
  const fakes: React.ReactNode[] = [];
  const fakeOn = seg(t, T.noiseBoth + 0.3, T.noiseBoth + 1.0) * (1 - chartIn);
  for (let i = 0; i < nL; i++) {
    const gapL = i > 0 && l.t[i] - l.t[i - 1] > 0.1;
    line += `${i && !gapL ? 'L' : 'M'}${xOfL(l.t[i]).toFixed(1)},${yOfL(l.f[i]).toFixed(1)} `;
    if (inTransit(l.t[i])) dips.push(<circle key={i} cx={xOfL(l.t[i])} cy={yOfL(l.f[i])} r={5} fill={C.gold} />);
    else if (l.f[i] > 2.2 * sigma && fakeOn > 0) {
      fakes.push(<circle key={`f${i}`} cx={xOfL(l.t[i])} cy={yOfL(l.f[i])} r={6} fill={C.coral} opacity={fakeOn} />);
    }
  }
  const labIn = outCubic(seg(t, T.howOften + 0.8, T.howOften + 1.3)) * (1 - chartIn);
  const needLab = seg(t, T.toMeasure + 0.2, T.toMeasure + 0.7) * (1 - seg(flip, 0.1, 0.35));
  const bumpLab = seg(t, T.turnsBump - 0.1, T.turnsBump + 0.4);
  const ignoreLab = seg(t, T.ignores - 0.1, T.ignores + 0.4);
  const fakeLab = seg(t, T.fakeDips - 0.1, T.fakeDips + 0.4);
  const cardA = outCubic(seg(t, T.falseAlarm - 0.1, T.falseAlarm + 0.5)) * (1 - chartIn);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: a}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <g opacity={1 - chartIn}>
          <text x={PANEL.x0} y={150} fill={C.text2} fontFamily={MONO} fontSize={26} letterSpacing={1}>
            L 98-59 · THREE TRANSITING PLANETS · TESS SECTOR 2
          </text>
          <text x={PANEL.x1} y={150} fill={C.cyan} fontFamily={MONO} fontSize={30} textAnchor="end" opacity={outCubic(seg(t, T.ranIt + 0.6, T.ranIt + 1.2))}>
            798,769 stars flipped
          </text>
        </g>
        {/* the flip itself: the curve turns over about its own axis, drawn in SVG coordinates (no CSS transform) */}
        <g opacity={1 - chartIn}>
          <line x1={PANEL.x0} x2={PANEL.x1} y1={PANEL.y} y2={PANEL.y} stroke={C.grid} />
          <path d={line} fill="none" stroke={C.cyan} strokeWidth={1.6} strokeLinejoin="round" opacity={0.85} />
          <g opacity={outCubic(seg(t, T.howOften + 0.8, T.howOften + 1.3))}>{dips}</g>
          {fakes}
        </g>
        {/* labels: fixed places, crossfading */}
        <g opacity={labIn} fontFamily={SANS}>
          <text x={PANEL.x0} y={PANEL.y + 260} fill={C.gold} fontSize={36} opacity={1 - seg(flip, 0.15, 0.4)}>
            gold: dips from its three planets
          </text>
          <text x={PANEL.x0} y={PANEL.y + 306} fill={C.cyan} fontSize={32} opacity={1 - seg(flip, 0.15, 0.4)}>
            everything else: noise
          </text>
          <text x={PANEL.x0} y={PANEL.y - 236} fill={C.text} fontSize={38} fontWeight={600} opacity={needLab}>
            needed: the same noise, but no planets
          </text>
          <text x={PANEL.x0} y={PANEL.y - 236} fill={C.gold} fontSize={38} fontWeight={600} opacity={seg(flip, 0.6, 0.85) * bumpLab}>
            flipped, the planets’ dips are bumps
          </text>
          <text x={PANEL.x0} y={PANEL.y - 192} fill={C.text2} fontSize={32} opacity={ignoreLab}>
            the search only looks for dips, so it skips them
          </text>
          <text x={PANEL.x0} y={PANEL.y + 260} fill={C.coral} fontSize={38} fontWeight={600} opacity={fakeLab}>
            but noise still dips: fake dips
          </text>
        </g>
        {/* a real false alarm: what the search found in one flipped star */}
        <g opacity={cardA} transform="translate(1110 620)">
          <rect x={0} y={0} width={560} height={260} rx={12} fill="rgba(6,10,20,0.92)" stroke={C.coral} strokeOpacity={0.6} />
          <text x={24} y={50} fill={C.coral} fontFamily={SANS} fontSize={40} fontWeight={600}>false alarm</text>
          <Fold x={24} y={70} w={512} h={120} xs={inv.fold_x_h} ys={inv.fold_ppm} depth={inv.depth_ppm * 2.2} u={1} color={C.coral} />
          <text x={24} y={236} fill={C.text2} fontFamily={SANS} fontSize={26}>a “dip” found in a flipped star</text>
        </g>
        {/* the measured rates */}
        <g opacity={chartA}>
          <text x={420} y={250} fill={C.text2} fontFamily={MONO} fontSize={34} letterSpacing={1}>
            SHARE OF OUR CANDIDATES LIKELY TO BE FALSE ALARMS
          </text>
          <text x={420} y={300} fill={C.text2} fontFamily={SANS} fontSize={30}>
            measured with 798,769 flipped stars, by how strong the dip is
          </text>
          {[
            {lab: "weak dips", pct: 46, txt: "almost half", out: true},
            {lab: 'medium', pct: 16, txt: '16%', out: false},
            {lab: "strong", pct: 2, txt: "2%", out: false},
          ].map((b, i) => {
            const y = 370 + i * 130;
            const u = outCubic(seg(t, T.counting - 0.1 + i * 0.18, T.counting + 0.45 + i * 0.18));
            const cut = outCubic(seg(t, T.leftOut - 0.1, T.leftOut + 0.3));
            const bw = 760;
            const dim = b.out ? 1 - 0.55 * cut : 1;
            return (
              <g key={i}>
                <g opacity={dim}>
                  <text x={420} y={y + 40} fill={C.text} fontFamily={SANS} fontSize={38}>{b.lab}</text>
                  <rect x={760} y={y} width={bw} height={58} rx={6} fill="rgba(143,163,191,0.12)" />
                  <rect x={760} y={y} width={(bw * b.pct * u) / 100} height={58} rx={6} fill={C.coral} />
                  <text x={760 + (bw * b.pct * u) / 100 + 18} y={y + 42} fill={C.coral} fontFamily={MONO} fontSize={34} opacity={u}>{b.txt}</text>
                </g>
                {b.out && (
                  <g opacity={cut}>
                    <line x1={410} x2={1530} y1={y + 29} y2={y + 29} stroke={C.text} strokeWidth={3} />
                    <text x={1540} y={y + 42} fill={C.text} fontFamily={SANS} fontSize={40} fontWeight={600}>left out</text>
                  </g>
                )}
              </g>
            );
          })}
          <text x={960} y={820} fill={C.text} fontFamily={SANS} fontSize={42} fontWeight={500} textAnchor="middle"
            opacity={outCubic(seg(t, T.leftOut + 0.5, T.leftOut + 0.9))}>
            so all 438 candidates so far are medium or strong
          </text>
        </g>
        {/* the false-alarm filter: it learns from the fake dips what a false alarm looks like, then sorts the
            382 weakest dips (SNR 7.5-9) that passed every check; 50 are kept as probably real (tier L1) */}
        <g opacity={filterA}>
          <g transform="translate(150 330)">
            <rect x={0} y={0} width={520} height={250} rx={12} fill="rgba(6,10,20,0.92)" stroke={C.coral} strokeOpacity={0.6} />
            <text x={24} y={50} fill={C.coral} fontFamily={SANS} fontSize={40} fontWeight={600}>fake dips</text>
            <Fold x={24} y={70} w={472} h={110} xs={inv.fold_x_h} ys={inv.fold_ppm} depth={inv.depth_ppm * 2.2} u={1} color={C.coral} />
            <text x={24} y={226} fill={C.text2} fontFamily={SANS} fontSize={26}>from 798,769 flipped stars</text>
          </g>
          <g opacity={boxA}>
            <line x1={690} x2={772} y1={455} y2={455} stroke={C.text2} strokeWidth={2.4} />
            <path d="M 772 445 L 790 455 L 772 465 Z" fill={C.text2} />
            <rect x={800} y={395} width={210} height={120} rx={14} fill="rgba(6,10,20,0.92)" stroke={C.gold} strokeWidth={2.4} />
            <text x={905} y={468} fill={C.gold} fontFamily={SANS} fontSize={42} fontWeight={600} textAnchor="middle">filter</text>
            <text x={905} y={556} fill={C.text2} fontFamily={SANS} fontSize={26} textAnchor="middle">learns what a</text>
            <text x={905} y={588} fill={C.text2} fontFamily={SANS} fontSize={26} textAnchor="middle">false alarm looks like</text>
          </g>
          <g opacity={waffleA}>
            <text x={WAFFLE.x0} y={WAFFLE.y0 - 30} fill={C.text} fontFamily={SANS} fontSize={30}>
              the weakest dips that passed every check: 382
            </text>
            {WAFFLE_KEEP.map((keep, i) => {
              const cx = WAFFLE.x0 + (i % WAFFLE.cols) * WAFFLE.pitch;
              const cy = WAFFLE.y0 + Math.floor(i / WAFFLE.cols) * WAFFLE.pitch;
              // the filter's verdict reaches each square as the scan passes it
              const scanX = WAFFLE.x0 - 40 + scan * (WAFFLE.cols * WAFFLE.pitch + 80);
              const v = seg(scanX - cx, 0, 40);
              const fill = keep ? rgbMix([92, 225, 230], [255, 200, 87], v) : rgbMix([92, 225, 230], [255, 93, 115], v);
              const op = keep ? 0.6 + 0.4 * v : 0.6 - 0.42 * v;
              return <rect key={i} x={cx} y={cy} width={WAFFLE.cell} height={WAFFLE.cell} rx={3} fill={fill} opacity={op} />;
            })}
            <text x={WAFFLE.x0} y={WAFFLE.y0 + WAFFLE.rows * WAFFLE.pitch + 50} fill={C.gold} fontFamily={SANS} fontSize={44}
              fontWeight={600} opacity={keptLab}>50 probably real</text>
          </g>
        </g>
      </svg>
    </div>
  );
};

export const flipVisible = (t: number) => t > T.howOften - 0.3 && t < T.result + 0.9;
