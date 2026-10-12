import React from 'react';
import {Candidate} from '../lib/data';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {SECTION, ease, fmt, inOutCubic, outBack, outCubic, seg, vis} from '../lib/time';

// The result: the 438 full-sky candidates that passed every test light up on the sky (on the music's bass
// re-entry), then the 50 the false-alarm filter picked out of the weakest dips, then the 58 from our earlier
// searches; they fly to a size axis where they pile up between Earth and Neptune, a size our solar system
// has no planet of.

export const AX = {x0: 190, x1: 1730, y: 760, rmin: 0.3, rmax: 30};
export const xR = (r: number) => AX.x0 + (Math.log(r / AX.rmin) / Math.log(AX.rmax / AX.rmin)) * (AX.x1 - AX.x0);

const FIRST_WAVE = 0.68;   // the full-sky candidates ignite west to east over this part of the ignition
const SECOND_WAVE = [0.72, 0.83];
const THIRD_WAVE = [0.87, 0.97];

/** When (0..1 of the ignition) a candidate lights up. */
export function candDelay(c: Candidate): number {
  const jitter = (c.tic % 9973) / 9973;
  if (c.src === 'filter') return SECOND_WAVE[0] + jitter * (SECOND_WAVE[1] - SECOND_WAVE[0]);
  if (c.src === 'earlier') return THIRD_WAVE[0] + jitter * (THIRD_WAVE[1] - THIRD_WAVE[0]);
  const lam = ((((c.lon + 180) % 360) + 360) % 360) - 180;
  return Math.min(FIRST_WAVE, ((lam + 180) / 360) * (FIRST_WAVE - 0.05) + jitter * 0.05);
}

/** Stacked positions (CSS px) of each candidate on the size axis, in the candidates' order. */
export function chartLayout(cands: Candidate[]): Float32Array {
  const out = new Float32Array(2 * cands.length);
  const nb = 64;
  const heights = new Array(nb).fill(0);
  const order = cands.map((c, i) => i).sort((a, b) => cands[a].r - cands[b].r);
  for (const i of order) {
    const r = Math.min(AX.rmax * 0.99, Math.max(AX.rmin, cands[i].r));
    const b = Math.min(nb - 1, Math.floor(((xR(r) - AX.x0) / (AX.x1 - AX.x0)) * nb));
    const x = AX.x0 + ((b + 0.5) / nb) * (AX.x1 - AX.x0);
    out[2 * i] = x;
    out[2 * i + 1] = AX.y - 12 - heights[b] * 9.5;
    heights[b]++;
  }
  return out;
}

const PLANETS = [{n: 'Mercury', r: 0.383}, {n: 'Earth', r: 1.0}, {n: 'Neptune', r: 3.88}, {n: 'Jupiter', r: 11.21}];

export const ignite = (t: number) => ease(t, SECTION - 0.05, SECTION + 2.6, (u) => u);
export const toChart = (t: number) => ease(t, T.moreThanHalf - 0.3, T.moreThanHalf + 1.9, (u) => u);
export const fromChart = (t: number) => ease(t, T.candidatesNot - 0.3, T.candidatesNot + 0.9, inOutCubic);

