import React from 'react';
import {C, H, MONO, SANS, W} from '../theme';
import {fmt, outCubic, seg, vis} from '../lib/time';
import {T} from './times';
import {DIVE, N_STARS, OPEN_VIEW, revealAt} from './skyDirector';
import {skyToScreen} from '../lib/proj';

/** Frame 0's title (the payoff, for the poster frame and the first moment of autoplay), then the star count
 * and the data credit over the opening sky. */
export const Opening: React.FC<{t: number}> = ({t}) => {
  const title = 1 - outCubic(seg(t, 0.85, 1.3));
  const a = vis(t, T.countStart - 0.2, DIVE.start + 0.3, 0.5, 0.4);
  const n = t >= T.countEnd ? N_STARS : Math.min(N_STARS, revealAt(t));
  const b = vis(t, T.nasa - 0.1, DIVE.start + 0.3, 0.6, 0.4);
  const lift = (1 - outCubic(seg(t, T.countStart - 0.2, T.countStart + 0.5))) * 16;
  // the map's empty patch is sky TESS had not observed through Sector 104; say so the first time it shows
  const [hx, hy] = skyToScreen(OPEN_VIEW(), 251.4, 23.4);
  const holeA = vis(t, T.unrollEnd + 0.05, DIVE.start + 0.15, 0.4, 0.3);
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: holeA}}>
        <line x1={hx - 30} y1={hy - 34} x2={hx - 80} y2={hy - 104} stroke={C.text2} strokeWidth={1.6} />
        <text x={hx - 86} y={hy - 112} textAnchor="end" fill={C.text} fontFamily={SANS} fontSize={38} stroke="rgba(6,10,20,0.85)" strokeWidth={7}
          paintOrder="stroke">sky not yet observed</text>
      </svg>
      {title > 0 && (
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: title,
          background: 'radial-gradient(ellipse 34% 30% at 50% 46%, rgba(5,8,15,0.82) 0%, rgba(5,8,15,0.55) 55%, rgba(5,8,15,0) 100%)'}}>
          <div style={{position: 'absolute', left: 0, width: W, top: 330, textAlign: 'center'}}>
            <div style={{fontFamily: MONO, fontSize: 150, fontWeight: 500, color: C.gold, lineHeight: 1}}>546</div>
            <div style={{fontFamily: SANS, fontSize: 56, fontWeight: 600, color: C.text, marginTop: 14}}>planet candidates</div>
            <div style={{fontFamily: SANS, fontSize: 32, color: C.text2, marginTop: 14}}>from 4 million stars in NASA’s public data</div>
          </div>
        </div>
      )}
      <div style={{position: 'absolute', left: 104, top: 70 + lift, opacity: a}}>
        <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 68, color: C.text, letterSpacing: -1, lineHeight: 1}}>
          {fmt(n)}
        </div>
        <div style={{fontFamily: SANS, fontSize: 32, color: C.text2, marginTop: 12, letterSpacing: 0.4}}>
          stars like the Sun or smaller
        </div>
        <div style={{fontFamily: SANS, fontSize: 26, color: C.cyan, marginTop: 22, letterSpacing: 2, textTransform: 'uppercase', opacity: b}}>
          NASA TESS · public data · 2018–2026
        </div>
      </div>
    </>
  );
};
