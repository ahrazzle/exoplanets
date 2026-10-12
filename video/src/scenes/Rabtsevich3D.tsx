import React, {useLayoutEffect, useRef} from 'react';
import * as THREE from 'three';
import {fullscreenTriangle, makeRenderer} from '../lib/gl';
import {LC} from '../lib/data';
import {Rig, V3, glareMaterial, orbitLine, planetMaterial, project, rigCamera, screenRadius, starField, starMaterial} from '../lib/space3d';
import {T} from './times';
import {C, H, MONO, SANS, W} from '../theme';
import {ease, inOutCubic, lerp, outCubic, seg, vis} from '../lib/time';

// Rabtsevich's star, TIC 4206066, in 3D. The camera arrives from the sky map along our line of sight, so the
// two possible planets' orbits are seen edge-on, as they must be for their planets to cross the star; then it
// rises above the orbits and circles slowly. Orbits at the real ratio of sizes (Kepler's third law for periods
// of 3.18 and 11.13 days), the planets going round at the real ratio of speeds, a day of their time passing in
// 0.55 s of ours. Sizes are not to scale.

const SEC_PER_DAY = 0.55;
const A1 = 4;                 // inner orbit, in star radii
const STAR_Y = 504;           // where the map holds his star
const STAR_X = 820;           // and where the star settles, leaving room for the legend
const K_DWARF: V3 = [1.0, 0.4, 0.12];
const K_CORE: V3 = [1.0, 0.78, 0.5];

const land = () => T.inspired + 2.4;

function rigAt(t: number): Rig {
  const fly = ease(t, T.inspired + 1.0, T.inspired + 2.7, inOutCubic);
  const d = Math.exp(lerp(Math.log(2600), Math.log(34), fly)) * (1 - 0.06 * seg(t, T.inspired + 2.7, T.weTook));
  return {
    d,
    fov: 35,
    el: lerp(0.025, 0.3, ease(t, T.twoPossible + 0.4, T.twoPossible + 2.6, inOutCubic)),
    az: 0.6 + 0.07 * (t - T.inspired),
    offY: H / 2 - STAR_Y,
    offX: (W / 2 - STAR_X) * ease(t, T.twoPossible - 0.6, T.twoPossible + 1.0, inOutCubic),
  };
}

type Planet = {P: number; a: number; r: number; ph0: number; col: string; lab: string};

function planetsOf(lc: LC): Planet[] {
  const [b, c] = lc.rabtsevich.planets;
  // the 3.18-day planet is gold, as its crossings are in the next scene
  return [
    {P: b.P, a: A1, r: 0.36, ph0: 0.6, col: C.gold, lab: `every ${b.P.toFixed(2)} days`},
    {P: c.P, a: A1 * Math.pow(c.P / b.P, 2 / 3), r: 0.46, ph0: 2.4, col: '#8FB8FF', lab: `every ${c.P.toFixed(2)} days`},
  ];
}

const angle = (p: Planet, t: number) => p.ph0 + (2 * Math.PI * (t - T.twoPossible)) / (p.P * SEC_PER_DAY);
const onOrbit = (p: Planet, t: number): V3 => [p.a * Math.sin(angle(p, t)), 0, p.a * Math.cos(angle(p, t))];

type World = {
  r: THREE.WebGLRenderer;
  scene: THREE.Scene;
  overlay: THREE.Scene;
  sky: THREE.Points;
  star: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  planets: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>[];
  orbits: ReturnType<typeof orbitLine>[];
  glare: THREE.ShaderMaterial;
  flat: THREE.Camera;
};

