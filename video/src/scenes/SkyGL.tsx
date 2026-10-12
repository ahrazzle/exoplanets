import React, {useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';
import {Candidate, Sky} from '../lib/data';
import {GLSL_COMMON, fullscreenTriangle, makeRenderer, rotX, rotY, rotZ} from '../lib/gl';
import {MapView} from '../lib/proj';
import {H, W} from '../theme';
import {candDelay} from './Result';

/** Everything the sky layer draws in one frame. Projection weights: map = 1 - globe - dome. */
export type SkyState = {
  opacity: number;
  view: MapView;
  globe: number;
  dome: number;
  globeYaw: number;
  globePitch: number;
  globeRadius: number;
  globeCenter: [number, number];
  domeYaw: number;
  domePitch: number;
  domeFov: number;
  domeCenter: [number, number];
  reveal: number;
  exposure: number;
  sat: number;
  starGain: number;
  sizeScale: number;
  cand: number;
  candIgnite: number;
  candChart: number;
  candChartXY: Float32Array | null;
  candSize: number;
  twinkle: number;
  time: number;
};

export const defaultSky = (view: MapView): SkyState => ({
  opacity: 1,
  view,
  globe: 0,
  dome: 0,
  globeYaw: 0,
  globePitch: 0,
  globeRadius: 380,
  globeCenter: [W / 2, H / 2 - 30],
  domeYaw: 0,
  domePitch: 0,
  domeFov: 100,
  domeCenter: [W / 2, H / 2],
  reveal: 5e6,
  exposure: 1.5,
  sat: 1.9,
  starGain: 1,
  sizeScale: 1,
  cand: 0,
  candIgnite: 0,
  candChart: 0,
  candChartXY: null,
  candSize: 1,
  twinkle: 0,
  time: 0,
});

const PROJECT = /* glsl */ `
uniform vec2 uRes;
uniform vec4 uView;
uniform float uGlobe;
uniform float uDome;
uniform mat3 uGlobeRot;
uniform vec3 uGlobeCam;
uniform mat3 uDomeRot;
uniform vec3 uDomeCam;
// Screen position (CSS px) of a sky position, and how visible it is in the current projection mix.
vec3 project(vec2 lonlat) {
  vec2 ll = radians(lonlat);
  float lam = -radians(mod(lonlat.x + 180.0, 360.0) - 180.0);
  vec2 m = mollweide(lam, ll.y);
  vec2 pMap = vec2(uRes.x * 0.5 + (m.x - uView.x) * uView.z, uRes.y * 0.5 + uView.w - (m.y - uView.y) * uView.z);
  vec3 v = vec3(cos(ll.y) * cos(ll.x), cos(ll.y) * sin(ll.x), sin(ll.y));
  vec3 g = uGlobeRot * v;
  float dist = 3.2;
  float persp = dist / (dist - g.z);
  vec2 pGlobe = uGlobeCam.xy + vec2(g.x, -g.y) * uGlobeCam.z * persp;
  float front = mix(0.12, 1.0, smoothstep(-0.25, 0.3, g.z));
  vec3 d = uDomeRot * v;
  float fwd = -d.z;
  vec2 pDome = uDomeCam.xy + vec2(d.x, -d.y) * uDomeCam.z / max(fwd, 0.04);
  float inDome = smoothstep(0.03, 0.2, fwd);
  float wMap = 1.0 - uGlobe - uDome;
  vec2 p = pMap * wMap + pGlobe * uGlobe + pDome * uDome;
  float vis = mix(1.0, front, uGlobe) * mix(1.0, inDome, uDome);
  return vec3(p, vis);
}
`;

const starVert = /* glsl */ `
${GLSL_COMMON}
${PROJECT}
attribute vec2 lonlat;
attribute float tmag;
attribute float teff;
uniform float uReveal;
uniform float uDpr;
uniform float uGain;
uniform float uSizeScale;
uniform float uZoomGain;
varying vec3 vColor;
varying float vPeak;
varying float vHalo;
void main() {
  float i = float(gl_VertexID);
  float rev = clamp((uReveal - i) / max(uReveal * 0.35, 2000.0), 0.0, 1.0);
  vec3 pv = project(lonlat);
  if (rev <= 0.0 || pv.z <= 0.001) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 0.0; return; }
  float mag = tmag / 1000.0;
  float l = clamp((13.5 - mag) / 10.8, 0.0, 1.0);          // 0 faintest .. 1 brightest
  float size = (4.4 + 4.6 * pow(l, 2.4)) * uSizeScale;
  float flux = pow(10.0, -0.4 * (mag - 13.5));
  vPeak = 0.0036 * pow(flux, 0.74) * uGain * uZoomGain * rev * pv.z;
  vHalo = smoothstep(0.45, 0.85, l) * 0.6;
  // the diffuse glow of faint stars is drawn cool, the stars bright enough to pick out in their own colour
  vColor = mix(vec3(0.42, 0.62, 1.0), starColor(teff), smoothstep(0.28, 0.6, l));
  gl_PointSize = size * uDpr * (1.0 + vHalo * 2.5);
  gl_Position = vec4(pv.x / uRes.x * 2.0 - 1.0, 1.0 - pv.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

const starFrag = /* glsl */ `
varying vec3 vColor;
varying float vPeak;
varying float vHalo;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float coreR = 1.0 / (1.0 + vHalo * 2.5);
  float core = exp(-pow(r / coreR, 2.0) * 3.2);
  float halo = vHalo * exp(-r * 4.5) * 0.35;
  float a = (core + halo) * smoothstep(1.0, 0.8, r);
  gl_FragColor = vec4(vColor * vPeak * a, 1.0);
}
`;

const candVert = /* glsl */ `
${GLSL_COMMON}
${PROJECT}
attribute vec2 lonlat;
attribute vec2 chartXY;
attribute float delay;
attribute float radius;
attribute float period;
uniform float uIgnite;
uniform float uChart;
uniform float uDpr;
uniform float uAlpha;
uniform float uSize;
uniform float uTime;
uniform float uTwinkle;
varying float vPeak;
varying float vFlash;
varying float vChart;
varying float vSize;
varying float vTheta;
varying float vRot;
varying float vGrow;
void main() {
  vec3 pv = project(lonlat);
  float on = smoothstep(delay, delay + 0.025, uIgnite);
  float flash = exp(-max(uIgnite - delay, 0.0) * 9.0) * on;
  // the little orbit opens out as the candidate lights up
  vGrow = smoothstep(delay, delay + 0.08, uIgnite);
  // its planet goes round once in 3 s for a 1-day orbit, 8 s for a 100-day one, from a random start, in an
  // orbit tilted within about 20 degrees of the horizontal
  float h = fract(delay * 91.7 + float(gl_VertexID) * 0.6180339);
  float turn = 3.0 + 2.5 * log(max(period, 0.3)) / log(10.0);
  vTheta = 6.2831853 * (uTime / turn + h);
  vRot = (fract(h * 7.31 + delay * 13.7) - 0.5) * 0.7;
  float stagger = delay * 0.35;
  float c = smoothstep(stagger, stagger + 0.65, uChart);
  c = c * c * (3.0 - 2.0 * c);
  vChart = c;
  // fly along an arc: lift off the sky before landing
  vec2 a = pv.xy;
  vec2 b = chartXY;
  vec2 mid = mix(a, b, 0.5) + vec2(0.0, -180.0 - 120.0 * delay);
  vec2 p = mix(mix(a, mid, c), mix(mid, b, c), c);
  float vis = mix(pv.z, 1.0, c);
  float tw = 0.5 + 0.5 * sin(uTime * (1.7 + 2.6 * fract(delay * 37.0)) + delay * 50.0);
  vPeak = on * vis * uAlpha * (1.0 - uTwinkle * 0.45 * tw);
  vFlash = flash;
  // room for the orbit, which starts wide and settles as the candidate lights up
  float size = mix(34.0, 22.0, c) * uSize * (1.0 + 0.9 * flash * (1.0 - c));
  vSize = size;
  gl_PointSize = size * uDpr;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

// A candidate is drawn as a planet, not a point of light: on the sky, its host star with a small orbit and
// the planet going round it; on the size axis, a lit sphere.
const candFrag = /* glsl */ `
varying float vPeak;
varying float vFlash;
varying float vChart;
varying float vSize;
varying float vTheta;
varying float vRot;
varying float vGrow;
void main() {
  vec2 pc = (gl_PointCoord - 0.5) * vSize;           // px from the centre, y down
  float k = vSize / (34.0 * (1.0 + 0.9 * vFlash * (1.0 - vChart)));   // 1 at full size on the sky
  vec3 gold = vec3(1.0, 0.70, 0.26);
  // on the sky: the orbit (an ellipse, by its approximate distance field), the planet on it, the star
  float cr = cos(vRot), sr = sin(vRot);
  vec2 e = vec2(cr * pc.x + sr * pc.y, -sr * pc.x + cr * pc.y);
  vec2 ab = vec2(12.5, 4.6) * k * (1.0 + 0.9 * vFlash) * mix(0.3, 1.0, vGrow);
  float k0 = length(e / ab);
  float k1 = length(e / (ab * ab));
  float dist = k0 * (k0 - 1.0) / max(k1, 1e-4);
  float ring = 1.0 - smoothstep(0.3, 1.2, abs(dist));
  vec2 pp = vec2(ab.x * cos(vTheta), ab.y * sin(vTheta));
  pp = vec2(cr * pp.x - sr * pp.y, sr * pp.x + cr * pp.y);
  float pr = 2.4 * k;
  float planet = 1.0 - smoothstep(pr - 0.7, pr + 0.7, length(pc - pp));
  float star = exp(-dot(pc, pc) / (2.0 * k * k));
  vec3 sky = gold * (0.5 + 1.5 * vFlash) * ring * vGrow + vec3(1.0, 0.88, 0.66) * 1.6 * planet * vGrow
    + vec3(1.0, 0.95, 0.85) * 1.5 * star;
  // on the size axis: a sphere lit from the upper left
  float rs = 0.3 * vSize;
  vec2 q = pc / rs;
  float r2 = dot(q, q);
  float disc = 1.0 - smoothstep(1.0 - 1.2 / rs, 1.0 + 1.2 / rs, sqrt(r2));
  vec3 n = vec3(q, sqrt(max(1.0 - r2, 0.0)));
  float lam = max(dot(n, normalize(vec3(-0.55, -0.5, 0.67))), 0.0);
  vec3 ball = gold * (0.05 + 1.3 * lam) * disc;
  gl_FragColor = vec4(mix(sky, ball, vChart) * vPeak, 1.0);
}
`;

const postFrag = /* glsl */ `
uniform sampler2D tHDR;
uniform float uExposure;
uniform float uSat;
varying vec2 vUv;
void main() {
  vec3 h = texture2D(tHDR, vUv).rgb * uExposure;
  vec3 c = 1.0 - exp(-h);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(lum), c, uSat), 0.0, 1.0);
  // a toe that keeps the diffuse star glow dark, so the Milky Way's structure carries the image
  c = c * c / (c + 0.11);
  c = pow(c, vec3(1.0 / 1.9));
  gl_FragColor = vec4(c, 1.0);
}
`;

const postVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

type GL = {
  renderer: THREE.WebGLRenderer;
  rt: THREE.WebGLRenderTarget;
  starScene: THREE.Scene;
  starMat: THREE.ShaderMaterial;
  candMat: THREE.ShaderMaterial;
  candGeo: THREE.BufferGeometry;
  candPoints: THREE.Points;
  postScene: THREE.Scene;
  postMat: THREE.ShaderMaterial;
  camera: THREE.Camera;
};

const projectUniforms = () => ({
  uRes: {value: new THREE.Vector2(W, H)},
  uView: {value: new THREE.Vector4()},
  uGlobe: {value: 0},
  uDome: {value: 0},
  uGlobeRot: {value: new THREE.Matrix3()},
  uGlobeCam: {value: new THREE.Vector3()},
  uDomeRot: {value: new THREE.Matrix3()},
  uDomeCam: {value: new THREE.Vector3()},
});

// Ecliptic frame to view frames. The globe is drawn mirrored (a celestial globe), so that east is on the
// left on its face as it is on the map; the dome is the view from inside.
const GLOBE_BASE = new THREE.Matrix3().set(0, -1, 0, 0, 0, 1, 1, 0, 0);
const DOME_BASE = new THREE.Matrix3().set(0, -1, 0, 0, 0, 1, -1, 0, 0);

function setProjection(u: Record<string, THREE.IUniform>, s: SkyState) {
  (u.uView.value as THREE.Vector4).set(s.view.cx, s.view.cy, s.view.zoom, s.view.oy);
  u.uGlobe.value = s.globe;
  u.uDome.value = s.dome;
  const g = rotX(s.globePitch).multiply(GLOBE_BASE.clone()).multiply(rotZ(s.globeYaw));
  (u.uGlobeRot.value as THREE.Matrix3).copy(g);
  (u.uGlobeCam.value as THREE.Vector3).set(s.globeCenter[0], s.globeCenter[1], s.globeRadius);
  const d = rotX(s.domePitch).multiply(DOME_BASE.clone()).multiply(rotZ(s.domeYaw));
  (u.uDomeRot.value as THREE.Matrix3).copy(d);
  const f = (W / 2) / Math.tan(((s.domeFov / 2) * Math.PI) / 180);
  (u.uDomeCam.value as THREE.Vector3).set(s.domeCenter[0], s.domeCenter[1], f);
}

export const SkyGL: React.FC<{sky: Sky; cands: Candidate[] | null; state: SkyState}> = ({sky, cands, state}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<GL | null>(null);

  useLayoutEffect(() => {
    const renderer = makeRenderer(canvas.current!, W, H);
    const dpr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, {type: THREE.HalfFloatType, depthBuffer: false});
    const camera = new THREE.Camera();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('lonlat', new THREE.BufferAttribute(sky.lonlat, 2));
    geo.setAttribute('tmag', new THREE.BufferAttribute(sky.tmag, 1));
    geo.setAttribute('teff', new THREE.BufferAttribute(sky.teff, 1));
    geo.setDrawRange(0, sky.count);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const starMat = new THREE.ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      uniforms: {
        ...projectUniforms(),
        uReveal: {value: 0},
        uDpr: {value: dpr},
        uGain: {value: 1},
        uSizeScale: {value: 1},
        uZoomGain: {value: 1},
      },
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const stars = new THREE.Points(geo, starMat);
    stars.frustumCulled = false;
    const starScene = new THREE.Scene();
    starScene.add(stars);

    const candGeo = new THREE.BufferGeometry();
    const candMat = new THREE.ShaderMaterial({
      vertexShader: candVert,
      fragmentShader: candFrag,
      uniforms: {
        ...projectUniforms(),
        uIgnite: {value: 0},
        uChart: {value: 0},
        uDpr: {value: dpr},
        uAlpha: {value: 0},
        uSize: {value: 1},
        uTime: {value: 0},
        uTwinkle: {value: 0},
      },
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const candPoints = new THREE.Points(candGeo, candMat);
    candPoints.frustumCulled = false;

    const postMat = new THREE.ShaderMaterial({
      vertexShader: postVert,
      fragmentShader: postFrag,
      uniforms: {tHDR: {value: rt.texture}, uExposure: {value: 1}, uSat: {value: 1}},
      depthTest: false,
      depthWrite: false,
    });
    const postScene = new THREE.Scene();
    const tri = new THREE.Mesh(fullscreenTriangle(), postMat);
    tri.frustumCulled = false;
    postScene.add(tri);

    gl.current = {renderer, rt, starScene, starMat, candMat, candGeo, candPoints, postScene, postMat, camera};
    return () => {
      geo.dispose();
      candGeo.dispose();
      starMat.dispose();
      candMat.dispose();
      postMat.dispose();
      rt.dispose();
      renderer.dispose();
      gl.current = null;
    };
  }, [sky]);

  // Candidate attributes: sky positions, chart positions and ignition delays. A layout effect, declared
  // before the draw, so the very first frame a tab renders already has them.
  useLayoutEffect(() => {
    const g = gl.current;
    if (!g || !cands) return;
    const n = cands.length;
    const ll = new Float32Array(2 * n);
    const delay = new Float32Array(n);
    const rad = new Float32Array(n);
    const per = new Float32Array(n);
    cands.forEach((c, i) => {
      ll[2 * i] = c.lon;
      ll[2 * i + 1] = c.lat;
      delay[i] = candDelay(c);
      rad[i] = c.r;
      per[i] = c.p;
    });
    g.candGeo.setAttribute('lonlat', new THREE.BufferAttribute(ll, 2));
    g.candGeo.setAttribute('delay', new THREE.BufferAttribute(delay, 1));
    g.candGeo.setAttribute('radius', new THREE.BufferAttribute(rad, 1));
    g.candGeo.setAttribute('period', new THREE.BufferAttribute(per, 1));
    g.candGeo.setAttribute('chartXY', new THREE.BufferAttribute(new Float32Array(2 * n), 2));
    g.candGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    // there is no position attribute, so three.js needs the point count from the draw range
    g.candGeo.setDrawRange(0, n);
    if (!g.starScene.children.includes(g.candPoints)) g.starScene.add(g.candPoints);
  }, [cands, sky]);

  useLayoutEffect(() => {
    const g = gl.current;
    if (!g) return;
    const s = state;
    setProjection(g.starMat.uniforms, s);
    g.starMat.uniforms.uReveal.value = s.reveal;
    g.starMat.uniforms.uGain.value = s.starGain;
    g.starMat.uniforms.uSizeScale.value = s.sizeScale;
    const zf = s.view.zoom / (1720 / (4 * Math.SQRT2));
    g.starMat.uniforms.uZoomGain.value = Math.pow(Math.max(1, zf), 0.55) * (1 - s.globe) + s.globe * 0.6;
    setProjection(g.candMat.uniforms, s);
    g.candMat.uniforms.uIgnite.value = s.candIgnite;
    g.candMat.uniforms.uChart.value = s.candChart;
    g.candMat.uniforms.uAlpha.value = s.cand;
    g.candMat.uniforms.uSize.value = s.candSize;
    g.candMat.uniforms.uTime.value = s.time;
    g.candMat.uniforms.uTwinkle.value = s.twinkle;
    g.candPoints.visible = s.cand > 0.001;
    if (s.candChartXY && g.candGeo.getAttribute('chartXY')) {
      const a = g.candGeo.getAttribute('chartXY') as THREE.BufferAttribute;
      (a.array as Float32Array).set(s.candChartXY);
      a.needsUpdate = true;
    }
    g.postMat.uniforms.uExposure.value = s.exposure;
    g.postMat.uniforms.uSat.value = s.sat;

    g.renderer.setRenderTarget(g.rt);
    g.renderer.setClearColor(0x000000, 1);
    g.renderer.clear();
    g.renderer.render(g.starScene, g.camera);
    g.renderer.setRenderTarget(null);
    g.renderer.clear();
    g.renderer.render(g.postScene, g.camera);
  });

  return (
    <canvas
      ref={canvas}
      width={W}
      height={H}
      style={{position: 'absolute', inset: 0, width: W, height: H, mixBlendMode: 'screen', opacity: state.opacity}}
    />
  );
};
