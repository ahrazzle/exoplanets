import {SkyState, defaultSky} from './SkyGL';
import {fullView, mixView, skyToScreen, viewHolding, viewOn} from '../lib/proj';
import {H, W} from '../theme';
import {FINAL_DOWNBEAT, LENGTH, SECTION, ease, inExpo, inOutCubic, inOutSine, lerp, outCubic, seg} from '../lib/time';
import {T} from './times';
import {fromChart, ignite, toChart} from './Result';

export const N_STARS = 4039203;
/** The dive from the map into one star, ending as the primer's star takes over. */
export const DIVE = {start: 5.95, end: 7.5};
/** The opening map: a little smaller and lower than the full view, so the count above it stays clear. */
export const OPEN_VIEW = () => ({...fullView(), zoom: fullView().zoom * 0.93, oy: fullView().oy + 24});
export const RABTSEVICH = {lon: 79.9495, lat: -24.4484};

/** Stars shown during the opening: the brightest first, filling in as the count runs up. */
export function revealAt(t: number) {
  const u = inOutSine(seg(t, T.countStart, T.countEnd));
  return 26000 * Math.pow(N_STARS / 26000, u);
}

/** The sky layer's state at time t (seconds). */
export function skyAt(t: number): SkyState {
  const full = fullView();
  const s = defaultSky(full);
  s.time = t;

  // Opening: a globe of the brightest stars fills in and unrolls into the all-sky map.
  if (t < DIVE.end + 0.1) {
    s.reveal = revealAt(t);
    const m = ease(t, T.unrollStart, T.unrollEnd, inOutCubic);
    s.globe = 1 - m;
    s.globeYaw = Math.min(0, (t - T.unrollStart) * 0.16);
    s.globePitch = lerp(0.38, 0, ease(t, 0, T.unrollEnd, inOutSine));
    s.globeRadius = 400 + 30 * seg(t, 0, T.unrollStart);
    s.globeCenter = [960, 500];
    s.exposure = 1.0;
    // the dive toward one star: an accelerating zoom (geometric in scale), the stars rushing outward
    const d = seg(t, DIVE.start, DIVE.end);
    s.view = mixView(OPEN_VIEW(), viewOn(RABTSEVICH.lon, RABTSEVICH.lat, 70), Math.pow(d, 2.2));
    s.opacity = 1 - seg(t, DIVE.end - 0.35, DIVE.end + 0.05);
    return s;
  }
  // The map returns for TESS's sweep, then zooms to Rabtsevich's star.
  if (t >= T.watchLot && t < T.weTook + 1.0) {
    s.reveal = N_STARS;
    s.opacity = seg(t, T.since - 0.9, T.since + 0.2);
    s.starGain = lerp(0.85, 1, seg(t, T.since, T.since + 2)) * (1 - 0.45 * seg(t, T.twoPossible - 0.3, T.twoPossible + 0.6));
    // The camera brings his star to the centre of the frame, then zooms in on it with the star held still,
    // so his star, drawn over the map from T.inspired + 1.2, stays on its point of the sky. After landing
    // the zoom keeps pushing in slowly.
    const pan = ease(t, T.inspired - 0.1, T.inspired + 1.1, inOutCubic);
    const zin = ease(t, T.inspired + 0.3, T.inspired + 2.6, inOutCubic);
    const factor = Math.pow(22, zin) * (1 + 0.1 * inOutSine(seg(t, T.inspired + 2.4, T.weTook + 0.6)));
    const [px, py] = skyToScreen(full, RABTSEVICH.lon, RABTSEVICH.lat);
    s.view = viewHolding(RABTSEVICH.lon, RABTSEVICH.lat, lerp(px, W / 2, pan), lerp(py, H / 2 + full.oy, pan),
      full.zoom * factor, full.oy);
    s.opacity *= 1 - seg(t, T.weTook - 0.2, T.weTook + 0.6);
    // the camera rises above his star's planets, in 3D, so the map, which cannot turn with it, gives way
    s.opacity *= 1 - seg(t, T.twoPossible - 0.3, T.twoPossible + 1.0);
    return s;
  }
  // Validation: the map behind the known planets found blind.
  if (t >= T.howKnow - 0.6 && t < T.howOften + 0.6) {
    s.reveal = N_STARS;
    s.opacity = seg(t, T.howKnow - 0.2, T.howKnow + 0.7) * (1 - seg(t, T.howOften - 0.3, T.howOften + 0.3));
    s.starGain = 0.75;
    // a slow push-in so the map never sits still
    s.view = {...full, oy: full.oy - 26, zoom: full.zoom * (1 + 0.035 * seg(t, T.howKnow - 0.6, T.howOften + 0.6))};
    return s;
  }
  // The result: candidates ignite on the bass re-entry, fly to the size axis and back; then the sky
  // becomes a dome over an observatory.
  if (t >= SECTION - 0.8) {
    s.reveal = N_STARS;
    s.opacity = seg(t, SECTION - 0.8, SECTION + 0.1);
    // a slightly smaller, lower map, so the count above it stays clear of the stars
    s.view = {...full, zoom: full.zoom * 0.86 * (1 + 0.05 * inOutSine(seg(t, T.moreThanHalf, T.nowUp))), oy: full.oy + 62};
    const chart = toChart(t) * (1 - fromChart(t));
    s.cand = 1;
    s.candIgnite = ignite(t);
    s.candChart = chart;
    s.candChartXY = chartXY;
    s.starGain = lerp(1, 0.55, seg(t, SECTION, SECTION + 1.5)) * (1 - 0.6 * chart);
    s.sat = lerp(1.9, 1.2, chart);
    s.candSize = lerp(1, 0.68, chart);
    s.starGain *= 1 - 0.8 * chart;       // dim the stars, not the layer, so the chart dots stay bright
    // the question marks: dim stars behind, smaller candidate dots so each reads as a question mark's dot
    const quest = seg(t, T.candidatesNot - 0.3, T.candidatesNot + 0.6) * (1 - seg(t, T.nowUp - 0.4, T.nowUp + 0.6));
    s.starGain *= 1 - 0.6 * quest;
    s.candSize *= 1 - 0.3 * quest;
    // into the dome: the map fades to dark, then the sky overhead fades up (no morph between the two)
    const domeOn = t >= T.nowUp + 0.05 ? 1 : 0;
    const dome = domeOn;
    s.opacity *= domeOn ? ease(t, T.nowUp + 0.05, T.nowUp + 1.0, outCubic) : 1 - ease(t, T.nowUp - 0.45, T.nowUp + 0.05, inOutCubic);
    s.dome = dome;
    // look toward ecliptic longitude 190, latitude -60 (TESS's southern continuous viewing zone), where
    // the most candidates lie: 148 of the 546 within 45 degrees
    s.domeYaw = -3.316 + (t - T.nowUp) * 0.018;
    s.domePitch = Math.PI / 3;
    s.twinkle = dome;
    s.domeFov = 112;
    s.domeCenter = [960, 470];
    s.starGain *= lerp(1, 0.7, dome);
    // the end card dims the sky
    s.opacity *= 1 - 0.65 * seg(t, FINAL_DOWNBEAT - 0.2, FINAL_DOWNBEAT + 0.8);
    s.opacity *= 1 - seg(t, LENGTH - 0.8, LENGTH);
    return s;
  }
  s.opacity = 0;
  return s;
}

let chartXY: Float32Array | null = null;
/** The candidates' positions on the size axis, set once the candidate list has loaded. */
export function setChartLayout(xy: Float32Array) {
  chartXY = xy;
}

export const outC = outCubic;
