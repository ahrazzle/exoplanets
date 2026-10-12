import {loadFont as loadGrotesk} from '@remotion/google-fonts/SpaceGrotesk';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

export const W = 1920;
export const H = 1080;

export const C = {
  bg0: '#070B14',
  bg1: '#0E1A2E',
  cyan: '#5CE1E6',
  gold: '#FFC857',
  coral: '#FF5D73',
  earth: '#4F9DFF',
  text: '#E8EEF6',
  text2: '#8FA3BF',
  grid: 'rgba(143,163,191,0.18)',
};

export const SANS = loadGrotesk('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin']}).fontFamily;
export const MONO = loadMono('normal', {weights: ['400', '500', '700'], subsets: ['latin']}).fontFamily;

// Blackbody-ish colour for a stellar effective temperature (K), as linear RGB in 0..1.
export function teffColor(teff: number): [number, number, number] {
  const t = Math.max(2600, Math.min(12000, teff)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [c(r), c(g), c(b)];
}
