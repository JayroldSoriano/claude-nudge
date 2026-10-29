import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Bubble } from "../components/Bubble";
import { Mascot } from "../components/Mascot";
import { C, PRODUCT, UI_FONT } from "../theme";

const DONE_MSG =
  "Done. I added the created_at column with a migration, backfilled it from the audit log in batches of 5,000, and updated the Order model and tests.\n\nAll 48 tests pass. Two things worth a look before you merge:\n\n1. The backfill assumes audit_log.order_id is always set. 312 rows had no match and were left NULL.\n2. I didn't add a NOT NULL constraint for that reason. Say the word and I'll add a second migration with a default once you've checked those rows.";

/** Tweet 3: the bubble shows the real question and options; "Done" nudges show Claude's final message and expand. */
export const BubbleShowcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ui = 2.1;
  const SWITCH = 6 * fps;
  const EXPAND = 8.6 * fps;
  const first = frame < SWITCH;
  const expanded = frame >= EXPAND;

  const slide = (from: number) => spring({ frame: frame - from, fps, config: { damping: 16, stiffness: 150 }, durationInFrames: 16 });
  const sideIn = (from: number) => interpolate(slide(from), [0, 1], [40, 0]);
  const fade = (from: number) => slide(from);
  // bubble exits left between SWITCH-8 and SWITCH
  const exitX = interpolate(frame, [SWITCH - 8, SWITCH], [0, -80], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const exitO = interpolate(frame, [SWITCH - 8, SWITCH], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const copyFont = 46;
  return (
    <AbsoluteFill style={{ background: C.CREAM, fontFamily: UI_FONT }}>
      <div style={{ position: "absolute", top: 44, left: 80, fontSize: 22, fontWeight: 700, color: C.MUTED, letterSpacing: ".06em", textTransform: "uppercase" }}>{PRODUCT}</div>

      {/* left: copy */}
      <div style={{ position: "absolute", left: 80, top: 0, bottom: 0, width: 720, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
        {first ? (
          <div style={{ transform: `translateX(${exitX + sideIn(4)}px)`, opacity: exitO * fade(4) }}>
            <div style={{ fontSize: copyFont, fontWeight: 800, lineHeight: 1.15, color: C.TEXT, letterSpacing: "-0.02em" }}>
              It shows the <span style={{ background: C.BODY, padding: "0 10px", borderRadius: 10 }}>actual question</span> and the options.
            </div>
            <div style={{ fontSize: 30, color: C.MUTED, marginTop: 24, lineHeight: 1.4 }}>So you know whether it's worth tabbing back.</div>
          </div>
        ) : (
          <div style={{ transform: `translateX(${sideIn(SWITCH + 2)}px)`, opacity: fade(SWITCH + 2) }}>
            <div style={{ fontSize: copyFont, fontWeight: 800, lineHeight: 1.15, color: C.TEXT, letterSpacing: "-0.02em" }}>
              “Done” nudges show Claude's <span style={{ background: "#2e8b57", color: "#fff", padding: "0 10px", borderRadius: 10 }}>final message</span>.
            </div>
            <div style={{ fontSize: 30, color: C.MUTED, marginTop: 24, lineHeight: 1.4 }}>Expand it right there. Auto-dismisses after 20 seconds, unless you hover.</div>
          </div>
        )}
      </div>

      {/* right: bubble + mascot */}
      <div style={{ position: "absolute", right: 110, bottom: 90, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 * ui, transform: `translateX(${first ? exitX : 0}px)`, opacity: first ? exitO : 1 }}>
        <div style={{ transform: `scale(${ui})`, transformOrigin: "bottom right", height: expanded ? 330 : first ? 250 : 255 }}>
          {first ? (
            <Bubble
              kind="question"
              title="Claude has a question"
              project="shop"
              message="Which database should the new service use?"
              options={["Postgres", "SQLite", "Keep in-memory for now"]}
              hint="Waiting for you in the terminal"
              appearFrame={6}
              width={380}
              style={{ position: "absolute", right: 0, bottom: 0 }}
            />
          ) : (
            <Bubble
              kind="done"
              title="Claude is done"
              project="shop"
              message={DONE_MSG}
              hint="Esc to dismiss"
              appearFrame={SWITCH + 2}
              width={400}
              clamped={!expanded}
              showMore={expanded ? "Show less" : "Show more"}
              timer={expanded ? null : interpolate(frame, [SWITCH + 2, SWITCH + 2 + 20 * fps], [1, 0], { extrapolateRight: "clamp" })}
              style={{ position: "absolute", right: 0, bottom: 0 }}
            />
          )}
        </div>
        <Mascot size={84 * ui} level={0} startFrame={first ? 6 : SWITCH + 2} />
      </div>

      {/* expand pointer */}
      {frame > EXPAND - 18 && frame < EXPAND + 14 ? (
        <div style={{ position: "absolute", right: 110 + 72 * ui, bottom: 90 + (78 + 10 + 24) * ui + interpolate(frame, [EXPAND - 18, EXPAND], [-120, 0], { extrapolateRight: "clamp" }), transform: `scale(${frame >= EXPAND ? 0.9 : 1})` }}>
          <svg width={48} height={48} viewBox="0 0 24 24" style={{ filter: "drop-shadow(1px 2px 2px rgba(0,0,0,.35))" }}>
            <path d="M5 3 L19 12 L12 13.5 L15.5 20.5 L13 21.5 L9.5 14.5 L5 18 Z" fill="#fff" stroke="#111" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}

      <Sequence from={6} layout="none">
        <Audio src={staticFile("sfx-blip.wav")} />
      </Sequence>
      <Sequence from={SWITCH + 2} layout="none">
        <Audio src={staticFile("sfx-done.wav")} />
      </Sequence>
      <div style={{ position: "absolute", bottom: 36, left: 80, fontSize: 20, color: C.MUTED }}>{width}×{height} · everything stays on your machine</div>
    </AbsoluteFill>
  );
};
