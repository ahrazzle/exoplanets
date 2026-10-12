import React, {useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {makeRenderer} from '../lib/gl';
import {V3, starField} from '../lib/space3d';
import {T} from './times';
import {C, H, SANS, W} from '../theme';
import {ease, inOutCubic, lerp, outCubic, rng, seg, vis} from '../lib/time';

// "Only a few planets line up just right", in real space: star systems in a thick sheet, one to each cell of a
// grid across it at a random depth, their orbits at random tilts, as in nature. Seen from where we are, a planet
// crosses its star only if its orbit is within R*/a of edge-on; with a = 7 R*, about one system in seven. As in
// the 2D field, those are singled out: their orbits turn gold and bold while every other system dims, and their
// planets cross their stars. Then the camera pulls far back: the systems fill space in every direction, their
// orbits fade as they shrink, and the field becomes a field of stars.

const A_OVER_R = 7;
const CELL = 11;
const SLAB = {x: 600, y: 340, depth: 50};          // wide enough to fill the frame when pulled back
const ORBITS = {x: 380, y: 215};                   // orbits are drawn where they can still be large enough to see
const SEGS = 40;
const F = H / 2 / Math.tan((35 / 2) * (Math.PI / 180));
const OBS: V3 = [0, 0, 70];                        // where we are when the aligned systems light up

type Sys = {c: V3; a: number; u: V3; v: V3; w: number; ph: number; aligned: boolean; front: number; hue: number};

const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const norm = (p: V3): V3 => {
  const l = Math.hypot(...p) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};

function makeSystems(): Sys[] {
  const r = rng(17);
  const out: Sys[] = [];
  {
    for (let j = -Math.ceil(SLAB.y / CELL); j < Math.ceil(SLAB.y / CELL); j++) {
      for (let i = -Math.ceil(SLAB.x / CELL); i < Math.ceil(SLAB.x / CELL); i++) {
        const c: V3 = [(i + 0.5 + (r() - 0.5) * 0.8) * CELL, (j + 0.5 + (r() - 0.5) * 0.8) * CELL, -SLAB.depth * r()];
        // a uniformly random orbit normal
        const z = 2 * r() - 1;
        const phi = 2 * Math.PI * r();
        const rr = Math.sqrt(1 - z * z);
        const n: V3 = [rr * Math.cos(phi), rr * Math.sin(phi), z];
        const u = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
        const v = cross(n, u);
        const toUs = norm([OBS[0] - c[0], OBS[1] - c[1], OBS[2] - c[2]]);
        out.push({
          c,
          a: 2.6 + 0.8 * r(),
          u,
          v,
          w: 0.9 + 1.4 * r(),
          ph: 2 * Math.PI * r(),
          aligned: Math.abs(dot(n, toUs)) < 1 / A_OVER_R,
          // where on its orbit the planet is nearest to us
          front: Math.atan2(dot(toUs, v), dot(toUs, u)),
          hue: r(),
        });
      }
    }
  }
  return out;
}

const hasOrbit = (s: Sys) => Math.abs(s.c[0]) < ORBITS.x && Math.abs(s.c[1]) < ORBITS.y;

const STAR_VERT = /* glsl */ `
attribute float aA;
attribute float aHue;
attribute float aAligned;
attribute float aFront;
attribute float aPh;
attribute float aW;
uniform float uF;
uniform float uTime;
uniform float uDpr;
uniform float uHighlight;
varying vec3 vCol;
varying float vDisc;
varying float vGlow;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  if (depth < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float R = aA / ${A_OVER_R.toFixed(1)};
  float rpx = R * uF / depth;
  // an aligned system's planet crossing in front of its star, seen from where we are: the star dims and,
  // once its orbit is too small to see, blinks gold
  float dth = aPh + aW * uTime - aFront;
  float transit = aAligned * step(0.0, cos(dth)) * step(abs(sin(dth)) * aA, R * 1.15);
  float orbitPx = aA * uF / depth;
  float far = 1.0 - clamp((orbitPx - 8.0) / 14.0, 0.0, 1.0);
  vec3 warm = vec3(1.0, 0.75 + 0.16 * aHue, 0.55 + 0.24 * aHue);
  vec3 white = vec3(1.0, 0.9, 0.82 + 0.16 * aHue);
  vCol = mix(warm, white, step(0.5, aHue)) * (1.0 - 0.45 * transit);
  vCol = mix(vCol, vec3(1.0, 0.78, 0.34) * 1.6, transit * far);
  // once the lined-up systems are picked out, every other star dims
  vCol *= 1.0 - 0.7 * uHighlight * (1.0 - aAligned);
  float glowR = max(rpx * 3.2, 2.2);
  vDisc = rpx / glowR;
  // far away the glow fades to a point of light, as a star's does
  vGlow = clamp(rpx / 2.0, 0.3, 1.0);
  gl_PointSize = 2.0 * glowR * uDpr;
  gl_Position = projectionMatrix * mv;
}`;

// the glow, added; and, in a second pass, the opaque disc that hides what is behind the star
const GLOW_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vCol;
varying float vDisc;
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float g = 0.95 * exp(-pow(r / 0.3, 2.0) * 1.2) + 0.25 * (1.0 - r);
  gl_FragColor = vec4(vCol * g * vGlow * 0.8 * uAlpha * smoothstep(1.0, 0.7, r), 1.0);
}`;

const DISC_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vCol;
varying float vDisc;
void main() {
  if (vDisc < 0.25) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0 / vDisc;
  if (r > 1.0) discard;
  float mu = sqrt(max(1.0 - r * r, 0.0));
  float ld = 1.0 - 0.5 * (1.0 - mu);
  vec3 c = 1.0 - exp(-vCol * ld * 1.2);
  gl_FragColor = vec4(c * uAlpha, 1.0);
}`;

