// Brand tokens, copied from extension/content.js via BRIEF.md. Do not restyle.
export const C = {
  BODY: "#FFC53D",
  DARK: "#C98A12",
  INK: "#2B2118",
  GLINT: "#FFFFFF",
  BULB: "#7ED957",
  BULB_L1: "#FFB020",
  BULB_L2: "#FF4D4D",
  CREAM: "#FFFDF9",
  TEXT: "#1F1D1A",
  RED: "#B3261E",
  PILL: "#FFF3EA",
  MUTED: "#7A6A5A",
  TERM: "#0F0E0D",
  PAPER: "#F1E9DF",
} as const;

export const UI_FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const MONO_FONT = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

export const PRODUCT = "Nudge for Claude Code";
export const INSTALL = "npx claude-nudge setup";

export type Level = 0 | 1 | 2 | 3;

export const HINTS: Record<Level, string> = {
  0: "Waiting for you in the terminal",
  1: "Still here. Claude has been waiting 15s.",
  2: "Hey. Claude is blocked on you.",
  3: "CLAUDE. HAS. BEEN. WAITING.",
};
