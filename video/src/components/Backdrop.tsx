import React from 'react';
import {C, H, W} from '../theme';

/** Deep navy space behind every scene, never flat black; a slow drift keeps it from sitting still. */
export const Backdrop: React.FC<{t: number}> = ({t}) => {
  const x = 50 + Math.sin(t * 0.05) * 6;
  const y = 42 + Math.cos(t * 0.04) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: W,
        height: H,
        background: `radial-gradient(ellipse 85% 75% at ${x}% ${y}%, ${C.bg1} 0%, #0A1322 45%, ${C.bg0} 100%)`,
      }}
    />
  );
};

/** A bottom gradient so captions read over bright scenes. */
export const CaptionScrim: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: W,
      height: 220,
      background: 'linear-gradient(to top, rgba(5,8,15,0.72), rgba(5,8,15,0))',
      pointerEvents: 'none',
    }}
  />
);
