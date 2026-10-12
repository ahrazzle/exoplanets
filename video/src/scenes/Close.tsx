import React from 'react';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {FINAL_DOWNBEAT, LENGTH, ease, inOutCubic, outBack, outCubic, seg, vis} from '../lib/time';
import {Candidate} from '../lib/data';
import {MapView, skyToScreen} from '../lib/proj';

// Candidates, not confirmed planets: each candidate on the sky grows a question mark whose dot is the
// candidate itself. Then telescopes on the ground, and the end card, where the dip draws under the
// repository's address.

// A question mark's hook, drawn above its dot at (0, 0).
const HOOK = 'M -8 -27 C -8 -36.5 8 -36.5 8 -27 C 8 -20.5 0 -20 0 -13 L 0 -9.5';
// they go as the map fades into the sky over the observatory
export const QUESTION = () => ({start: T.candidatesNot + 0.55, end: T.nowUp + 0.05});

export const QuestionMarks: React.FC<{t: number; cands: Candidate[]; view: MapView}> = ({t, cands, view}) => {
  const q = QUESTION();
  const out = 1 - seg(t, q.end - 0.5, q.end);
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: out}}>
      {cands.map((c) => {
        const [x, y] = skyToScreen(view, c.lon, c.lat);
        // a wave from west to east across the map, with a little scatter
        const d = (x / W) * 0.8 + ((c.tic % 977) / 977) * 0.25;
        const k = outBack(seg(t, q.start + d, q.start + d + 0.35), 2.2);
        if (k <= 0) return null;
        return (
          <path key={c.tic + '-' + c.p} d={HOOK} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1.0 * k).toFixed(3)})`}
            fill="none" stroke={C.gold} strokeWidth={2.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" opacity={Math.min(1, k)} />
        );
      })}
    </svg>
  );
};

export const questionVisible = (t: number) => t > QUESTION().start && t < QUESTION().end;

export const Close: React.FC<{t: number}> = ({t}) => {
  const obs = vis(t, T.nowUp + 0.2, FINAL_DOWNBEAT + 0.6, 0.9, 0.8);
  const end = outCubic(seg(t, FINAL_DOWNBEAT - 0.2, FINAL_DOWNBEAT + 0.6));
  const dip = ease(t, FINAL_DOWNBEAT, FINAL_DOWNBEAT + 1.6, inOutCubic);
  const fadeOut = 1 - seg(t, LENGTH - 0.8, LENGTH);
  // the dip line under the address: flat, a rounded notch, flat
  const X0 = 400;
  const X1 = 1520;
  const yL = 618;
  const pts: string[] = [];
  const nPts = 160;
  for (let i = 0; i <= nPts * dip; i++) {
    const u = i / nPts;
    const x = X0 + u * (X1 - X0);
    const z = (u - 0.5) / 0.06;
    const depth = Math.abs(z) < 1.3 ? 26 * (1 - Math.pow(Math.min(1, Math.abs(z) / 1.3), 6)) : 0;
    pts.push(`${x.toFixed(1)},${(yL + depth).toFixed(1)}`);
  }
  return (
    <div style={{position: 'absolute', inset: 0, opacity: fadeOut}}>
      {/* an observatory on a hill, in silhouette, under the candidates */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: obs * (1 - end)}}>
        <path d="M0 1080 L0 930 C 300 905, 520 890, 760 880 C 980 872, 1200 880, 1420 900 C 1640 918, 1800 930, 1920 940 L1920 1080 Z" fill="#03060C" />
        <g transform="translate(1180 884)">
          <rect x={-58} y={-66} width={116} height={96} fill="#03060C" />
          <path d="M -70 -66 A 70 70 0 0 1 70 -66 Z" fill="#03060C" />
          <rect x={-11} y={-168} width={22} height={102} fill="#03060C" transform="rotate(32 0 -66)" />
          <path d="M -70 -66 A 70 70 0 0 1 70 -66" fill="none" stroke="rgba(143,163,191,0.35)" strokeWidth={1.5} />
        </g>
      </svg>
      <div style={{position: 'absolute', left: 0, width: W, top: 470, textAlign: 'center', opacity: end}}>
        <div style={{fontFamily: MONO, fontSize: 74, color: C.text}}>github.com/eumemic/exoplanets</div>
      </div>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: end}}>
        <polyline points={pts.join(' ')} fill="none" stroke={C.cyan} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <text x={960} y={736} fill={C.text2} fontFamily={SANS} fontSize={36} textAnchor="middle" letterSpacing={3}
          opacity={outCubic(seg(t, FINAL_DOWNBEAT + 1.0, FINAL_DOWNBEAT + 1.8))}>
          EUMEMIC
        </text>
      </svg>
    </div>
  );
};

export const closeVisible = (t: number) => t > T.candidatesNot - 0.3;
