'use strict';
// Waiting stats: how long Claude sat blocked on you. Zero dependencies, local only (never forwarded to the cloud).
//
// A wait opens when a question or permission nudge is emitted and closes when it is answered in the bubble or on the
// phone (a decision), in the terminal (resolved, or the session stops or moves on), or when the nudge is dismissed.
// Each closed wait is one line in ~/.claude-nudge/stats.jsonl: {start, end, ms, kind, project, agent, answered}.
// The file rotates to stats.1.jsonl at 5 MB; GET /stats reads both.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = process.env.CLAUDE_NUDGE_STATS || path.join(os.homedir(), '.claude-nudge', 'stats.jsonl');
const OLD = FILE.replace(/\.jsonl$/, '') + '.1.jsonl';
const MAX_BYTES = 5 * 1024 * 1024;
const STALE_MS = 12 * 3600e3; // a wait nothing ever closed (the session was killed) is dropped, not counted
const DAY = 86400e3;
const RANGES = { day: 1, week: 7, month: 30 };
const WAITING_KINDS = new Set(['question', 'permission']);

const open = new Map(); // `${agent}:${session_id}` (adapters' sessionKey) -> { start, kind, project, agent, eventId }

function append(row) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    try { if (fs.statSync(FILE).size >= MAX_BYTES) fs.renameSync(FILE, OLD); } catch (_) { /* no file yet */ }
    fs.appendFileSync(FILE, JSON.stringify(row) + '\n');
  } catch (e) { console.error(`[nudge] could not write stats: ${e.message}`); }
}

// Closes the session's open wait (`sessionKey`: `${agent}:${session_id}`). `answered`: terminal | bubble | phone | dismissed. `eventId` (when given) must be
// the nudge that opened it, so dismissing an older bubble doesn't close a newer wait.
function finish(sessionKey, answered, { eventId, end = Date.now() } = {}) {
  const w = open.get(sessionKey);
  if (!w || (eventId && w.eventId !== eventId)) return null;
  open.delete(sessionKey);
  const row = { start: w.start, end, ms: Math.max(0, end - w.start), kind: w.kind, project: w.project, agent: w.agent, answered };
  append(row);
  return row;
}

// Fed every emitted event. Test and preview nudges never count.
function observe(event) {
  if (!event || event.test || !event.session_id) return;
  const sid = `${event.agent || 'claude-code'}:${event.session_id}`;
  if (WAITING_KINDS.has(event.kind)) {
    if (open.has(sid)) finish(sid, 'terminal', { end: event.ts }); // Claude moved on to a new prompt: the last one was answered
    open.set(sid, { start: event.ts || Date.now(), kind: event.kind, project: event.project || '', agent: event.agent || 'claude-code', eventId: event.id });
  } else if (event.kind === 'resolved' || event.kind === 'done') {
    finish(sid, 'terminal', { end: event.ts });
  }
}

setInterval(() => {
  for (const [sid, w] of open) if (Date.now() - w.start > STALE_MS) open.delete(sid);
}, 600e3).unref();

async function readRows() {
  const rows = [];
  for (const f of [OLD, FILE]) {
    let text;
    try { text = await fs.promises.readFile(f, 'utf8'); } catch (_) { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { const r = JSON.parse(line); if (r && r.end) rows.push(r); } catch (_) { /* torn line */ }
    }
  }
  return rows;
}

const minutes = (ms) => Math.round(ms / 6000) / 10; // one decimal

function aggregate(rows) {
  const by = (key) => {
    const m = {};
    for (const r of rows) {
      const k = r[key] || 'unknown';
      const e = (m[k] = m[k] || { count: 0, ms: 0 });
      e.count++; e.ms += r.ms || 0;
    }
    for (const e of Object.values(m)) e.minutes = minutes(e.ms);
    return m;
  };
  const waitedMs = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const byProject = Object.entries(by('project')).map(([project, e]) => ({ project, ...e })).sort((a, b) => b.ms - a.ms);
  return { waitedMs, waitedMinutes: minutes(waitedMs), count: rows.length, byKind: by('kind'), byProject, byAnswer: by('answered'), byAgent: by('agent') };
}

// Totals for the last `range` (day | week | month, rolling, ending now) and the same span before it.
async function summary(range = 'week', now = Date.now()) {
  if (!RANGES[range]) range = 'week';
  const span = RANGES[range] * DAY;
  const from = now - span, prevFrom = from - span;
  const rows = await readRows();
  const cur = aggregate(rows.filter((r) => r.end > from && r.end <= now));
  const prev = aggregate(rows.filter((r) => r.end > prevFrom && r.end <= from));
  return {
    range, from, to: now, ...cur,
    previous: { from: prevFrom, to: from, waitedMs: prev.waitedMs, waitedMinutes: prev.waitedMinutes, count: prev.count },
    change: {
      waitedMs: cur.waitedMs - prev.waitedMs,
      count: cur.count - prev.count,
      pct: prev.waitedMs ? Math.round(((cur.waitedMs - prev.waitedMs) / prev.waitedMs) * 100) : null,
    },
    open: open.size,
  };
}

module.exports = { observe, finish, summary, FILE };
