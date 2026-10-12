import * as THREE from 'three';

/** A WebGL renderer bound to a canvas, sized to the composition, kept for the life of the component. */
export function makeRenderer(canvas: HTMLCanvasElement, w: number, h: number) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  renderer.setSize(w, h, false);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  return renderer;
}

export const fullscreenTriangle = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
};

export const GLSL_COMMON = /* glsl */ `
#define PI 3.141592653589793
#define SQRT2 1.4142135623730951
vec2 mollweide(float lam, float phi) {
  float th = phi;
  float target = PI * sin(phi);
  for (int i = 0; i < 10; i++) {
    float f = 2.0 * th + sin(2.0 * th) - target;
    float d = 2.0 + 2.0 * cos(2.0 * th);
    th -= f / max(d, 1e-4);
    th = clamp(th, -PI * 0.5, PI * 0.5);
  }
  return vec2(2.0 * SQRT2 / PI * lam * cos(th), SQRT2 * sin(th));
}
// A stylised stellar colour: real colour order (M orange-red, K amber, G pale yellow, F white), exaggerated
// so the mostly K and M dwarfs read as warm against the navy sky.
vec3 starColor(float teff) {
  vec3 m = vec3(1.0, 0.52, 0.30);
  vec3 k = vec3(1.0, 0.74, 0.46);
  vec3 g = vec3(1.0, 0.90, 0.74);
  vec3 f = vec3(0.86, 0.91, 1.0);
  if (teff < 3900.0) return mix(m, k, smoothstep(3000.0, 3900.0, teff));
  if (teff < 5300.0) return mix(k, g, smoothstep(3900.0, 5300.0, teff));
  return mix(g, f, smoothstep(5300.0, 6500.0, teff));
}
vec3 teffRGB(float teff) {
  float t = clamp(teff, 2600.0, 12000.0) / 100.0;
  float r, g, b;
  if (t <= 66.0) {
    r = 255.0;
    g = 99.4708025861 * log(t) - 161.1195681661;
    b = t <= 19.0 ? 0.0 : 138.5177312231 * log(t - 10.0) - 305.0447927307;
  } else {
    r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    b = 255.0;
  }
  return clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);
}
`;

/** Rotation matrices (row-major arrays for THREE.Matrix3.set). */
export const rotZ = (a: number) => new THREE.Matrix3().set(Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1);
export const rotX = (a: number) => new THREE.Matrix3().set(1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a));
export const rotY = (a: number) => new THREE.Matrix3().set(Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a));
