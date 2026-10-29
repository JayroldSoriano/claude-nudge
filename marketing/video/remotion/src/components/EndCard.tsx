import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Mascot } from "./Mascot";
import { C, INSTALL, MONO_FONT, PRODUCT, UI_FONT } from "../theme";

export const EndCard: React.FC<{ from: number; portrait?: boolean; tagline?: string }> = ({ from, portrait, tagline = "Claude is waiting. Nudge makes sure you know." }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (frame < from) return null;
  const s = spring({ frame: frame - from, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: 14 });
  const s2 = spring({ frame: frame - from - 5, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: 14 });
  const k = portrait ? 1 : 1.15;
  const mascot = (portrait ? 300 : 260) * k;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.CREAM, display: "flex", flexDirection: portrait ? "column" : "row", alignItems: "center", justifyContent: "center", gap: portrait ? 50 : 90, fontFamily: UI_FONT, opacity: interpolate(s, [0, 1], [0, 1]) }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})` }}>
        <Mascot size={mascot} level={0} startFrame={from} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: portrait ? "center" : "flex-start", gap: 26 * k, transform: `translateY(${interpolate(s2, [0, 1], [30, 0])}px)`, opacity: s2, maxWidth: portrait ? width - 120 : 900 }}>
        <div style={{ fontSize: 30 * k, fontWeight: 700, color: C.MUTED, letterSpacing: ".04em", textTransform: "uppercase" }}>{PRODUCT}</div>
        <div style={{ fontFamily: MONO_FONT, fontSize: portrait ? 56 : 66, fontWeight: 700, color: "#fff", background: C.TEXT, padding: "22px 36px", borderRadius: 18, boxShadow: `8px 8px 0 ${C.BODY}`, whiteSpace: "nowrap" }}>
          <span style={{ color: C.BODY }}>$ </span>
          {INSTALL}
        </div>
        <div style={{ fontSize: 34 * k, fontWeight: 600, color: C.TEXT, textAlign: portrait ? "center" : "left", lineHeight: 1.25 }}>{tagline}</div>
        <div style={{ fontSize: 24 * k, color: C.MUTED }}>Free · open source · nothing leaves your machine</div>
      </div>
    </div>
  );
};
