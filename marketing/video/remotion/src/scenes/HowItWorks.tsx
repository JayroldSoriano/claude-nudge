import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Mascot } from "../components/Mascot";
import { Bubble } from "../components/Bubble";
import { C, INSTALL, MONO_FONT, PRODUCT, UI_FONT } from "../theme";

type Node = { id: string; title: string; sub: string; mono?: boolean };
const NODES: Node[] = [
  { id: "cc", title: "Claude Code", sub: "hooks: Stop · Notification · AskUserQuestion" },
  { id: "hook", title: "nudge-hook.sh", sub: "curl, 2s timeout, never blocks Claude", mono: true },
  { id: "relay", title: "relay/server.js", sub: "60 lines · zero deps · 127.0.0.1:47831", mono: true },
  { id: "ext", title: "Extension", sub: "MV3 service worker holds the WebSocket" },
  { id: "tab", title: "Active tab", sub: "closed shadow root · never reads the page" },
];

const Card: React.FC<{ node: Node; x: number; y: number; w: number; appear: number; lit: boolean }> = ({ node, x, y, w, appear, lit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - appear, fps, config: { damping: 14, stiffness: 170 }, durationInFrames: 14 });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
        opacity: s,
        background: lit ? C.CREAM : "#1A1816",
        color: lit ? C.TEXT : "#E8E2D8",
        border: `2px solid ${lit ? C.BODY : "#3a3632"}`,
        borderRadius: 18,
        padding: "22px 26px",
        boxShadow: lit ? `6px 6px 0 ${C.BODY}` : "none",
        fontFamily: UI_FONT,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: node.mono ? MONO_FONT : UI_FONT, letterSpacing: node.mono ? 0 : "-0.01em" }}>{node.title}</div>
      <div style={{ fontSize: 19, marginTop: 8, color: lit ? C.MUTED : "#9a948d", lineHeight: 1.35 }}>{node.sub}</div>
    </div>
  );
};

