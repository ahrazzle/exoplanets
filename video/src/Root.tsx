import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {Lab} from './lab';
import {LENGTH} from './lib/time';
import {H, W} from './theme';

const FPS = Number(process.env.REMOTION_FPS ?? 60);

// the film, then the film with each experiment on
const LABS: [string, Lab][] = [];

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={Math.ceil(LENGTH * FPS)} fps={FPS} width={W} height={H} />
    {LABS.map(([id, lab]) => (
      <Composition key={id} id={id} component={Film} defaultProps={{lab}} durationInFrames={Math.ceil(LENGTH * FPS)} fps={FPS} width={W} height={H} />
    ))}
  </>
);
