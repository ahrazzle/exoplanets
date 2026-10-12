import * as THREE from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {H, W} from '../theme';
import {rng} from './time';

// Pieces for real 3D shots: a star and planets as spheres, orbits as crisp lines, a star field at infinity,
// and the telescope glare drawn over everything. The shaders use StarGL's tone curve (exposure, then a gamma
// of 2), so a 3D star looks like the 2D one. Every frame is a pure function of the shot's state.

export type V3 = [number, number, number];

export const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                 mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                 mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
vec3 tone(vec3 col, float e) { return pow(1.0 - exp(-col * e), vec3(0.5)); }
`;

/** A star's photosphere on a unit sphere: limb darkening and slowly boiling granulation, as in StarGL. */
export function starMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: new THREE.Vector3(1, 0.36, 0.1)},
      uCore: {value: new THREE.Vector3(1, 0.74, 0.44)},
      uTime: {value: 0},
      uExposure: {value: 1.1},
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uCore;
      uniform float uTime;
      uniform float uExposure;
      varying vec3 vObj;
      varying vec3 vN;
      varying vec3 vP;
      ${NOISE_GLSL}
      void main() {
        float mu = clamp(dot(normalize(vN), normalize(-vP)), 0.0, 1.0);
        float ld = 1.0 - 0.55 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
        vec3 sp = normalize(vObj);
        float g = fbm(sp * 7.0 + vec3(uTime * 0.07, -uTime * 0.05, uTime * 0.04));
        float g2 = fbm(sp * 19.0 - vec3(uTime * 0.11, uTime * 0.08, 0.0));
        float gran = 0.78 + 0.32 * g + 0.12 * g2;
        vec3 tint = mix(uColor, uCore, pow(mu, 0.7));
        gl_FragColor = vec4(tone(tint * ld * gran * 2.2, uExposure), 1.0);
      }`,
  });
}

/** A planet lit by a star at uStar: faint banding along its latitude, a dark night side (uFill lifts it a
 * little), and a thin atmospheric rim on the day side. */
