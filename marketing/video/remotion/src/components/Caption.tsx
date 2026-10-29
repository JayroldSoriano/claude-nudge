import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, UI_FONT } from "../theme";

export const Caption: React.FC<{
  text: string;
  from: number;
  to?: number;
  size?: number;
  position?: "top" | "bottom";
  tone?: "ink" | "red" | "body";
  offset?: number;
}> = ({ text, from, to, size = 64, position = "top", tone = "ink", offset = 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || (to !== undefined && frame >= to)) return null;
  const s = spring({ frame: frame - from, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 12 });
  const y = interpolate(s, [0, 1], [24, 0]);
  const bg = tone === "red" ? C.RED : tone === "body" ? C.BODY : C.TEXT;
  const fg = tone === "body" ? C.TEXT : "#fff";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [position]: offset,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${y}px)`,
        opacity: s,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: UI_FONT,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: fg,
          background: bg,
          padding: `${size * 0.25}px ${size * 0.5}px`,
          borderRadius: size * 0.3,
          boxShadow: `${size * 0.12}px ${size * 0.12}px 0 ${tone === "body" ? C.TEXT : C.BODY}`,
          maxWidth: "88%",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
};
