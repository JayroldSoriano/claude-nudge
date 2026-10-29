# Nudge for Claude Code: video brief

Shared creative brief for the marketing and demo videos. Source of truth: `../launch-copy.md`
(positioning, taglines, demo script, channels) and `../monetization-plan.md` (tiers, numbers, sequence).
Two toolchains build in parallel: `remotion/` (React, product demos and short-form clips) and
`hyperframes/` (HTML+GSAP, launch trailer and presentation videos). Rendered files go to `out/`.

## Naming (non-negotiable, from monetization-plan.md section 0)

- Product name: **Nudge for Claude Code**. Never "Claude Nudge" in any on-screen text.
- Mascot name: **Nudge**. Never "Clawd". Never the Anthropic logo or wordmark.
- "Works with Claude Code" may appear as a descriptor. The install command on screen is `npx claude-nudge setup`
  (`claude-nudge` on npm is taken by an unrelated package, so the real package name is `nudge-for-claude-code`; keep it verbatim).
- Placeholders in copy: `LANDING_URL`, `STORE_URL`, `REPO_URL`. On screen, show `nudge.dev` style placeholders as
  `LANDING_URL` literally, or omit URLs and keep the install command. Do not invent a domain.

## Brand tokens (from extension/content.js, use exactly)

| Token | Value | Use |
| --- | --- | --- |
| BODY | `#FFC53D` | mascot body, accent, primary buttons, progress bars |
| DARK | `#C98A12` | mascot shadow/feet/antenna stalk |
| INK | `#2B2118` | mascot eyes/mouth; near-black for text on cream |
| GLINT | `#FFFFFF` | eye highlight |
| BULB | `#7ED957` | antenna light at level 0 |
| BULB L1 | `#FFB020` | antenna at level 1 |
| BULB L2/3 | `#FF4D4D` | antenna at levels 2 and 3 (blinks) |
| Cream | `#FFFDF9` | bubble background, light UI surface |
| Text | `#1F1D1A` | UI text, 2px bubble border, hard 4px offset shadow |
| Alert red | `#B3261E` | level 2/3 bubble border, shadow and hint text |
| Pill | `#FFF3EA` | option pills in the bubble |
| Muted | `#7A6A5A` | hints |
| Terminal bg | `#0F0E0D` | dark terminal / dark scenes |

Bubble look: cream card, 2px INK border, radius 14px, hard offset shadow `4px 4px 0 INK`, small tail pointing down
toward the mascot. Header row: 9px colored dot + bold 13px title (+ optional project pill). Message text, then option
pills (1.5px INK border, radius 999px, Pill bg), then footer: hint (left), `Snooze 5m` + `Got it` (BODY, primary).
At level 2+ the border/shadow/hint turn Alert red and the bubble shakes once; at level 3 it wiggles.

Typography: system sans for UI mockups (-apple-system / Inter). Headlines: a bold geometric or grotesk display.
Pixel flavor is allowed for titles (e.g. a pixel font) but body copy must be clean. Terminal mockups: monospace.

## The mascot

`shared/mascot-pixels.json` is the 14x13 pixel map and palette; `shared/mascot*.svg` are static renders
(smile, annoyed, two wave frames). Draw it with crisp edges, never smoothed. Animation vocabulary (from the extension):

- **bob**: body moves up ~0.35 grid px and back, 1.2s loop.
- **blink**: eyes scaleY to 0.15 for ~150ms every ~4s.
- **wave**: alternate `armUp` and `armOut` frames; 0.5s per cycle at level 0, 0.3s at level 1, 0.2s at level 3.
- **glow**: antenna bulb opacity 0.55 -> 1 -> 0.55, 2s loop. Level 2 blinks 0.5s, level 3 blinks 0.2s.
- **level 2**: eyes squint (scaleY 0.5), brows + frown visible, smile hidden, left foot taps (0.4s), scale 1.8x.
- **level 3**: both feet tap (0.25s), body jitters +-0.3px ("fume"), hops (up 26px then 10px, 1s loop), roams along
  the bottom edge from center toward the far corner and back over ~9s.
- **entrance**: rise from 40px below with fade over 0.35s; bubble pops from scale 0.6 with a slight overshoot (0.22s).

## Escalation (the shareable hook)

| Level | After | What the viewer sees | Hint text in bubble |
| --- | --- | --- | --- |
| 0 | 0s | Corner wave, bottom-right | "Waiting for you in the terminal" |
| 1 | 15s | Walks to bottom-center (0.9s ease), waves harder, scale 1.25 | "Still here. Claude has been waiting 15s." |
| 2 | 30s | Grows to 1.8x, annoyed face, foot tapping, bubble turns red and shakes | "Hey. Claude is blocked on you." |
| 3 | 60s | Short alarm (`shared/sfx-alarm.wav`), hops and roams the bottom edge | "CLAUDE. HAS. BEEN. WAITING." |

In videos compress the timings (a few seconds per level) but show the on-screen hint text as above.

## Sounds