function makeWorld(canvas: HTMLCanvasElement, ps: Planet[]): World {
  const r = makeRenderer(canvas, W, H);
  const scene = new THREE.Scene();
  const sky = starField(2600, 41, 1.0);
  scene.add(sky);
  const starMat = starMaterial();
  (starMat.uniforms.uColor.value as THREE.Vector3).set(...K_DWARF);
  (starMat.uniforms.uCore.value as THREE.Vector3).set(...K_CORE);
  const star = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), starMat);
  scene.add(star);
  const looks: [V3, V3, V3][] = [
    [[0.72, 0.52, 0.24], [0.95, 0.76, 0.44], [1.0, 0.82, 0.55]],
    [[0.26, 0.42, 0.8], [0.45, 0.65, 0.98], [0.55, 0.72, 1.0]],
  ];
  const planets = ps.map((p, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMaterial(...looks[i]));
    m.material.uniforms.uFill.value = 1;
    m.scale.setScalar(p.r);
    m.rotation.z = 0.2 - 0.35 * i;
    scene.add(m);
    return m;
  });
  const orbits = ps.map((p) => {
    const o = orbitLine(p.a, p.col, 2);
    scene.add(o);
    return o;
  });
  const glare = glareMaterial();
  glare.uniforms.uDpr.value = r.getPixelRatio();
  (glare.uniforms.uColor.value as THREE.Vector3).set(...K_DWARF);
  const overlay = new THREE.Scene();
  const tri = new THREE.Mesh(fullscreenTriangle(), glare);
  tri.frustumCulled = false;
  overlay.add(tri);
  return {r, scene, overlay, sky, star, planets, orbits, glare, flat: new THREE.Camera()};
}

