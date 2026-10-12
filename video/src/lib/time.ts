import {useCurrentFrame, useVideoConfig} from 'remotion';
import words from '../data/words.json';
import timeline from '../data/timeline.json';

export const LENGTH = timeline.length;
export const PULSE = timeline.music.pulse_enters;
export const SECTION = timeline.music.section_change;
export const FINAL_DOWNBEAT = timeline.music.final_downbeat;
// The music's beat grid (107.7 BPM): the pulse enters on a beat.
export const BEAT = 60 / 107.666;

/** Seconds since the start of the film. */
export function useT(): number {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return frame / fps;
}

type Word = {w: string; s: number; e: number; clip: string};
const W = words as Word[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, '');

/** Start time (s) of the first occurrence of `phrase` in the narration, searching from `after`. */
export function cue(phrase: string, after = 0): number {
  const ps = phrase.split(/\s+/).map(norm);
  for (let i = 0; i < W.length; i++) {
    if (W[i].s < after) continue;
    if (ps.every((p, k) => W[i + k] && norm(W[i + k].w) === p)) return W[i].s;
  }
  throw new Error(`cue not found: ${phrase}`);
}

/** End time (s) of `phrase` in the narration. */
export function cueEnd(phrase: string, after = 0): number {
  const ps = phrase.split(/\s+/).map(norm);
  for (let i = 0; i < W.length; i++) {
    if (W[i].s < after) continue;
    if (ps.every((p, k) => W[i + k] && norm(W[i + k].w) === p)) return W[i + ps.length - 1].e;
  }
  throw new Error(`cue not found: ${phrase}`);
}

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** 0 before a, 1 after b, linear between. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const smooth = (u: number) => u * u * (3 - 2 * u);
export const inOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const outCubic = (u: number) => 1 - Math.pow(1 - u, 3);
export const inCubic = (u: number) => u * u * u;
export const outExpo = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
export const inExpo = (u: number) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10));
export const inOutExpo = (u: number) =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2;
export const outBack = (u: number, s = 1.4) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
export const inOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;

/** Eased progress between a and b. */
export const ease = (t: number, a: number, b: number, f: (u: number) => number = inOutCubic) => f(seg(t, a, b));

/** Opacity for an element shown from `a` to `b`, fading in over `fi` and out over `fo` seconds. */
export const vis = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) =>
  Math.min(outCubic(seg(t, a, a + fi)), 1 - inCubic(seg(t, b - fo, b)));

/** Deterministic pseudo-random numbers. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