`shared/sfx-blip.wav` (question/permission arrival), `shared/sfx-done.wav` (done), `shared/sfx-alarm.wav` (level 3).
These are the extension's actual tones. Use them on the matching actions. Music: optional, light, chiptune-adjacent or
soft lo-fi; must be license-free. If you cannot source or generate music locally, ship without music and say so.

## Deliverables

### A. Remotion (`remotion/`) — demos and short-form

| ID | Composition | Size / fps / length | Purpose |
| --- | --- | --- | --- |
| A1 | `DemoShort` | 1080x1920, 30fps, 15s | The demo script in launch-copy.md, caption-only, no voiceover. YouTube Shorts / TikTok / Reels. |
| A2 | `DemoLandscape` | 1920x1080, 30fps, 15s | Same cut, landscape. Export MP4 and also a GIF (<= 8MB, 15fps, 960px wide, via ffmpeg palettegen) for X / Reddit / README. |
| A3 | `Level0`..`Level3` | 1080x1080, 30fps, 5s each | "Each escalation level as its own clip with a one-line caption" (ongoing content). Captions: "Level 0: waves", "Level 1: walks to center", "Level 2: grows, taps foot, bubble turns red", "Level 3: alarm, roams the screen". |
| A4 | `BubbleShowcase` | 1920x1080, 30fps, 12s | Tweet 3: the bubble showing a real question with options, then a Done bubble with Claude's final message expanding. |
| A5 | `HowItWorks` | 1920x1080, 30fps, 20s | Tweet 4: hooks -> curl -> relay on 127.0.0.1 -> WebSocket -> extension, animated, with "nothing leaves your machine". |
| A6 | Stills | 1280x800 x5, 440x280 x1 | The five Web Store screenshots and the promo tile from launch-copy.md, rendered with `remotion still`. |

Demo script (A1/A2), exactly:

| Time | Shot | Caption |
| --- | --- | --- |
| 0-3s | Terminal: Claude Code asks "Run the migration? (y/n)". Cut to a browser scrolling a feed. | "You: just checking one thing" |
| 3-5s | Mascot pops in the corner, waves, bubble shows the question. | "Claude: hey" |
| 5-8s | Walks to bottom center, waves harder, hint "waiting 15s". | "Claude: hey." |
| 8-11s | Grows, annoyed face, foot tapping, red bubble shakes. | "Claude: HEY." |
| 11-13s | Alarm, hops along the bottom. | "Claude: !!!" |
| 13-15s | Click "Got it", mascot leaves, cut to terminal, type y. End card with install command. | "npx claude-nudge setup" |

Mock the terminal (dark, monospace, a plausible Claude Code transcript ending in the permission prompt) and the
browser (a generic feed of gray cards, no real brand). Everything is drawn in React; no screen recordings.

### B. Hyperframes (`hyperframes/`) — trailer and presentation

| ID | Composition | Size / fps / length | Purpose |
| --- | --- | --- | --- |
| B1 | `trailer` | 1920x1080, 30fps, 30s | Launch trailer for X pinned post / Product Hunt gallery / landing page hero. Beats: problem (doomscroll while Claude waits) -> mascot appears -> escalation montage -> "the actual question, in the bubble" -> privacy ("127.0.0.1, nothing leaves your Mac") -> install command -> tagline "Claude is waiting. Nudge makes sure you know." |
| B2 | `pitch` | 1920x1080, 30fps, 75-90s | Presentation video for a talk or investor/partner deck. Sections: 1) the problem and who has it, 2) what Nudge does (features), 3) escalation, 4) how it works (architecture), 5) tiers: Free / Pro $19 one-time / Cloud $4 mo / Team $6 seat, 6) realistic numbers table (conservative vs decent launch), 7) launch sequence (week 0, 1, 2-6, month 3+), 8) close with install command. Design it as motion slides with on-screen text that stands alone without a presenter. |
| B3 | `levels-vertical` | 1080x1920, 30fps, 12s | Tweet 2 / Shorts: "The longer you ignore a question, the harder it tries." Level 1 -> 2 -> 3 with the one-line captions, ending "There's a Gentle mode. And a snooze." |

Use the mascot as drawn HTML (divs or inline SVG rects from `shared/mascot-pixels.json`), never a raster scaled up
with smoothing. Numbers in B2 come straight from monetization-plan.md section 2. Do not add claims not in the docs.

## Output

- Render finals to `marketing/video/out/` with names like `A1-demo-short.mp4`, `A2-demo-landscape.mp4`, `A2-demo-landscape.gif`,
  `A3-level0.mp4`, `A6-store-1.png`, `B1-trailer.mp4`, `B2-pitch.mp4`, `B3-levels-vertical.mp4`.
- H.264 MP4, yuv420p, AAC audio if any audio. Verify each with `ffprobe` (duration, size) and look at 3+ decoded frames
  (`ffmpeg -ss <t> -i file -frames:v 1 frame.png`) before calling it done.
- Each toolchain's README lists: how to preview, how to render each composition, and what is left to do by a human
  (music choice, final URLs, Web Store screenshots that need the real popup).
