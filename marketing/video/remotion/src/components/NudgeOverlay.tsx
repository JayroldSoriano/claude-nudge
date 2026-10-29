import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Bubble, BubbleProps } from "./Bubble";
import { Mascot } from "./Mascot";
import { HINTS, Level } from "../theme";

export type LevelChange = { level: Level; frame: number };

export type NudgeOverlayProps = {
  /** Width/height of the viewport the overlay lives in (CSS px before any scaling). */
  viewport: { w: number; h: number };
  /** Frame the nudge appears. */
  appearFrame: number;
  /** Frame the nudge is dismissed (leaves), or undefined. */
  dismissFrame?: number;
  /** Level schedule, ascending by frame. */
  levels: LevelChange[];
  bubble: Omit<BubbleProps, "hint" | "level" | "appearFrame" | "tail" | "showSnooze" | "shakeFrame">;
  /** Override the hint (otherwise HINTS[level]). */
  hint?: string;
  /** Scale of the whole overlay (the extension draws at 1x CSS px). */
  ui?: number;
  pressedFrame?: number;
  /** Roaming stops here (the user reached for the bubble). */
  freezeFrame?: number;
  /** A pointer flies in and presses "Got it": arrives over [arriveFrame, pressFrame]. */
  cursor?: { arriveFrame: number; pressFrame: number };
};

const Pointer: React.FC<{ ui: number; progress: number; pressed: boolean }> = ({ ui, progress, pressed }) => {
  // "Got it" sits ~44px from the bubble's right edge and ~230px above the overlay's bottom (extension CSS px).
  const dx = (1 - progress) * 520;
  const dy = (1 - progress) * -380;
  return (
    <div style={{ position: "absolute", right: 44 * ui - 6, bottom: 230 * ui - 14, transform: `translate(${dx}px, ${dy}px) scale(${pressed ? 0.9 : 1})`, zIndex: 5 }}>
      <svg width={30 * ui} height={30 * ui} viewBox="0 0 24 24" style={{ filter: "drop-shadow(1px 2px 2px rgba(0,0,0,.35))" }}>
        <path d="M5 3 L19 12 L12 13.5 L15.5 20.5 L13 21.5 L9.5 14.5 L5 18 Z" fill="#fff" stroke="#111" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/**
 * Positions the bubble over the mascot the way the content script does: corner at level 0,
 * bottom-center from level 1 (0.9s ease), scale 1.25 / 1.8, roam along the bottom at level 3.
 */
export const NudgeOverlay: React.FC<NudgeOverlayProps> = ({ viewport, appearFrame, dismissFrame, levels, bubble, hint, ui = 1, pressedFrame, freezeFrame, cursor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < appearFrame) return null;

  let level: Level = 0;
  let levelStart = appearFrame;
  for (const l of levels) {
    if (frame >= l.frame) {
      level = l.level;
      levelStart = l.frame;
    }
  }
  const l1 = levels.find((l) => l.level >= 1);
  const l2 = levels.find((l) => l.level === 2);
  const l3 = levels.find((l) => l.level === 3);

  // leaving: rise animation reversed over 0.3s
  let leave = 0;
  if (dismissFrame !== undefined) {
    if (frame >= dismissFrame + 0.3 * fps) return null;
    leave = interpolate(frame, [dismissFrame, dismissFrame + 0.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }

  const margin = 22;
  const bubbleW = (bubble.width ?? 340) * ui;
  // horizontal translate from corner to center (0.9s ease), as in place()
  const toCenter = viewport.w / 2 - margin - bubbleW / 2;
  const centerT = l1 ? interpolate(frame, [l1.frame, l1.frame + 0.9 * fps], [0, 1], { easing: Easing.bezier(0.4, 0, 0.2, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  let tx = -toCenter * centerT;
  // roam at level 3: 9s loop, 0 -> -(toCenter-10) at 45..55% -> 0
  if (level === 3 && l3) {
    const f = freezeFrame !== undefined ? Math.min(frame, freezeFrame) : frame;
    const p = (((f - l3.frame) / fps) % 9) / 9;
    const r = interpolate(p, [0, 0.45, 0.55, 1], [0, 1, 1, 0], { easing: Easing.inOut(Easing.ease) });
    tx += -(toCenter - 10) * r; // from center on toward the far (left) edge and back
  }

  const scaleTarget = level >= 2 ? 1.8 : level === 1 ? 1.25 : 1;
  const scalePrev = level >= 2 ? (l2 && frame >= l2.frame ? 1.25 : 1) : 1;
  const scale = interpolate(frame, [levelStart, levelStart + 0.6 * fps], [scalePrev, scaleTarget], { easing: Easing.bezier(0.2, 1.2, 0.4, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const marginTop = level >= 3 ? 100 : level === 2 ? 56 : level === 1 ? 16 : 0;

  const rise = interpolate(frame - appearFrame, [0, 0.35 * fps], [40, 0], { easing: Easing.bezier(0.2, 1.2, 0.4, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const riseOpacity = interpolate(frame - appearFrame, [0, 0.35 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const base = 84 * ui;
  const pressed = pressedFrame !== undefined && frame >= pressedFrame;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 18 * ui,
        right: margin,
        transform: `translateX(${tx}px) translateY(${leave * 40}px)`,
        opacity: 1 - leave,
        display: "flex",
        flexDirection: "column",
        alignItems: level >= 1 ? "center" : "flex-end",
        gap: 10 * ui,
      }}
    >
      <div style={{ transform: `scale(${ui})`, transformOrigin: level >= 1 ? "bottom center" : "bottom right" }}>
        <Bubble
          {...bubble}
          level={level}
          hint={hint ?? HINTS[level]}
          appearFrame={appearFrame}
          tail={level >= 1 ? "center" : "right"}
          showSnooze={level >= 1}
          shakeFrame={l2?.frame}
          pressed={pressed}
          width={level >= 2 ? Math.max(bubble.width ?? 340, 320) : bubble.width}
        />
      </div>
      <div style={{ marginTop: marginTop * ui, transform: `scale(${scale}) translateY(${rise}px)`, transformOrigin: "bottom center", opacity: riseOpacity }}>
        <Mascot size={base} level={level} startFrame={appearFrame} />
      </div>
      {cursor && frame >= cursor.arriveFrame - 1 ? (
        <Pointer
          ui={ui}
          progress={interpolate(frame, [cursor.arriveFrame, cursor.pressFrame], [0, 1], { easing: Easing.bezier(0.3, 0.7, 0.2, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          pressed={frame >= cursor.pressFrame}
        />
      ) : null}
    </div>
  );
};