const PLANET_VERT = /* glsl */ `
attribute vec4 aStar;   // the host star's centre, and the orbit's radius
attribute float aAligned;
uniform float uF;
uniform float uDpr;
uniform float uHighlight;
varying vec3 vL;
varying float vNear;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  float orbitPx = aStar.w * uF / depth;
  vNear = clamp((orbitPx - 8.0) / 14.0, 0.0, 1.0) * (1.0 - 0.7 * uHighlight * (1.0 - aAligned));
  if (depth < 0.5 || vNear <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float rp = 0.06 * aStar.w * uF / depth;
  vL = normalize(mat3(viewMatrix) * (aStar.xyz - position));
  gl_PointSize = 2.0 * max(rp, 1.1) * uDpr;
  gl_Position = projectionMatrix * mv;
}`;

const PLANET_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vL;
varying float vNear;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));
  float lam = max(dot(n, vL), 0.0);
  vec3 c = vec3(0.42, 0.6, 0.95) * (0.06 + 1.5 * lam);
  gl_FragColor = vec4(1.0 - exp(-c * 1.4), vNear * uAlpha);
}`;

const ORBIT_VERT = /* glsl */ `
attribute vec4 aCenter;  // the system's centre, and the orbit's radius
attribute float aAligned;
uniform float uF;
uniform float uHighlight;
uniform float uAlpha;
varying vec4 vCol;
void main() {
  vec4 mc = modelViewMatrix * vec4(aCenter.xyz, 1.0);
  float orbitPx = aCenter.w * uF / max(-mc.z, 0.5);
  float near = clamp((orbitPx - 8.0) / 14.0, 0.0, 1.0);
  float a = 0.42 * (aAligned > 0.5 ? 1.0 - uHighlight : 1.0 - 0.7 * uHighlight);
  vCol = vec4(0.56, 0.64, 0.75, a * near * uAlpha);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ORBIT_FRAG = /* glsl */ `
varying vec4 vCol;
void main() { gl_FragColor = vCol; }`;

type World = {
  r: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sky: THREE.Points;
  sys: Sys[];
  orbitIdx: number[];
  planetPos: THREE.BufferAttribute;
  mats: THREE.ShaderMaterial[];
  gold: {geo: LineSegmentsGeometry; idx: number[]; col: Float32Array};
};

function makeWorld(canvas: HTMLCanvasElement): World {
  const r = makeRenderer(canvas, W, H);
  const dpr = r.getPixelRatio();
  const sys = makeSystems();
  const scene = new THREE.Scene();
  const sky = starField(2400, 23, 0.7);
  scene.add(sky);

  // stars
  const n = sys.length;
  const pos = new Float32Array(3 * n);
  const attr = (k: (s: Sys) => number) => new THREE.BufferAttribute(Float32Array.from(sys, k), 1);
  sys.forEach((s, i) => pos.set(s.c, 3 * i));
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aA', attr((s) => s.a));
  sg.setAttribute('aHue', attr((s) => s.hue));
  sg.setAttribute('aAligned', attr((s) => (s.aligned ? 1 : 0)));
  sg.setAttribute('aFront', attr((s) => s.front));
  sg.setAttribute('aPh', attr((s) => s.ph));
  sg.setAttribute('aW', attr((s) => s.w));
  const common = {uF: {value: F}, uTime: {value: 0}, uDpr: {value: dpr}, uAlpha: {value: 1}, uHighlight: {value: 0}};
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: GLOW_FRAG, uniforms: common,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const discMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: DISC_FRAG, uniforms: common,
    depthTest: true, depthWrite: true,
  });
  const glow = new THREE.Points(sg, glowMat);
  glow.renderOrder = 1;
  const disc = new THREE.Points(sg, discMat);
  disc.renderOrder = 2;
  for (const o of [glow, disc]) {
    o.frustumCulled = false;
    scene.add(o);
  }

  // planets and orbits, where orbits are drawn
  const orbitIdx = sys.flatMap((s, i) => (hasOrbit(s) ? [i] : []));
  const m = orbitIdx.length;
  const pg = new THREE.BufferGeometry();
  const planetPos = new THREE.BufferAttribute(new Float32Array(3 * m), 3);
  planetPos.setUsage(THREE.DynamicDrawUsage);
  const star4 = new Float32Array(4 * m);
  orbitIdx.forEach((i, k) => star4.set([...sys[i].c, sys[i].a], 4 * k));
  pg.setAttribute('position', planetPos);
  pg.setAttribute('aStar', new THREE.BufferAttribute(star4, 4));
  pg.setAttribute('aAligned', new THREE.BufferAttribute(Float32Array.from(orbitIdx, (i) => (sys[i].aligned ? 1 : 0)), 1));
  const planetMat = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: common,
    depthTest: true, depthWrite: true, transparent: true,
  });
  const planets = new THREE.Points(pg, planetMat);
  planets.frustumCulled = false;
  planets.renderOrder = 3;
  scene.add(planets);

  const lp = new Float32Array(m * SEGS * 6);
  const lc = new Float32Array(m * SEGS * 8);
  const la = new Float32Array(m * SEGS * 2);
  orbitIdx.forEach((i, k) => {
    const s = sys[i];
    for (let q = 0; q < SEGS; q++) {
      for (let e = 0; e < 2; e++) {
        const th = (2 * Math.PI * (q + e)) / SEGS;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const o = (k * SEGS + q) * 2 + e;
        lp.set([s.c[0] + s.a * (c * s.u[0] + sn * s.v[0]), s.c[1] + s.a * (c * s.u[1] + sn * s.v[1]), s.c[2] + s.a * (c * s.u[2] + sn * s.v[2])], 3 * o);
        lc.set([...s.c, s.a], 4 * o);
        la[o] = s.aligned ? 1 : 0;
      }
    }
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('aCenter', new THREE.BufferAttribute(lc, 4));
  lg.setAttribute('aAligned', new THREE.BufferAttribute(la, 1));
  const orbitMat = new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERT, fragmentShader: ORBIT_FRAG, uniforms: common,
    depthTest: true, depthWrite: false, transparent: true,
  });
  const orbits = new THREE.LineSegments(lg, orbitMat);
  orbits.frustumCulled = false;
  orbits.renderOrder = 4;
  scene.add(orbits);

  // the lined-up systems' orbits, bold and gold once they are picked out
  const idx: number[] = [];
  const gp: number[] = [];
  orbitIdx.forEach((i, k) => {
    if (!sys[i].aligned) return;
    idx.push(i);
    gp.push(...lp.subarray(k * SEGS * 6, (k + 1) * SEGS * 6));
  });
  const geo = new LineSegmentsGeometry();
  geo.setPositions(gp);
  const col = new Float32Array(gp.length);
  geo.setColors(col);
  const goldMat = new LineMaterial({vertexColors: true, linewidth: 2.4, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending});
  goldMat.resolution.set(W, H);
  const goldLines = new LineSegments2(geo, goldMat);
  goldLines.frustumCulled = false;
  goldLines.renderOrder = 5;
  scene.add(goldLines);

  return {r, scene, sky, sys, orbitIdx, planetPos, mats: [glowMat, discMat, planetMat, orbitMat], gold: {geo, idx, col}};
}

