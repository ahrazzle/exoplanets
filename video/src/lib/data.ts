import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

const promises = new Map<string, Promise<unknown>>();
const values = new Map<string, unknown>();

function load<T>(key: string, loader: () => Promise<T>): Promise<T> {
  let p = promises.get(key) as Promise<T> | undefined;
  if (!p) {
    p = loader().then((v) => {
      values.set(key, v);
      return v;
    });
    promises.set(key, p);
  }
  return p;
}

/** Loads an asset once per tab; the frame waits until it has arrived and been drawn. */
export function useAsset<T>(key: string, loader: () => Promise<T>): T | null {
  const [val, setVal] = useState<T | null>((values.get(key) as T) ?? null);
  const [handle] = useState(() => (values.has(key) ? null : delayRender(`load ${key}`, {timeoutInMilliseconds: 120000})));
  useEffect(() => {
    if (val !== null) return;
    load(key, loader).then((v) => setVal(v));
  }, [key, val, loader]);
  useEffect(() => {
    if (val !== null && handle !== null) continueRender(handle);
  }, [val, handle]);
  return val;
}

export type Sky = {count: number; lonlat: Float32Array; tmag: Uint16Array; teff: Uint16Array};

const loadSky = async (): Promise<Sky> => {
  const meta = await (await fetch(staticFile('data/sky.json'))).json();
  const buf = await (await fetch(staticFile('data/sky.bin'))).arrayBuffer();
  const n = meta.count as number;
  return {
    count: n,
    lonlat: new Float32Array(buf, 0, 2 * n),
    tmag: new Uint16Array(buf, 8 * n, n),
    teff: new Uint16Array(buf, 10 * n, n),
  };
};

export const useSky = () => useAsset('sky', loadSky);

const jsonLoaders = new Map<string, () => Promise<unknown>>();
export function useJson<T>(name: string): T | null {
  let loader = jsonLoaders.get(name);
  if (!loader) {
    loader = async () => (await fetch(staticFile(`data/${name}`))).json();
    jsonLoaders.set(name, loader);
  }
  return useAsset<T>(name, loader as () => Promise<T>);
}

export type Candidate = {tic: number; lon: number; lat: number; r: number; p: number; tier: string; src: string};
export type Points = {
  candidates: Candidate[];
  known: [number, number][];
  labels: {name: string; tic: number; lon: number; lat: number}[];
};
export type Series = {t: number[]; f: number[]};
export type LC = {
  rabtsevich: {
    tic: number;
    sectors: {sector: number; year: number; t: number[]; f: number[]}[];
    planets: {P: number; t0: number; depth_ppm: number; dur_h: number; rp: number; snr: number; fold_x_h: number[]; fold_ppm: number[]}[];
  };
  controls: {star: string; tic: number; sectors: number; signals: {name: string; P: number; depth_ppm: number; snr: number; x_h: number[]; ppm: number[]}[]}[];
  l9859: {sector: number; t: number[]; f: number[]; planets: {name: string; P: number; t0: number}[]};
  inverted: {tic: number; P: number; t0: number; MES: number; depth_ppm: number; dur_h: number; events: number[]; sector: number; t: number[]; f: number[]; fold_x_h: number[]; fold_ppm: number[]};
  eb: {tic: number; P: number; depth_ppm: number; x_h: number[]; ppm: number[]}[];
};
export type Tess = {
  sectors: {sector: number; start: string; ccds: [number, number][][]}[];
  periodogram: {P: number[]; snr: number[]};
};
export type Pixels = {
  tic: number; sector: number; period: number; n: number;
  meanOut: number[][]; diff: number[][]; snr: number[][];
  target: [number, number, number];
  stars: [number, number, number, number, number][];
};