export const Result: React.FC<{t: number; cands: Candidate[]}> = ({t, cands}) => {
  const n = cands.length;
  const between = cands.filter((c) => c.r >= 1 && c.r <= 3.88).length;
  const prog = ignite(t);
  const count = cands.filter((c) => candDelay(c) + 0.02 <= prog).length;
  const headA = vis(t, SECTION - 0.1, T.moreThanHalf + 0.6, 0.3, 0.5);
  const sub1 = outCubic(seg(prog, FIRST_WAVE - 0.05, FIRST_WAVE + 0.05));
  const sub2 = outCubic(seg(prog, SECOND_WAVE[1] - 0.04, SECOND_WAVE[1] + 0.03));
  const sub3 = outCubic(seg(prog, THIRD_WAVE[1] - 0.04, THIRD_WAVE[1] + 0.03));
  const chartA = vis(t, T.moreThanHalf + 0.3, T.candidatesNot + 0.2, 0.6, 0.6);
  const band = ease(t, T.sizeOf + 0.3, T.sizeOf + 1.1, inOutCubic);
  const bandLab = vis(t, T.sizeOf + 0.6, T.candidatesNot + 0.2, 0.5, 0.5);
  const gapA = vis(t, T.oneOur, T.candidatesNot + 0.2, 0.5, 0.5);
  const xE = xR(1);
  const xN = xR(3.88);
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <div style={{position: 'absolute', left: 0, width: W, top: 40, textAlign: 'center', opacity: headA}}>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 22}}>
          <span style={{fontFamily: MONO, fontSize: 92, fontWeight: 500, color: C.gold, lineHeight: 1, minWidth: 176, textAlign: 'right'}}>
            {fmt(count)}
          </span>
          <span style={{fontFamily: SANS, fontSize: 44, color: C.text}}>planet candidates</span>
        </div>
        <div style={{fontFamily: SANS, fontSize: 28, color: C.text2, marginTop: 12}}>
          <span style={{opacity: sub1}}>438 from the full-sky search</span>
          <span style={{opacity: sub2, color: C.gold}}> + 50 from the weakest dips</span>
          <span style={{opacity: sub3, color: C.gold}}> + 58 from our earlier searches</span>
        </div>
      </div>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: chartA}}>
        <rect x={xE} y={AX.y - 520} width={(xN - xE) * band} height={520} fill={C.gold} opacity={0.1} style={{mixBlendMode: 'screen'}} />
        <line x1={xE} x2={xE} y1={AX.y - 520} y2={AX.y + 70} stroke={C.gold} strokeOpacity={0.5 * band} strokeDasharray="4 6" />
        <line x1={xN} x2={xN} y1={AX.y - 520} y2={AX.y + 70} stroke={C.gold} strokeOpacity={0.5 * band} strokeDasharray="4 6" />
        <g opacity={bandLab}>
          <text x={(xE + xN) / 2} y={AX.y - 548} fill={C.gold} fontFamily={SANS} fontSize={38} fontWeight={600} textAnchor="middle">
            {between} of {n} between Earth and Neptune
          </text>
        </g>
        <line x1={AX.x0} x2={AX.x1} y1={AX.y} y2={AX.y} stroke={C.text2} strokeOpacity={0.5} />
        <text x={AX.x1} y={AX.y + 158} fill={C.text2} fontFamily={SANS} fontSize={24} textAnchor="end" letterSpacing={1.5}>
          PLANET SIZE →
        </text>
        {PLANETS.map((p) => {
          const x = xR(p.r);
          const rr = 4 + 5.5 * Math.sqrt(p.r);
          return (
            <g key={p.n}>
              <circle cx={x} cy={AX.y + 38} r={rr} fill={p.n === 'Earth' ? C.earth : '#9FB4D0'} opacity={p.n === 'Earth' ? 1 : 0.8}
                stroke="#0A1322" strokeWidth={1.5} />
              <text x={x} y={AX.y + 100} fill={p.n === 'Earth' || p.n === 'Neptune' ? C.text : C.text2}
                fontFamily={SANS} fontSize={28} textAnchor="middle">{p.n}</text>
            </g>
          );
        })}
        <text x={AX.x0} y={AX.y + 158} fill={C.text2} fontFamily={SANS} fontSize={24} letterSpacing={1.5}>
          OUR SOLAR SYSTEM
        </text>
        <g opacity={gapA}>
          <rect x={xE + 24} y={AX.y + 12} width={xN - xE - 48} height={54} rx={27} fill="rgba(6,10,20,0.6)" stroke={C.gold} strokeWidth={2} strokeDasharray="6 6" />
          <text x={(xE + xN) / 2} y={AX.y + 48} fill={C.gold} fontFamily={SANS} fontSize={28} textAnchor="middle">none in our solar system</text>
        </g>
      </svg>
    </div>
  );
};

export const resultVisible = (t: number) => t > SECTION - 0.3 && t < T.candidatesNot + 0.4;
