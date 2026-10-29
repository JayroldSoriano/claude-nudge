import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, Level } from "../theme";
import { GRID, PX, Pt } from "../mascotPixels";

const Rects: React.FC<{ pts: Pt[]; fill: string }> = ({ pts, fill }) => (
  <>
    {pts.map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
    ))}
  </>
);

const cyc = (t: number, period: number) => ((t % period) + period) % period / period;
const cosWave = (t: number, period: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / period));

export type MascotProps = {
  /** Width in px. Height follows the 14:13 grid. */
  size: number;
  level: Level;
  waving?: boolean;
  /** Frame at which this mascot "started"; animations are phase-locked to it. */
  startFrame?: number;
  style?: React.CSSProperties;
};

/**
 * Nudge, the pixel mascot. Everything is a function of time, mirroring the CSS keyframes in
 * extension/content.js: bob, blink, wave, glow, squint/brows/frown at level 2+, foot tapping,
 * fume and hop at level 3. Roaming (horizontal) is the scene's job.
 */
export const Mascot: React.FC<MascotProps> = ({ size, level, waving = true, startFrame = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.max(0, frame - startFrame) / fps;
  const angry = level >= 2;

  const bob = -0.35 * cosWave(t, 1.2);
  const blinkPhase = cyc(t, 4);
  const blink = !angry && blinkPhase > 0.92 && blinkPhase < 0.98 ? 0.15 : 1;
  const eyeScaleY = angry ? 0.5 : blink;

  const wavePeriod = level === 3 ? 0.2 : level === 1 ? 0.3 : 0.5;
  const armOut = waving && cyc(t, wavePeriod) >= 0.5;

  let bulbFill: string = C.BULB;
  let bulbOpacity = 0.55 + 0.45 * cosWave(t, 2);
  if (level === 1) bulbFill = C.BULB_L1;
  if (level === 2) {
    bulbFill = C.BULB_L2;
    bulbOpacity = cyc(t, 0.5) < 0.5 ? 1 : 0.15;
  }
  if (level === 3) {
    bulbFill = C.BULB_L2;
    bulbOpacity = cyc(t, 0.2) < 0.5 ? 1 : 0.15;
  }

  const tapL = level === 2 ? (cyc(t, 0.4) < 0.5 ? -0.17 : 0) : level === 3 ? (cyc(t, 0.25) < 0.5 ? -0.17 : 0) : 0;
  const tapR = level === 3 ? (cyc(t - 0.125, 0.25) < 0.5 ? -0.17 : 0) : 0;
  const fume = level === 3 ? 0.05 * Math.sin(2 * Math.PI * (t / 0.3)) : 0;

  // hop: 0%:0 30%:-26px 45%:0 60%:-10px 70%:0 (1s), in px at the extension's 84px base width, scaled to `size`.
  let hop = 0;
  if (level === 3) {
    const p = cyc(t, 1);
    const k = size / 84;
    if (p < 0.3) hop = -26 * Math.sin((p / 0.3) * Math.PI * 0.5);
    else if (p < 0.45) hop = -26 * Math.cos(((p - 0.3) / 0.15) * Math.PI * 0.5);
    else if (p < 0.6) hop = -10 * Math.sin(((p - 0.45) / 0.15) * Math.PI * 0.5);
    else if (p < 0.7) hop = -10 * Math.cos(((p - 0.6) / 0.1) * Math.PI * 0.5);
    hop *= k;
  }

  const height = (size / GRID.w) * GRID.h;
  return (
    <div style={{ width: size, height, transform: `translateY(${hop}px)`, ...style }}>
      <svg
        viewBox={`0 0 ${GRID.w} ${GRID.h}`}
        width={size}
        height={height}
        shapeRendering="crispEdges"
        style={{ display: "block", overflow: "visible" }}
      >
        <g transform={`translate(${fume} ${bob})`}>
          <Rects pts={PX.stalk} fill={C.DARK} />
          <g opacity={bulbOpacity}>
            <Rects pts={PX.bulb} fill={bulbFill} />
          </g>
          <Rects pts={PX.body} fill={C.BODY} />
          <Rects pts={PX.base} fill={C.DARK} />
          <Rects pts={PX.armLeft} fill={C.BODY} />
          <g transform={`translate(0 7) scale(1 ${eyeScaleY}) translate(0 -7)`}>
            <Rects pts={PX.eyes} fill={C.INK} />
            <Rects pts={PX.glint} fill={C.GLINT} />
          </g>
          {angry ? (
            <>
              <Rects pts={PX.browL} fill={C.INK} />
              <Rects pts={PX.browR} fill={C.INK} />
              <Rects pts={PX.frown} fill={C.INK} />
            </>
          ) : (
            <Rects pts={PX.smile} fill={C.INK} />
          )}
        </g>
        <g transform={`translate(0 ${tapL})`}>
          <Rects pts={PX.footL} fill={C.DARK} />
        </g>
        <g transform={`translate(0 ${tapR})`}>
          <Rects pts={PX.footR} fill={C.DARK} />
        </g>
        <Rects pts={armOut ? PX.armOut : PX.armUp} fill={C.BODY} />
      </svg>
    </div>
  );
};