export const Rabtsevich3D: React.FC<{t: number; lc: LC}> = ({t, lc}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const ps = planetsOf(lc);
  useLayoutEffect(() => {
    world.current = makeWorld(canvas.current!, planetsOf(lc));
    return () => {
      world.current?.r.dispose();
      world.current = null;
    };
  }, [lc]);

  const rig = rigAt(t);
  const cam = rigCamera(rig);
  const st = project(cam, [0, 0, 0]);
  const sr = screenRadius(cam, 1, st.dist);
  const grow = outCubic(seg(t, T.twoPossible - 0.2, T.twoPossible + 0.9));
  // from far off the star is a point of light, like the map's; as we arrive its glare gives way to its disc
  const glare = 0.75 * (1 - ease(t, T.inspired + 1.7, T.inspired + 2.6, inOutCubic));
  const opacity = seg(t, T.inspired + 1.0, T.inspired + 1.5) * (1 - seg(t, T.weTook - 0.4, T.weTook + 0.1));
  const skyGain = seg(t, T.twoPossible - 0.3, T.twoPossible + 1.0);

  useLayoutEffect(() => {
    const g = world.current;
    if (!g) return;
    g.sky.position.copy(cam.position);
    (g.sky.material as THREE.ShaderMaterial).uniforms.uGain.value = skyGain;
    g.star.material.uniforms.uTime.value = t;
    ps.forEach((p, i) => {
      const m = g.planets[i];
      m.position.set(...onOrbit(p, t));
      m.scale.setScalar(Math.max(p.r * grow, 1e-5));
      m.visible = grow > 0.001;
      m.rotation.y = t * 0.4;
      g.orbits[i].material.opacity = 0.6 * grow;
      g.orbits[i].visible = grow > 0.001;
    });
    const gu = g.glare.uniforms;
    (gu.uStar.value as THREE.Vector3).set(st.x, st.y, sr);
    gu.uGlare.value = glare;
    gu.uHalo.value = 0.3;
    // the limb glow is hidden behind a planet crossing in front of the star
    const front = ps.map((p, i) => ({p: project(cam, onOrbit(p, t)), r: p.r * grow, i})).sort((x, y) => x.p.dist - y.p.dist)[0];
    (gu.uPlanet.value as THREE.Vector3).set(front.p.x, front.p.y, screenRadius(cam, Math.max(front.r, 1e-4), front.p.dist));
    gu.uFront.value = front.p.dist < st.dist ? 1 : 0;
    g.r.clear();
    g.r.render(g.scene, cam);
    g.r.render(g.overlay, g.flat);
  });

  const credit = vis(t, T.pavel - 0.2, T.weTook - 0.1, 0.5, 0.5);
  const ret = vis(t, land() - 0.2, T.twoPossible + 0.2, 0.5, 0.4);
  const retS = 1 + 0.6 * (1 - outCubic(seg(t, land() - 0.2, land() + 0.5)));
  const label = vis(t, land() + 0.2, T.weTook, 0.5, 0.4);
  const newest = outCubic(seg(t, T.newest + 0.2, T.newest + 0.8));
  const legend = (i: number) => outCubic(seg(t, T.twoPossible + 0.6 + 0.4 * i, T.twoPossible + 1.1 + 0.4 * i));
  const LX = 1430;
  return (
    // Opacity goes on each element, never on a wrapper: a translucent wrapper isolates the canvas, so its black
    // background covers the sky map instead of screening onto it.
    <div style={{position: 'absolute', inset: 0, width: W, height: H}}>
      <canvas ref={canvas} width={W} height={H} style={{position: 'absolute', inset: 0, width: W, height: H, mixBlendMode: 'screen', opacity}} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity}}>
        <g opacity={ret}>
          <circle cx={st.x} cy={st.y} r={30 * retS} fill="none" stroke={C.gold} strokeWidth={2} />
          {[0, 1, 2, 3].map((k) => {
            const a = (k * Math.PI) / 2;
            return <line key={k} x1={st.x + 40 * retS * Math.sin(a)} y1={st.y - 40 * retS * Math.cos(a)}
              x2={st.x + 54 * retS * Math.sin(a)} y2={st.y - 54 * retS * Math.cos(a)} stroke={C.gold} strokeWidth={2} />;
          })}
        </g>
        <g fontFamily={SANS}>
          <text x={LX} y={STAR_Y - 58} fill={C.text} fontSize={34} opacity={legend(0)}>two possible planets</text>
          {ps.map((p, i) => (
            <g key={p.P} opacity={legend(i)}>
              <circle cx={LX + 12} cy={STAR_Y - 6 + i * 46} r={9} fill={p.col} />
              <text x={LX + 34} y={STAR_Y + 4 + i * 46} fill={p.col} fontSize={31} fontFamily={MONO}>orbits {p.lab}</text>
            </g>
          ))}
        </g>
        {/* the star's name sits under it while it is a point, then moves with it to the left */}
        <g opacity={label} fontFamily={SANS} textAnchor="middle">
          <text x={st.x} y={STAR_Y + 262} fill={C.text} fontSize={42} fontFamily={MONO} fontWeight={500}>TIC 4206066</text>
          <text x={st.x} y={STAR_Y + 308} fill={C.text2} fontSize={30}>an orange dwarf, 116 light-years away</text>
          <text x={st.x} y={STAR_Y + 352} fill={C.cyan} fontSize={28} opacity={newest}>found in TESS data from late 2025</text>
        </g>
      </svg>
      <div style={{position: 'absolute', left: 104, top: 74, opacity: credit * opacity}}>
        <div style={{fontFamily: SANS, fontSize: 26, letterSpacing: 2, color: C.gold, textTransform: 'uppercase'}}>Inspired by</div>
        <div style={{fontFamily: SANS, fontSize: 54, fontWeight: 600, color: C.text, marginTop: 6}}>Pavel Rabtsevich</div>
        <div style={{fontFamily: SANS, fontSize: 30, color: C.text2, marginTop: 6}}>independent researcher</div>
        <div style={{fontFamily: MONO, fontSize: 24, color: C.text2, marginTop: 10}}>doi:10.5281/zenodo.22967456</div>
      </div>
    </div>
  );
};

export const rabtsevich3DVisible = (t: number) => t > T.inspired + 1.0 && t < T.weTook + 0.2;
