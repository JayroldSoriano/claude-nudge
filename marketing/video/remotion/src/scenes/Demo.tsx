import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { BrowserMock } from "../components/BrowserMock";
import { Caption } from "../components/Caption";
import { EndCard } from "../components/EndCard";
import { NudgeOverlay } from "../components/NudgeOverlay";
import { TerminalMock } from "../components/TerminalMock";

export type DemoProps = { portrait: boolean };

export const QUESTION = {
  kind: "permission" as const,
  title: "Claude needs permission",
  project: "shop",
  message: "Run the migration? (y/n)\nnpm run db:migrate",
};

/**
 * The 15s demo from launch-copy.md. Frames at 30fps:
 * 0-45 terminal · 45-90 browser feed · 90 nudge (lvl 0) · 150 lvl 1 · 240 lvl 2 · 330 lvl 3 · ~395 "Got it" · 405 terminal, y · 420 end card.
 */
export const Demo: React.FC<DemoProps> = ({ portrait }) => {
  const { width, height, fps } = useVideoConfig();
  const ui = 2;
  const barH = 78 * ui;
  const capSize = portrait ? 62 : 60;
  const capTop = portrait ? 260 : 60;

  const T_BROWSER = 1.5 * fps; // 45
  const T_NUDGE = 3 * fps; // 90
  const T_L1 = 5 * fps; // 150
  const T_L2 = 8 * fps; // 240
  const T_L3 = 11 * fps; // 330
  const T_ARRIVE = 12.6 * fps; // 378
  const T_PRESS = 13.15 * fps; // ~395
  const T_DISMISS = T_PRESS + 3;
  const T_TERM2 = 13.5 * fps; // 405
  const T_ANSWER = 13.8 * fps; // 414
  const T_END = 14.15 * fps; // ~425

  return (
    <AbsoluteFill style={{ background: "#F6F3EE" }}>
      <Sequence from={0} durationInFrames={T_BROWSER} layout="none">
        <TerminalMock width={width} height={height} fontSize={portrait ? 28 : 30} chrome={false} />
      </Sequence>

      <Sequence from={T_BROWSER} durationInFrames={T_TERM2 - T_BROWSER} layout="none">
        <BrowserMock width={width} height={height} ui={ui} scrollSpeed={portrait ? 260 : 220} startFrame={0} stopScrollFrame={T_L1 - T_BROWSER + 10}>
          <NudgeOverlay
            viewport={{ w: width, h: height - barH }}
            appearFrame={T_NUDGE - T_BROWSER}
            dismissFrame={T_DISMISS - T_BROWSER}
            levels={[
              { level: 1, frame: T_L1 - T_BROWSER },
              { level: 2, frame: T_L2 - T_BROWSER },
              { level: 3, frame: T_L3 - T_BROWSER },
            ]}
            bubble={QUESTION}
            ui={ui}
            freezeFrame={T_ARRIVE - T_BROWSER}
            cursor={{ arriveFrame: T_ARRIVE - T_BROWSER, pressFrame: T_PRESS - T_BROWSER }}
            pressedFrame={T_PRESS - T_BROWSER}
          />
        </BrowserMock>
      </Sequence>

      <Sequence from={T_TERM2} durationInFrames={T_END - T_TERM2 + 6} layout="none">
        <TerminalMock width={width} height={height} fontSize={portrait ? 28 : 30} chrome={false} answerFrame={T_ANSWER - T_TERM2} />
      </Sequence>

      <Caption text="You: just checking one thing" from={0} to={T_NUDGE} size={capSize} offset={capTop} />
      <Caption text="Claude: hey" from={T_NUDGE} to={T_L1} size={capSize} offset={capTop} tone="body" />
      <Caption text="Claude: hey." from={T_L1} to={T_L2} size={capSize} offset={capTop} tone="body" />
      <Caption text="Claude: HEY." from={T_L2} to={T_L3} size={capSize} offset={capTop} tone="red" />
      <Caption text="Claude: !!!" from={T_L3} to={T_PRESS} size={capSize} offset={capTop} tone="red" />

      <EndCard from={T_END} portrait={portrait} />

      <Sequence from={T_NUDGE} layout="none">
        <Audio src={staticFile("sfx-blip.wav")} volume={0.9} />
      </Sequence>
      <Sequence from={T_L3} layout="none">
        <Audio src={staticFile("sfx-alarm.wav")} volume={0.9} />
      </Sequence>
    </AbsoluteFill>
  );
};
