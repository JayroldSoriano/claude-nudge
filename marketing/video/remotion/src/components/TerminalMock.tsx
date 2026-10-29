import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO_FONT } from "../theme";

export type TerminalMockProps = {
  width: number;
  height: number;
  fontSize?: number;
  /** Frame at which "y" gets typed at the prompt (and the answer line appears). */
  answerFrame?: number;
  /** Frame to start the blinking cursor from. */
  startFrame?: number;
  /** Show the window chrome (title bar). */
  chrome?: boolean;
  style?: React.CSSProperties;
};

const TRANSCRIPT: { kind: "user" | "claude" | "tool" | "dim"; text: string }[] = [
  { kind: "user", text: "add a created_at column to orders and backfill it" },
  { kind: "claude", text: "I'll add the column with a migration, backfill from the audit log, then update the model and tests." },
  { kind: "tool", text: "Read  src/db/models/order.ts" },
  { kind: "tool", text: "Write src/db/migrations/0042_orders_created_at.sql" },
  { kind: "tool", text: "Edit  src/db/models/order.ts  (+4 -1)" },
  { kind: "tool", text: "Edit  tests/orders.test.ts  (+18 -0)" },
  { kind: "claude", text: "Migration written. It adds the column, backfills 184,220 rows in batches of 5,000, and adds the index." },
];

export const TerminalMock: React.FC<TerminalMockProps> = ({ width, height, fontSize = 15, answerFrame, startFrame = 0, chrome = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - startFrame) / fps;
  const cursorOn = Math.floor(t * 2) % 2 === 0;
  const answered = answerFrame !== undefined && frame >= answerFrame;
  const lh = fontSize * 1.55;
  return (
    <div
      style={{
        width,
        height,
        background: C.TERM,
        borderRadius: chrome ? 12 : 0,
        overflow: "hidden",
        fontFamily: MONO_FONT,
        fontSize,
        lineHeight: `${lh}px`,
        color: "#D9D4CC",
        boxShadow: chrome ? "0 30px 80px rgba(0,0,0,.45)" : undefined,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {chrome ? (
        <div style={{ height: fontSize * 2.4, background: "#1C1A18", display: "flex", alignItems: "center", padding: `0 ${fontSize}px`, gap: fontSize * 0.5, flex: "none" }}>
          <span style={{ width: fontSize * 0.8, height: fontSize * 0.8, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: fontSize * 0.8, height: fontSize * 0.8, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: fontSize * 0.8, height: fontSize * 0.8, borderRadius: "50%", background: "#28C840" }} />
          <span style={{ marginLeft: "auto", marginRight: "auto", color: "#8a8580", fontSize: fontSize * 0.85 }}>~/code/shop — claude</span>
        </div>
      ) : null}
      <div style={{ padding: `${fontSize * 1.2}px ${fontSize * 1.4}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: 1, overflow: "hidden" }}>
        {TRANSCRIPT.map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", marginBottom: l.kind === "claude" ? lh * 0.5 : 0, color: l.kind === "tool" ? "#8a8580" : l.kind === "user" ? "#E8E2D8" : "#D9D4CC" }}>
            {l.kind === "user" ? <span style={{ color: "#8a8580" }}>{"> "}</span> : null}
            {l.kind === "claude" ? <span style={{ color: C.BODY }}>{"● "}</span> : null}
            {l.kind === "tool" ? <span style={{ color: "#5f5a55" }}>{"  ⎿ "}</span> : null}
            {l.text}
          </div>
        ))}
        <div style={{ marginTop: lh * 0.5, border: `1px solid ${C.BODY}`, borderRadius: 8, padding: `${fontSize * 0.6}px ${fontSize}px`, background: "#17150F" }}>
          <div style={{ color: C.BODY, fontWeight: 700 }}>Bash command</div>
          <div style={{ color: "#D9D4CC" }}>{"npm run db:migrate"}</div>
          <div style={{ color: "#8a8580" }}>Run the migration? (y/n)</div>
          <div style={{ color: "#E8E2D8" }}>
            {"❯ "}
            {answered ? "y" : ""}
            <span style={{ display: "inline-block", width: fontSize * 0.6, height: fontSize * 1.1, verticalAlign: "text-bottom", background: cursorOn ? "#E8E2D8" : "transparent", marginLeft: 2 }} />
          </div>
        </div>
        {answered ? (
          <div style={{ marginTop: lh * 0.4, color: "#8a8580" }}>
            <span style={{ color: "#28C840" }}>{"✓ "}</span>
            {"Running migration 0042_orders_created_at…"}
          </div>
        ) : null}
      </div>
    </div>
  );
};