/** Tweet 4: hooks -> curl -> relay on localhost -> WebSocket -> extension. Nothing leaves your machine. */
export const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;

  const W = 300;
  const gap = (width - 160 - W * 5) / 4;
  const xs = NODES.map((_, i) => 80 + i * (W + gap));
  const Y = 440;

  // Packet travels across the chain from 5s to 11s, lighting each node as it arrives.
  const travel = interpolate(t, [5, 11], [0, 4], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const packetX = interpolate(travel, [0, 4], [xs[0] + W / 2, xs[4] + W / 2]);
  const litIndex = t < 5 ? -1 : Math.floor(travel + 0.02);

  const labelsOn = (i: number) => (travel > i + 0.3 && travel < i + 0.9 ? 1 : 0.35);
  const EDGE = ["hook fires", "POST /events", "WebSocket", "render"];

  const headline = spring({ frame, fps, config: { damping: 16, stiffness: 140 }, durationInFrames: 18 });
  const privacy = spring({ frame: frame - 12 * fps, fps, config: { damping: 16, stiffness: 140 }, durationInFrames: 18 });
  const boundary = interpolate(frame, [12.2 * fps, 13.2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rejected = frame >= 14.5 * fps;
  const rejX = interpolate(frame, [14.5 * fps, 15.4 * fps], [width + 40, xs[2] + W + 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const rejBounce = frame > 15.4 * fps ? interpolate(frame, [15.4 * fps, 16 * fps], [0, 90], { extrapolateRight: "clamp" }) : 0;
  const install = spring({ frame: frame - 17 * fps, fps, config: { damping: 16, stiffness: 140 }, durationInFrames: 18 });

  const mascotOn = travel >= 3.95;

  return (
    <AbsoluteFill style={{ background: C.TERM, fontFamily: UI_FONT, color: "#E8E2D8" }}>
      <div style={{ position: "absolute", top: 54, left: 80, fontSize: 22, fontWeight: 700, color: "#8a8580", letterSpacing: ".06em", textTransform: "uppercase" }}>{PRODUCT} · how it works</div>
      <div style={{ position: "absolute", top: 120, left: 80, right: 80, fontSize: 64, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, transform: `translateY(${interpolate(headline, [0, 1], [30, 0])}px)`, opacity: headline }}>
        Claude Code hooks → curl → a 60-line relay on localhost → WebSocket → the extension.
      </div>

      {/* your-machine boundary */}
      <div
        style={{
          position: "absolute",
          left: 48,
          top: Y - 70,
          width: (xs[4] + W + 32 - 48) * boundary,
          height: 330,
          border: `3px dashed ${C.BODY}`,
          borderRadius: 28,
          opacity: boundary,
          overflow: "hidden",
        }}
      />
      <div style={{ position: "absolute", left: 72, top: Y - 92, background: C.TERM, padding: "0 12px", fontSize: 22, fontWeight: 700, color: C.BODY, opacity: boundary }}>
        your machine · 127.0.0.1
      </div>

      {/* edges */}
      {[0, 1, 2, 3].map((i) => {
        const x1 = xs[i] + W;
        const x2 = xs[i + 1];
        const on = travel > i;
        return (
          <div key={i} style={{ position: "absolute", left: x1, top: Y + 56, width: x2 - x1, opacity: frame > (0.8 + i * 0.25) * fps ? 1 : 0 }}>
            <div style={{ height: 3, background: on ? C.BODY : "#3a3632", margin: "0 6px" }} />
            <div style={{ position: "absolute", right: 2, top: -7, width: 0, height: 0, borderTop: "9px solid transparent", borderBottom: "9px solid transparent", borderLeft: `14px solid ${on ? C.BODY : "#3a3632"}` }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 14, textAlign: "center", fontSize: 17, fontFamily: MONO_FONT, color: C.BODY, opacity: labelsOn(i) }}>{EDGE[i]}</div>
          </div>
        );
      })}

      {NODES.map((n, i) => (
        <Card key={n.id} node={n} x={xs[i]} y={Y} w={W} appear={(0.6 + i * 0.25) * fps} lit={litIndex >= i} />
      ))}

      {/* packet */}
      {t >= 5 && travel < 3.98 ? (
        <div style={{ position: "absolute", left: packetX - 14, top: Y + 56 - 14, width: 28, height: 28, borderRadius: "50%", background: C.BODY, boxShadow: `0 0 24px ${C.BODY}` }} />
      ) : null}

      {/* mascot pops over the active tab card */}
      {mascotOn ? (
        <div style={{ position: "absolute", left: xs[4] + W - 150, top: Y - 230, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <Bubble kind="permission" title="Claude needs permission" message="Run the migration? (y/n)" hint="Waiting for you in the terminal" appearFrame={Math.round(11 * fps)} width={300} />
          <Mascot size={84} level={0} startFrame={Math.round(11 * fps)} />
        </div>
      ) : null}

      {/* web page origin gets rejected */}
      {rejected ? (
        <div style={{ position: "absolute", left: rejX, top: Y + 240 - rejBounce * 0.4, transform: `rotate(${rejBounce * 0.6}deg)`, opacity: interpolate(rejBounce, [0, 90], [1, 0]), fontFamily: MONO_FONT, fontSize: 20, color: "#E8E2D8", background: "#2a2622", border: `2px solid ${C.RED}`, borderRadius: 12, padding: "10px 16px" }}>
          Origin: https://some-site.example → <span style={{ color: C.RED, fontWeight: 700 }}>403</span>
        </div>
      ) : null}

      <div style={{ position: "absolute", left: 80, right: 80, top: 800, fontSize: 40, fontWeight: 700, lineHeight: 1.3, transform: `translateY(${interpolate(privacy, [0, 1], [24, 0])}px)`, opacity: privacy }}>
        Nothing leaves your machine. <span style={{ color: C.BODY }}>The relay rejects any web-page origin</span>, messages are clipped to 1200 chars, and the content script never reads the page.
      </div>

      <div style={{ position: "absolute", left: 80, bottom: 56, display: "flex", alignItems: "center", gap: 28, transform: `translateY(${interpolate(install, [0, 1], [24, 0])}px)`, opacity: install }}>
        <div style={{ fontFamily: MONO_FONT, fontSize: 34, fontWeight: 700, background: C.CREAM, color: C.TEXT, padding: "14px 24px", borderRadius: 14, boxShadow: `6px 6px 0 ${C.BODY}` }}>
          <span style={{ color: C.DARK }}>$ </span>
          {INSTALL}
        </div>
        <div style={{ fontSize: 24, color: "#9a948d" }}>MIT · ~1,500 lines · no build step</div>
      </div>
    </AbsoluteFill>
  );
};
