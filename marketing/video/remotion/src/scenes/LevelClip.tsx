import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { BrowserMock } from "../components/BrowserMock";
import { Caption } from "../components/Caption";
import { NudgeOverlay } from "../components/NudgeOverlay";
import { C, Level, PRODUCT, UI_FONT } from "../theme";
import { QUESTION } from "./Demo";

export const LEVEL_CAPTIONS: Record<Level, string> = {
  0: "Level 0: waves",
  1: "Level 1: walks to center",
  2: "Level 2: grows, taps foot, bubble turns red",
  3: "Level 3: alarm, roams the screen",
};

/** 5s square clip of a single escalation level over a browser feed (one per level, for weekly posts). */
export const LevelClip: React.FC<{ level: Level }> = ({ level }) => {
  const { width, height, fps } = useVideoConfig();
  const ui = 2;
  const barH = 78 * ui;
  // Show the transition *into* this level in the first second so each clip demonstrates its own move.
  const levels: { level: Level; frame: number }[] = [];
  if (level >= 1) levels.push({ level: 1, frame: level === 1 ? 0.8 * fps : 0 });
  if (level >= 2) levels.push({ level: 2, frame: level === 2 ? 0.8 * fps : 0 });
  if (level === 3) levels.push({ level: 3, frame: 0.8 * fps });
  return (
    <AbsoluteFill style={{ background: "#F6F3EE" }}>
      <BrowserMock width={width} height={height} ui={ui} scrollSpeed={0} startFrame={0}>
        <NudgeOverlay viewport={{ w: width, h: height - barH }} appearFrame={level === 0 ? 0.3 * fps : -200} levels={levels} bubble={QUESTION} ui={ui} />
      </BrowserMock>
      <Caption text={LEVEL_CAPTIONS[level]} from={level === 0 ? 0.3 * fps : 0.8 * fps} size={52} offset={70} tone={level >= 2 ? "red" : "ink"} />
      <div style={{ position: "absolute", top: 18, left: 0, right: 0, textAlign: "center", fontFamily: UI_FONT, fontSize: 22, fontWeight: 700, color: C.MUTED, letterSpacing: ".06em", textTransform: "uppercase" }}>
        {PRODUCT}
      </div>
      {level === 0 ? (
        <Sequence from={0.3 * fps} layout="none">
          <Audio src={staticFile("sfx-blip.wav")} />
        </Sequence>
      ) : null}
      {level === 3 ? (
        <Sequence from={0.8 * fps} layout="none">
          <Audio src={staticFile("sfx-alarm.wav")} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