const GOLD = new THREE.Color(C.gold);

const t0 = () => T.lineUp - 0.4;

/** The camera: a slow sideways drift while we look, then a long pull back, geometric in distance. */
function cameraAt(t: number) {
  const hold = seg(t, t0(), T.watchLot - 0.2);
  const pull = ease(t, T.watchLot - 0.2, T.since + 0.3, inOutCubic);
  const zHold = lerp(78, 68, outCubic(hold));
  const z = Math.exp(lerp(Math.log(zHold), Math.log(1000), pull));
  const cam = new THREE.PerspectiveCamera(35, W / H, 0.5, 5000);
  cam.position.set(lerp(-8, 8, hold) * (1 - pull), lerp(2, -2, hold) * (1 - pull), z);
  cam.lookAt(cam.position.x, cam.position.y, -1e4);
  cam.updateMatrixWorld(true);
  return cam;
}

export const Field3D: React.FC<{t: number}> = ({t}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  useLayoutEffect(() => {
    world.current = makeWorld(canvas.current!);
    return () => {
      world.current?.r.dispose();
      world.current = null;
    };
  }, []);

  const highlight = ease(t, T.lineUp + 1.2, T.lineUp + 2.2, inOutCubic);
  const appear = outCubic(seg(t, T.lineUp - 0.3, T.lineUp + 0.7));
  const out = 1 - seg(t, T.since - 0.5, T.since + 0.6);

  useLayoutEffect(() => {
    const g = world.current;
    if (!g) return;
    const cam = cameraAt(t);
    const tt = t - t0();
    const a = g.planetPos.array as Float32Array;
    g.orbitIdx.forEach((i, k) => {
      const s = g.sys[i];
      const th = s.ph + s.w * tt;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      a[3 * k] = s.c[0] + s.a * (c * s.u[0] + sn * s.v[0]);
      a[3 * k + 1] = s.c[1] + s.a * (c * s.u[1] + sn * s.v[1]);
      a[3 * k + 2] = s.c[2] + s.a * (c * s.u[2] + sn * s.v[2]);
    });
    g.planetPos.needsUpdate = true;
    // each gold orbit fades as it shrinks, like the grey ones (the camera looks straight down -z)
    g.gold.idx.forEach((i, k) => {
      const s = g.sys[i];
      const near = Math.min(1, Math.max(0, ((s.a * F) / Math.max(cam.position.z - s.c[2], 0.5) - 8) / 14));
      const v = 0.9 * highlight * near * appear;
      for (let q = 0; q < SEGS * 2; q++) g.gold.col.set([GOLD.r * v, GOLD.g * v, GOLD.b * v], (k * SEGS * 2 + q) * 3);
    });
    g.gold.geo.setColors(g.gold.col);
    for (const m of g.mats) {
      m.uniforms.uTime.value = tt;
      m.uniforms.uHighlight.value = highlight;
      m.uniforms.uAlpha.value = appear;
    }
    g.sky.position.copy(cam.position);
    g.r.clear();
    g.r.render(g.scene, cam);
  });

  const lab = vis(t, T.lineUp + 1.6, T.watchLot + 0.2, 0.5, 0.5);
  return (
    // opacity on each element, not the wrapper, so the canvas still screens onto the sky map as it fades
    <div style={{position: 'absolute', inset: 0}}>
      <canvas ref={canvas} width={W} height={H} style={{position: 'absolute', inset: 0, width: W, height: H, mixBlendMode: 'screen', opacity: out}} />
      <div style={{position: 'absolute', left: 0, width: W, top: 34, textAlign: 'center', opacity: lab * out, fontFamily: SANS,
        textShadow: '0 2px 14px rgba(4,7,14,0.95), 0 0 4px rgba(4,7,14,0.9)'}}>
        <span style={{fontSize: 46, color: C.gold, fontWeight: 600}}>only a few</span>
        <span style={{fontSize: 40, color: C.text}}> line up with our view</span>
      </div>
    </div>
  );
};

export const field3DVisible = (t: number) => t > T.lineUp - 0.4 && t < T.since + 0.7;
