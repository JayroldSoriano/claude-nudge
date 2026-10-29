import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { UI_FONT } from "../theme";

export type BrowserMockProps = {
  width: number;
  height: number;
  /** px per second of feed scroll; 0 to freeze. */
  scrollSpeed?: number;
  /** Frame at which scrolling stops (the user notices the mascot). */
  stopScrollFrame?: number;
  startFrame?: number;
  /** Scale factor for the chrome (tab bar) so it reads at video sizes. */
  ui?: number;
  /** "feed" (social cards) or "docs" (a documentation page). */
  page?: "feed" | "docs";
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

// deterministic pseudo-random for card shapes
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const FeedCard: React.FC<{ i: number; w: number }> = ({ i, w }) => {
  const hasImage = rnd(i, 1) > 0.45;
  const lines = 1 + Math.floor(rnd(i, 2) * 3);
  const tones = ["#E7E3DD", "#DDD8D1", "#D2CCC4", "#CFC9C1"];
  return (
    <div style={{ width: w, background: "#fff", borderRadius: 14, padding: 18, marginBottom: 14, border: "1px solid #E6E1DA" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: tones[i % 4] }} />
        <div>
          <div style={{ width: 90 + rnd(i, 3) * 80, height: 12, borderRadius: 6, background: "#D2CCC4" }} />
          <div style={{ width: 60, height: 9, borderRadius: 5, background: "#E7E3DD", marginTop: 6 }} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, j) => (
        <div key={j} style={{ height: 11, borderRadius: 6, background: "#DDD8D1", width: `${55 + rnd(i, 10 + j) * 45}%`, marginBottom: 8 }} />
      ))}
      {hasImage ? <div style={{ height: 120 + rnd(i, 4) * 140, borderRadius: 10, background: tones[(i + 1) % 4], marginTop: 10 }} /> : null}
      <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ width: 46, height: 10, borderRadius: 5, background: "#E7E3DD" }} />
        ))}
      </div>
    </div>
  );
};

export const BrowserMock: React.FC<BrowserMockProps> = ({ width, height, scrollSpeed = 160, stopScrollFrame, startFrame = 0, ui = 1, page = "feed", children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const effFrame = stopScrollFrame !== undefined ? Math.min(frame, stopScrollFrame) : frame;
  const scroll = Math.max(0, (effFrame - startFrame) / fps) * scrollSpeed;
  const barH = 78 * ui;
  const cardW = Math.min(560 * ui, width - 48 * ui);
  const cards = Math.ceil((height + scroll) / 160) + 6;
  return (
    <div style={{ width, height, background: "#F6F3EE", position: "relative", overflow: "hidden", fontFamily: UI_FONT, ...style }}>
      {/* tab strip + toolbar */}
      <div style={{ height: barH, background: "#DEE1E6", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "flex-end", height: barH * 0.5, padding: `0 ${12 * ui}px`, gap: 6 * ui }}>
          <div style={{ display: "flex", gap: 6 * ui, marginBottom: barH * 0.14, marginRight: 8 * ui }}>
            <span style={{ width: 11 * ui, height: 11 * ui, borderRadius: "50%", background: "#FF5F57" }} />
            <span style={{ width: 11 * ui, height: 11 * ui, borderRadius: "50%", background: "#FEBC2E" }} />
            <span style={{ width: 11 * ui, height: 11 * ui, borderRadius: "50%", background: "#28C840" }} />
          </div>
          <div style={{ background: "#fff", borderRadius: `${8 * ui}px ${8 * ui}px 0 0`, padding: `${6 * ui}px ${14 * ui}px`, fontSize: 12 * ui, color: "#333", minWidth: 150 * ui }}>
            {page === "docs" ? "Getting started · Docs" : "Home / feed"}
          </div>
          <div style={{ background: "#CFD3DA", borderRadius: `${8 * ui}px ${8 * ui}px 0 0`, padding: `${6 * ui}px ${14 * ui}px`, fontSize: 12 * ui, color: "#555", minWidth: 110 * ui }}>
            localhost:3000
          </div>
        </div>
        <div style={{ height: barH * 0.5, background: "#fff", display: "flex", alignItems: "center", padding: `0 ${14 * ui}px`, gap: 10 * ui }}>
          <span style={{ color: "#777", fontSize: 14 * ui }}>‹ ›  ↻</span>
          <div style={{ flex: 1, height: barH * 0.32, borderRadius: 999, background: "#F1F3F4", display: "flex", alignItems: "center", padding: `0 ${12 * ui}px`, fontSize: 12 * ui, color: "#555" }}>
            {page === "docs" ? "docs.example.dev/getting-started" : "feed.example.com"}
          </div>
        </div>
      </div>
      {/* page body */}
      <div style={{ position: "absolute", top: barH, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        {page === "feed" ? (
          <div style={{ position: "absolute", left: "50%", top: 0, transform: `translate(-50%, ${-scroll}px)`, paddingTop: 20 * ui, zoom: ui }}>
            {Array.from({ length: cards }).map((_, i) => (
              <FeedCard key={i} i={i} w={cardW / ui} />
            ))}
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", zoom: ui }}>
            <div style={{ width: 220, borderRight: "1px solid #E6E1DA", padding: 24, background: "#FBF9F6" }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ height: 10, borderRadius: 5, background: i === 2 ? "#C9C2B8" : "#E7E3DD", width: `${50 + rnd(i, 7) * 50}%`, marginBottom: 16 }} />
              ))}
            </div>
            <div style={{ flex: 1, padding: "40px 56px", maxWidth: 760 }}>
              <div style={{ height: 28, width: "55%", borderRadius: 8, background: "#C9C2B8", marginBottom: 22 }} />
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ height: 11, borderRadius: 6, background: "#DDD8D1", width: `${(i + 1) % 4 === 0 ? 40 : 70 + rnd(i, 9) * 30}%`, marginBottom: 12 }} />
              ))}
              <div style={{ height: 120, borderRadius: 10, background: "#2B2118", margin: "18px 0", opacity: 0.9 }} />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{ height: 11, borderRadius: 6, background: "#DDD8D1", width: `${(i + 2) % 4 === 0 ? 45 : 65 + rnd(i, 11) * 35}%`, marginBottom: 12 }} />
              ))}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
