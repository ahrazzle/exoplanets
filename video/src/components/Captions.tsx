import React from 'react';
import captions from '../data/captions.json';
import {C, SANS, W} from '../theme';
import {outCubic, seg} from '../lib/time';

type Cap = {text: string; s: number; e: number};
const CAPS = captions as Cap[];

/** Burned-in captions, one phrase at a time, bottom centre. */
export const Captions: React.FC<{t: number}> = ({t}) => {
  let k = -1;
  for (let i = 0; i < CAPS.length; i++) {
    const next = CAPS[i + 1];
    const end = Math.min(CAPS[i].e + 0.5, next ? next.s - 0.02 : Infinity);
    if (t >= CAPS[i].s - 0.05 && t < end) k = i;
  }
  if (k < 0) return null;
  const c = CAPS[k];
  const next = CAPS[k + 1];
  const end = Math.min(c.e + 0.5, next ? next.s - 0.02 : Infinity);
  const gapAfter = !next || next.s - c.e > 0.6;
  const a = Math.min(outCubic(seg(t, c.s - 0.05, c.s + 0.12)), gapAfter ? 1 - seg(t, end - 0.25, end) : 1);
  const y = (1 - outCubic(seg(t, c.s - 0.05, c.s + 0.2))) * 10;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width: W,
        bottom: 46 - y,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 52,
          letterSpacing: -0.2,
          color: C.text,
          opacity: a,
          textShadow: '0 2px 14px rgba(4,7,14,0.95), 0 0 3px rgba(4,7,14,0.9)',
          textAlign: 'center',
          maxWidth: 1640,
          lineHeight: 1.2,
        }}
      >
        {c.text}
      </div>
    </div>
  );
};