export function planetMaterial(albedo: V3, albedo2: V3, atmo: V3) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStar: {value: new THREE.Vector3()},
      uAlbedo: {value: new THREE.Vector3(...albedo)},
      uAlbedo2: {value: new THREE.Vector3(...albedo2)},
      uAtmo: {value: new THREE.Vector3(...atmo)},
      uLit: {value: 1},
      uFill: {value: 0},
      uExposure: {value: 1.1},
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vW;
      varying vec3 vNW;
      void main() {
        vObj = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vNW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uStar;
      uniform vec3 uAlbedo;
      uniform vec3 uAlbedo2;
      uniform vec3 uAtmo;
      uniform float uLit;
      uniform float uFill;
      uniform float uExposure;
      varying vec3 vObj;
      varying vec3 vW;
      varying vec3 vNW;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNW);
        vec3 L = normalize(uStar - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(n, L);
        vec3 o = normalize(vObj);
        // bands along the latitude, wavy, with finer streaks in them
        float lat = o.y + 0.07 * (fbm(o * 3.0 + 7.0) - 0.5);
        float b = fbm(vec3(lat * 9.0, lat * 2.0 + 0.5 * o.x, 0.5 * o.z) + 3.0);
        float streak = noise(vec3(lat * 34.0, o.x * 1.5, o.z * 1.5));
        vec3 alb = mix(uAlbedo, uAlbedo2, smoothstep(0.3, 0.72, b)) * (0.88 + 0.24 * streak);
        // a soft terminator, and a faint cool fill so the night side still reads as a ball against space
        float lit = clamp((ndl + 0.06) / 1.06, 0.0, 1.0);
        vec3 col = alb * (0.012 + 1.15 * lit) + vec3(0.006, 0.011, 0.024) * uFill * (0.5 + 0.5 * dot(n, V));
        // a thin atmosphere at the limb, bright where the day side meets it
        float rim = pow(1.0 - max(dot(n, V), 0.0), 5.0);
        col += uAtmo * rim * smoothstep(-0.2, 0.4, ndl) * 0.9;
        gl_FragColor = vec4(tone(col * uLit, uExposure), 1.0);
      }`,
  });
}

/** Light around a star, computed in screen pixels as StarGL does: a glow just outside the limb (hidden
 * behind a planet in front), and the telescope view's halo and diffraction spikes, over everything. Drawn
 * with screen blending over the 3D scene. */
export function glareMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRes: {value: new THREE.Vector2(W, H)},
      uDpr: {value: 1},
      uStar: {value: new THREE.Vector3()},
      uColor: {value: new THREE.Vector3(1, 0.36, 0.1)},
      uGlare: {value: 0},
      uHalo: {value: 0},
      uGlow: {value: 1},
      uExposure: {value: 1.1},
      uPlanet: {value: new THREE.Vector3(-1000, -1000, 1)},
      uFront: {value: 0},
    },
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uRes;
      uniform float uDpr;
      uniform vec3 uStar;
      uniform vec3 uColor;
      uniform float uGlare;
      uniform float uHalo;
      uniform float uGlow;
      uniform float uExposure;
      uniform vec3 uPlanet;
      uniform float uFront;
      void main() {
        vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
        vec2 d = p - uStar.xy;
        float R = max(uStar.z, 0.5);
        float rpx = length(d);
        float r = rpx / R;
        float disc = 1.0 - smoothstep(1.0 - 1.5 / R, 1.0 + 1.5 / R, r);
        float rr = max(r, 1.0);
        vec3 col = uColor * (0.45 * exp(-(rr - 1.0) * 6.0) + 0.07 * exp(-(rr - 1.0) * 1.8)) * (1.0 - disc) * (1.0 - uGlare * 0.6) * uGlow;
        vec2 q = p - uPlanet.xy;
        float pr = max(uPlanet.z, 0.01);
        float inP = 1.0 - smoothstep(1.0 - 1.2 / pr, 1.0 + 1.2 / pr, length(q) / pr);
        col *= 1.0 - inP * uFront;
        float hs = 18.0 + 60.0 * uHalo;
        float halo = 1.0 / pow(1.0 + (rpx / hs) * (rpx / hs), 1.4);
        float core = exp(-rpx * rpx / (2.0 * 9.0));
        vec2 ad = abs(d);
        float spikeW = 1.6;
        float spikes = exp(-ad.y / spikeW) * exp(-ad.x / 150.0) + exp(-ad.x / spikeW) * exp(-ad.y / 150.0);
        spikes *= smoothstep(0.0, 18.0, rpx);
        vec3 glareCol = mix(uColor, vec3(1.0), 0.35);
        col += glareCol * uGlare * (1.1 * halo + 6.0 * core + 0.5 * spikes);
        gl_FragColor = vec4(pow(1.0 - exp(-col * uExposure), vec3(0.5)), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
  });
}

/** Faint background stars at infinity: keep the object at the camera's position, so only turning the
 * camera moves them. */
export function starField(n: number, seed: number, gain = 1) {
  const r = rng(seed);
  const pos = new Float32Array(3 * n);
  const size = new Float32Array(n);
  const col = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const z = 2 * r() - 1;
    const ph = 2 * Math.PI * r();
    const s = Math.sqrt(1 - z * z);
    pos.set([1000 * s * Math.cos(ph), 1000 * z, 1000 * s * Math.sin(ph)], 3 * i);
    // a steep brightness distribution: a few bright stars, many faint ones
    const b = Math.pow(r(), 6);
    size[i] = 1.6 + 2.6 * b;
    const warm = r();
    const a = (0.16 + 0.75 * b) * gain;
    col.set([a, a * (0.86 + 0.1 * warm), a * (0.74 + 0.26 * (1 - warm))], 3 * i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: {uGain: {value: 1}},
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aCol;
      varying vec3 vCol;
      void main() {
        vCol = aCol;
        gl_PointSize = aSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(vCol * a * uGain, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

/** A circular orbit of radius a in the x-z plane, as a crisp line of constant width in pixels. */
export function orbitLine(a: number, color: string, widthPx: number) {
  const n = 256;
  const p: number[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (2 * Math.PI * i) / n;
    p.push(a * Math.sin(th), 0, a * Math.cos(th));
  }
  const g = new LineGeometry();
  g.setPositions(p);
  const m = new LineMaterial({color: new THREE.Color(color), linewidth: widthPx, transparent: true, opacity: 1, depthWrite: false});
  m.resolution.set(W, H);
  const line = new Line2(g, m);
  line.computeLineDistances();
  line.renderOrder = 5;
  return line;
}

/** A camera on a sphere around the origin, looking at it: distance, vertical field of view (degrees), elevation
 * above the x-z plane and azimuth (radians), with image shifts (px) that move the origin up (offY) or left (offX)
 * of centre. */
export type Rig = {d: number; fov: number; el: number; az: number; offY: number; offX?: number};

export function rigCamera(r: Rig): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(r.fov, W / H, 0.02, 6000);
  const ce = Math.cos(r.el);
  cam.position.set(r.d * ce * Math.sin(r.az), r.d * Math.sin(r.el), r.d * ce * Math.cos(r.az));
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.setViewOffset(W, H, r.offX ?? 0, r.offY, W, H);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

const tmp = new THREE.Vector3();

/** Screen position (px) of a point, and its distance from the camera. */
export function project(cam: THREE.PerspectiveCamera, p: V3): {x: number; y: number; dist: number} {
  tmp.set(...p).project(cam);
  return {x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, dist: cam.position.distanceTo(new THREE.Vector3(...p))};
}

/** Radius (px) on screen of a sphere of radius r whose centre is `dist` from the camera. */
export function screenRadius(cam: THREE.PerspectiveCamera, r: number, dist: number) {
  const f = H / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  return (f * r) / Math.sqrt(Math.max(dist * dist - r * r, 1e-9));
}
