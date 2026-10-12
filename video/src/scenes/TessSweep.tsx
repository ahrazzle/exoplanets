import React, {useMemo} from 'react';
import {Tess} from '../lib/data';
import {MapView, mollweide, toScreen} from '../lib/proj';
import {T} from './times';
import {C, MONO, SANS} from '../theme';
import {clamp, outCubic, seg, vis} from '../lib/time';

// TESS's real sector footprints (tess-point's pointing model, 16 CCDs per sector), swept across the map
// in order. Each sector flashes as it is observed and leaves a faint wash, so the sky fills in and the
// ecliptic poles, watched year after year, end up brightest.

export const SWEEP_START = () => T.since - 0.1;
export const SWEEP_END = () => T.doingEnd - 0.3;

type Poly = {pts: [number, number][]; seam: boolean};

export function sectorPolys(tess: Tess): Poly[][] {
  return tess.sectors.map((s) =>
    s.ccds.map((ccd) => {
      const pts = ccd.map(([lon, lat]) => mollweide(lon, lat));
      let seam = false;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > 2) seam = true;
      return {pts, seam};
    }),
  );
}

const path = (v: MapView, p: Poly, close: boolean) => {
  let d = '';
  let prev: [number, number] | null = null;
  for (const q of p.pts) {
    const [x, y] = toScreen(v, q[0], q[1]);
    const jump = prev && Math.abs(q[0] - prev[0]) > 2;
    d += `${d === '' || jump ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
    prev = q;
  }
  return close && !p.seam ? d + 'Z' : d;
};

/** Which sector is being observed at time t (fractional, 0 before Sector 1, 104 at the end). */
export const sweepAt = (t: number) => 104 * clamp((t - SWEEP_START()) / (SWEEP_END() - SWEEP_START()));

export const TessSweep: React.FC<{t: number; tess: Tess; view: MapView; fade: number; highlight98: number}> = ({
  t, tess, view, fade, highlight98,
}) => {
  const polys = useMemo(() => sectorPolys(tess), [tess]);
  const now = sweepAt(t);
  const shown = Math.min(polys.length, Math.ceil(now));
  const cur = Math.max(1, Math.min(104, Math.ceil(now)));
  const year = tess.sectors[cur - 1].start.slice(0, 4);
  const labels = vis(t, SWEEP_START() - 0.2, T.inspired + 0.3, 0.4, 0.5);
  const washes: React.ReactNode[] = [];
  const flashes: React.ReactNode[] = [];
  for (let k = 0; k < shown; k++) {
    const age = now - (k + 1);                 // sectors since this one was observed
    const fl = Math.exp(-Math.max(age, 0) / 1.6) * clamp(now - k);
    const d = polys[k].map((p) => path(view, p, true)).join(' ');
    washes.push(<path key={k} d={d} fill={C.cyan} fillOpacity={0.04} stroke="none" />);
    if (fl > 0.02)
      flashes.push(<path key={k} d={d} fill={C.cyan} fillOpacity={0.16 * fl} stroke={C.cyan} strokeOpacity={0.9 * fl} strokeWidth={1.4} />);
  }
  const s98 = polys[97].map((p) => path(view, p, true)).join(' ');
  // the empty patch on the map (sky no sector covered through Sector 104) is labelled in the opening only
  return (
    <>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: fade, mixBlendMode: 'screen'}}>
        <g>{washes}</g>
        <g>{flashes}</g>
      </svg>
      {highlight98 > 0 && (
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, mixBlendMode: 'screen'}}>
          <path d={s98} fill={C.cyan} fillOpacity={0.1 * highlight98} stroke={C.cyan} strokeWidth={2} strokeOpacity={highlight98} />
        </svg>
      )}
      <div style={{position: 'absolute', left: 104, top: 70, opacity: labels * fade}}>
        <div style={{fontFamily: SANS, fontSize: 24, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase'}}>
          NASA TESS
        </div>
        <div style={{fontFamily: MONO, fontSize: 56, color: C.text, marginTop: 6, lineHeight: 1}}>{year}</div>
        <div style={{fontFamily: MONO, fontSize: 26, color: C.text2, marginTop: 10}}>Sector {cur}</div>
      </div>
    </>
  );
};

export const sweepFlashOpacity = (t: number) => outCubic(seg(t, SWEEP_START() - 0.3, SWEEP_START() + 0.3));
