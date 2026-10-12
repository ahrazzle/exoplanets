import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import {Backdrop, CaptionScrim} from './components/Backdrop';
import {Captions} from './components/Captions';
import {LC, Pixels, Points, Tess, useJson, useSky} from './lib/data';
import {ease, useT} from './lib/time';
import {Close, QuestionMarks, closeVisible, questionVisible} from './scenes/Close';
import {Funnel, funnelVisible} from './scenes/Funnel';
import {Method, methodVisible} from './scenes/Method';
import {Opening} from './scenes/Opening';
import {Field3D, field3DVisible} from './scenes/Field3D';
import {PrimerOverlay, primerVisible, starAt} from './scenes/Primer';
import {Rabtsevich3D, rabtsevich3DVisible} from './scenes/Rabtsevich3D';
import {Result, chartLayout, resultVisible} from './scenes/Result';
import {Lab} from './lab';
import {SkyGL} from './scenes/SkyGL';
import {StarGL} from './scenes/StarGL';
import {TessSweep, SWEEP_START} from './scenes/TessSweep';
import {Flip, Known, flipVisible, knownVisible} from './scenes/Validation';
import {setChartLayout, skyAt} from './scenes/skyDirector';
import {T} from './scenes/times';

/** `lab` switches on experiments, for side-by-side review. */
export const Film: React.FC<{muted?: boolean; lab?: Lab}> = ({muted, lab = {}}) => {
  const t = useT();
  const sky = useSky();
  const points = useJson<Points>('points.json');
  const tess = useJson<Tess>('tess.json');
  const lc = useJson<LC>('lc.json');
  const px = useJson<Pixels>('pixels_127236638_s44.json');
  const cands = points?.candidates ?? null;
  useMemo(() => cands && setChartLayout(chartLayout(cands)), [cands]);
  const s = skyAt(t);
  return (
    <AbsoluteFill style={{backgroundColor: '#070B14', overflow: 'hidden'}}>
      {!muted && <Audio src={staticFile('audio/mix.m4a')} />}
      {/* no CSS transforms on this group: headless Chrome sometimes composites SVG text without them, which made labels jump between frames */}
      <div style={{position: 'absolute', inset: 0}}>
      <Backdrop t={t} />
      {sky && cands && s.opacity > 0.001 && <SkyGL sky={sky} cands={cands} state={s} />}
      {t < T.primer + 0.5 && <Opening t={t} />}
      {primerVisible(t) && <StarGL s={starAt(t)} />}
      {primerVisible(t) && <PrimerOverlay t={t} />}
      {field3DVisible(t) && <Field3D t={t} />}
      {tess && t > SWEEP_START() - 0.5 && t < T.weTook + 0.6 && (
        <TessSweep t={t} tess={tess} view={s.view} fade={s.opacity * (1 - ease(t, T.inspired, T.inspired + 0.8))}
          highlight98={ease(t, T.doingEnd - 0.4, T.doingEnd + 0.4) * (1 - ease(t, T.inspired + 2.0, T.inspired + 3.0))} />
      )}
      {lc && rabtsevich3DVisible(t) && <Rabtsevich3D t={t} lc={lc} />}
      {lc && methodVisible(t) && <Method t={t} lc={lc} />}
      {lc && px && funnelVisible(t) && <Funnel t={t} lc={lc} px={px} />}
      {lc && knownVisible(t) && <Known t={t} lc={lc} view={s.view} />}
      {lc && flipVisible(t) && <Flip t={t} lc={lc} />}
      {cands && resultVisible(t) && <Result t={t} cands={cands} />}
      {cands && questionVisible(t) && <QuestionMarks t={t} cands={cands} view={s.view} />}
      {closeVisible(t) && <Close t={t} />}
      </div>
      <CaptionScrim />
      <Captions t={t} />
    </AbsoluteFill>
  );
};
