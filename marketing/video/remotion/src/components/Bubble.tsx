import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Level, UI_FONT } from "../theme";

export type BubbleKind = "question" | "permission" | "done" | "idle";

export type BubbleProps = {
  kind: BubbleKind;
  title: string;
  project?: string;
  message: string;
  options?: string[];
  hint: string;
  level?: Level;
  /** Frame at which the bubble popped in (0.22s pop). */
  appearFrame?: number;
  /** Frame at which a one-shot 0.5s shake starts (level 2 entry). */
  shakeFrame?: number;
  /** Tail position: level 0 sits in the corner (right), levels 1+ are centered. */
  tail?: "right" | "left" | "center";
  showSnooze?: boolean;
  showMore?: "Show more" | "Show less" | null;
  /** Clamp the message (fade at the bottom), as the extension does for long messages. */
  clamped?: boolean;
  /** Progress 0..1 of the auto-dismiss timer bar, or null for none. */
  timer?: number | null;
  width?: number;
  /** Highlight the primary button as if hovered/pressed. */
  pressed?: boolean;
  style?: React.CSSProperties;
};

const DOT: Record<BubbleKind, string> = {
  question: C.BODY,
  permission: "#d9a400",
  done: "#2e8b57",
  idle: "#888",
};

export const Bubble: React.FC<BubbleProps> = ({
  kind,
  title,
  project,
  message,
  options = [],
  hint,
  level = 0,
  appearFrame = 0,
  shakeFrame,
  tail = "right",
  showSnooze,
  showMore = null,
  clamped,
  timer = null,
  width = 340,
  pressed,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const red = level >= 2;

  const pop = spring({ frame: frame - appearFrame, fps, config: { damping: 12, stiffness: 220, mass: 0.6 }, durationInFrames: 10 });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const opacity = interpolate(frame - appearFrame, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let shakeX = 0;
  if (shakeFrame !== undefined) {
    const s = (frame - shakeFrame) / fps / 0.5;
    if (s >= 0 && s <= 1) {
      shakeX = interpolate(s, [0, 0.2, 0.4, 0.6, 0.8, 1], [0, -7, 7, -7, 7, 0]);
    }
  }
  const wiggle = level === 3 ? 1.5 * Math.sin(2 * Math.PI * ((frame / fps) / 1.2)) : 0;

  const border = red ? C.RED : C.TEXT;
  const origin = tail === "center" ? "bottom center" : tail === "left" ? "bottom left" : "bottom right";
  const tailPos: React.CSSProperties =
    tail === "center" ? { left: "50%", marginLeft: -10 } : tail === "left" ? { left: 34 } : { right: 34 };
  const tailInnerPos: React.CSSProperties =
    tail === "center" ? { left: "50%", marginLeft: -8 } : tail === "left" ? { left: 35 } : { right: 35 };

  return (
    <div
      style={{
        position: "relative",
        width,
        fontFamily: UI_FONT,
        fontSize: 14,
        lineHeight: 1.45,
        color: C.TEXT,
        background: C.CREAM,
        border: `2px solid ${border}`,
        borderRadius: 14,
        boxShadow: `4px 4px 0 ${border}`,
        padding: "12px 14px 10px",
        transformOrigin: origin,
        transform: `translateX(${shakeX}px) rotate(${wiggle}deg) scale(${scale})`,
        opacity,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {/* tail */}
      <div
        style={{
          position: "absolute",
          bottom: -12,
          ...tailPos,
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: tail === "center" ? "12px 10px 0 10px" : tail === "left" ? "12px 0 0 10px" : "12px 10px 0 0",
          borderColor: `${border} transparent`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -8,
          ...tailInnerPos,
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: tail === "center" ? "9px 8px 0 8px" : tail === "left" ? "9px 0 0 8px" : "9px 8px 0 0",
          borderColor: `${C.CREAM} transparent`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[kind], flex: "none" }} />
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: ".01em" }}>{title}</span>
        {project ? (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 999,
              background: C.PAPER,
              color: "#5a4a3a",
              whiteSpace: "nowrap",
            }}
          >
            {project}
          </span>
        ) : null}
      </div>
      <div style={{ position: "relative", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: clamped ? "9.5em" : undefined, overflow: "hidden" }}>
        {message}
        {clamped ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "2em", background: `linear-gradient(transparent, ${C.CREAM})` }} />
        ) : null}
      </div>
      {options.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {options.map((o) => (
            <span key={o} style={{ fontSize: 12, padding: "3px 9px", border: `1.5px solid ${C.TEXT}`, borderRadius: 999, background: C.PILL }}>
              {o}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 11, color: red ? C.RED : C.MUTED, fontWeight: red ? 600 : 400, flex: 1, minWidth: 0 }}>{hint}</span>
        {showMore ? (
          <span style={{ fontSize: 12, fontWeight: 500, textDecoration: "underline", color: "#5a4a3a", whiteSpace: "nowrap" }}>{showMore}</span>
        ) : null}
        {showSnooze ? (
          <span style={{ fontSize: 12, fontWeight: 600, border: `1.5px solid ${C.TEXT}`, borderRadius: 8, padding: "4px 10px", background: "#fff", whiteSpace: "nowrap" }}>
            Snooze 5m
          </span>
        ) : null}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            border: `1.5px solid ${C.TEXT}`,
            borderRadius: 8,
            padding: "4px 10px",
            background: pressed ? C.DARK : C.BODY,
            color: "#fff",
            whiteSpace: "nowrap",
            transform: pressed ? "translate(1px,1px)" : undefined,
          }}
        >
          Got it
        </span>
      </div>
      {timer !== null ? (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 4, height: 3, borderRadius: 2, background: "#eadfd2", overflow: "hidden" }}>
          <div style={{ height: "100%", background: C.BODY, width: `${Math.max(0, Math.min(1, timer)) * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
};
