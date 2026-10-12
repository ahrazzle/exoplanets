import React, {useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';
import {fullscreenTriangle, makeRenderer} from '../lib/gl';
import {H, W} from '../theme';

/** A star close up: a limb-darkened, granulated disc with a glow, and optionally a planet. When `glare` is
 * high the star is drawn as a telescope sees it: a point with a wide halo and diffraction spikes. */
export type StarState = {
  opacity: number;
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  core: [number, number, number];
  glare: number;
  halo: number;
  exposure: number;
  time: number;
  px: number;
  py: number;
  pr: number;
  pFront: number;
  pLit: number;
  // direction from the planet to the star, in screen axes (x right, y down, z toward the viewer)
  light: [number, number, number];
};

const frag = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uStar;
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uGlare;
uniform float uHalo;
uniform float uExposure;
uniform float uTime;
uniform vec3 uPlanet;
uniform float uFront;
uniform float uLit;
uniform vec3 uLight;

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

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 d = p - uStar.xy;
  float R = max(uStar.z, 0.5);
  float rpx = length(d);
  float r = rpx / R;
  vec3 col = vec3(0.0);

  // photosphere: quadratic limb darkening and slowly boiling granulation
  float disc = 1.0 - smoothstep(1.0 - 1.5 / R, 1.0 + 1.5 / R, r);
  if (r < 1.02) {
    float mu = sqrt(max(1.0 - r * r, 0.0));
    float ld = 1.0 - 0.55 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
    vec3 sp = vec3(d / R, mu);
    float g = fbm(sp * 7.0 + vec3(uTime * 0.07, -uTime * 0.05, uTime * 0.04));
    float g2 = fbm(sp * 19.0 - vec3(uTime * 0.11, uTime * 0.08, 0.0));
    float gran = 0.78 + 0.32 * g + 0.12 * g2;
    // hotter and whiter toward the centre, deeper in colour at the limb
    vec3 tint = mix(uColor, uCore, pow(mu, 0.7));
    col += tint * ld * gran * 2.2 * disc;
  }
  // glow just outside the limb, scaled with the disc
  float rr = max(r, 1.0);
  col += uColor * (0.45 * exp(-(rr - 1.0) * 6.0) + 0.07 * exp(-(rr - 1.0) * 1.8)) * (1.0 - disc) * (1.0 - uGlare * 0.6);

  // the planet, opaque: in front of the star it covers the disc; behind it, the disc covers it, pixel by
  // pixel, so it slides behind the limb instead of vanishing. uLit sets how much of its day side we see.
  vec2 q = p - uPlanet.xy;
  float pr = max(uPlanet.z, 0.01);
  float pd = length(q) / pr;
  float inP = 1.0 - smoothstep(1.0 - 1.2 / pr, 1.0 + 1.2 / pr, pd);
  vec3 n = vec3(q / pr, sqrt(max(1.0 - pd * pd, 0.0)));
  // lit where the surface faces the star: a crescent near transit, full when behind the star
  float lam = clamp(dot(n, uLight), 0.0, 1.0);
  vec3 pc = vec3(0.30, 0.48, 0.85) * (0.04 + 1.1 * lam) + vec3(0.55, 0.7, 1.0) * pow(1.0 - n.z, 3.0) * 0.25 * lam;
  float cover = uFront > 0.5 ? inP : inP * (1.0 - disc);
  col = mix(col, pc * uLit, cover);

  // telescope view: a wide halo and four diffraction spikes, sized in pixels rather than star radii; light
  // scattered in the telescope lies over everything, the planet included
  float hs = 18.0 + 60.0 * uHalo;
  float halo = 1.0 / pow(1.0 + (rpx / hs) * (rpx / hs), 1.4);
  float core = exp(-rpx * rpx / (2.0 * 9.0));
  vec2 ad = abs(d);
  float spikeW = 1.6;
  float spikes = exp(-ad.y / spikeW) * exp(-ad.x / 150.0) + exp(-ad.x / spikeW) * exp(-ad.y / 150.0);
  spikes *= smoothstep(0.0, 18.0, rpx);
  vec3 glareCol = mix(uColor, vec3(1.0), 0.35);
  col += glareCol * uGlare * (1.1 * halo + 6.0 * core + 0.5 * spikes);

  vec3 c = 1.0 - exp(-col * uExposure);
  c = pow(c, vec3(1.0 / 2.0));
  gl_FragColor = vec4(c, 1.0);
}
`;

const vert = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const StarGL: React.FC<{s: StarState}> = ({s}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{r: THREE.WebGLRenderer; scene: THREE.Scene; mat: THREE.ShaderMaterial; cam: THREE.Camera} | null>(null);

  useLayoutEffect(() => {
    const r = makeRenderer(canvas.current!, W, H);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uRes: {value: new THREE.Vector2(W, H)},
        uDpr: {value: r.getPixelRatio()},
        uStar: {value: new THREE.Vector3()},
        uColor: {value: new THREE.Vector3()},
        uCore: {value: new THREE.Vector3()},
        uGlare: {value: 0},
        uHalo: {value: 0},
        uExposure: {value: 1},
        uTime: {value: 0},
        uPlanet: {value: new THREE.Vector3()},
        uFront: {value: 0},
        uLit: {value: 1},
        uLight: {value: new THREE.Vector3(0, 0, 1)},
      },
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(fullscreenTriangle(), mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    gl.current = {r, scene, mat, cam: new THREE.Camera()};
    return () => {
      mat.dispose();
      r.dispose();
      gl.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const g = gl.current;
    if (!g) return;
    const u = g.mat.uniforms;
    (u.uStar.value as THREE.Vector3).set(s.x, s.y, s.r);
    (u.uColor.value as THREE.Vector3).set(...s.color);
    (u.uCore.value as THREE.Vector3).set(...s.core);
    u.uGlare.value = s.glare;
    u.uHalo.value = s.halo;
    u.uExposure.value = s.exposure;
    u.uTime.value = s.time;
    (u.uPlanet.value as THREE.Vector3).set(s.px, s.py, s.pr);
    u.uFront.value = s.pFront;
    u.uLit.value = s.pLit;
    (u.uLight.value as THREE.Vector3).set(...s.light);
    g.r.clear();
    g.r.render(g.scene, g.cam);
  });

  return (
    <canvas
      ref={canvas}
      width={W}
      height={H}
      style={{position: 'absolute', inset: 0, width: W, height: H, mixBlendMode: 'screen', opacity: s.opacity}}
    />
  );
};
