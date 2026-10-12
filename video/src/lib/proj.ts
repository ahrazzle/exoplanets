import {H, W} from '../theme';

// Sky coordinates are ecliptic longitude/latitude in degrees. The map is a Mollweide projection centred
// on longitude 0, east to the left as on the sky, in "map units": x in [-2√2, 2√2], y in [-√2, √2].
export const SQRT2 = Math.SQRT2;
const D2R = Math.PI / 180;

export function mollweide(lonDeg: number, latDeg: number): [number, number] {
  let lam = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  lam = -lam * D2R;
  const phi = latDeg * D2R;
  let th = phi;
  const target = Math.PI * Math.sin(phi);
  for (let i = 0; i < 12; i++) {
    const f = 2 * th + Math.sin(2 * th) - target;
    const d = 2 + 2 * Math.cos(2 * th);
    th -= f / Math.max(d, 1e-4);
    th = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th));
  }
  return [((2 * SQRT2) / Math.PI) * lam * Math.cos(th), SQRT2 * Math.sin(th)];
}

/** The 2D map view: which map point sits at the frame centre, and pixels per map unit. */
export type MapView = {cx: number; cy: number; zoom: number; oy: number};

/** Full-sky view: the ellipse spans `width` pixels, raised by `oy` pixels to leave room for captions. */
export const fullView = (width = 1720, oy = -36): MapView => ({cx: 0, cy: 0, zoom: width / (4 * SQRT2), oy});

export function toScreen(v: MapView, x: number, y: number): [number, number] {
  return [W / 2 + (x - v.cx) * v.zoom, H / 2 + v.oy - (y - v.cy) * v.zoom];
}

export const skyToScreen = (v: MapView, lon: number, lat: number) => {
  const [x, y] = mollweide(lon, lat);
  return toScreen(v, x, y);
};

/** A view centred on a sky position at a given zoom factor relative to the full view. */
export function viewOn(lon: number, lat: number, factor: number, oy = -36): MapView {
  const [x, y] = mollweide(lon, lat);
  return {cx: x, cy: y, zoom: fullView().zoom * factor, oy};
}

/** The view at a given zoom (pixels per map unit) in which a sky position sits at screen point (sx, sy). */
export function viewHolding(lon: number, lat: number, sx: number, sy: number, zoom: number, oy = -36): MapView {
  const [x, y] = mollweide(lon, lat);
  return {cx: x - (sx - W / 2) / zoom, cy: y + (sy - H / 2 - oy) / zoom, zoom, oy};
}

/** Interpolates two views: zoom changes geometrically, and the point being zoomed toward (or away from)
 * moves in a straight line on screen at the same eased rate. */
export function mixView(a: MapView, b: MapView, u: number): MapView {
  const zoom = a.zoom * Math.pow(b.zoom / a.zoom, u);
  const oy = a.oy + (b.oy - a.oy) * u;
  if (b.zoom >= a.zoom) {
    const k = (a.zoom * (1 - u)) / zoom;
    return {cx: b.cx - (b.cx - a.cx) * k, cy: b.cy - (b.cy - a.cy) * k, zoom, oy};
  }
  const k = (b.zoom * u) / zoom;
  return {cx: a.cx - (a.cx - b.cx) * k, cy: a.cy - (a.cy - b.cy) * k, zoom, oy};
}

/** Ecliptic lon/lat (degrees) to a unit vector (x toward lon 0, z toward the north ecliptic pole). */
export function unitVec(lon: number, lat: number): [number, number, number] {
  const l = lon * D2R;
  const b = lat * D2R;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}
