# Launch copy and channel plan

Product name used below: **Nudge for Claude Code** (see monetization-plan.md on why not "Claude Nudge").
Mascot name used below: **Nudge** (placeholder; pick an original name and design before launch).
Replace `LANDING_URL`, `STORE_URL`, `REPO_URL` before posting. Use a different UTM per channel.

---

## Positioning

**One-liner:** A pixel mascot waves at you in Chrome when Claude Code needs you, so you stop doomscrolling and go back to the terminal.

**Taglines (pick one per channel):**
- "Claude is waiting. Nudge makes sure you know."
- "Stop checking the terminal. Let the terminal come to you."
- "The longer you ignore it, the harder it tries."
- "Your Claude Code session has a face now."

**Audience:** developers who run Claude Code and tab over to a browser while it works. Secondary: anyone running long agent tasks who misses the permission prompt.

**The hook that makes it shareable:** escalation. Level 0 waves. Level 1 walks to center. Level 2 grows, gets annoyed, taps its foot. Level 3 sounds an alarm and roams. Every level is a clip.

---

## Chrome Web Store listing

**Name:** Nudge for Claude Code

**Short description (132 chars max):**
A pixel mascot waves in your browser when Claude Code has a question, needs permission, or is done. Local only, nothing leaves your Mac.

**Category:** Developer Tools

**Detailed description:**

You start a task in Claude Code, switch to the browser "just for a second", and ten minutes later Claude has been sitting on a permission prompt the whole time.

Nudge fixes that. A small pixel mascot appears in the corner of whatever tab you're on when Claude Code:

- asks you a question (with the options shown in a speech bubble)
- needs permission to run something
- finishes working (with its final message, expandable)
- has been idle waiting for you

The longer you ignore a question, the harder Nudge tries: it walks to the center, grows, taps its foot, and finally plays a short alarm. Pick Gentle or Full Chaos, or turn escalation off. Snooze for five minutes if you're mid-thought. Answering in the terminal dismisses it everywhere.

Privacy: everything stays on your machine. The extension talks to a tiny local relay on 127.0.0.1 that only accepts connections from the extension. No accounts, no analytics, no servers. Open source: REPO_URL

Setup takes one command plus this extension: LANDING_URL

Works with Claude Code hooks (Stop, Notification, AskUserQuestion). Requires Node 18+ and Chrome 116+.

**Permission justification (for the review form):**
- `<all_urls>` + `scripting`: the mascot must render on whichever tab is currently active, which can be any site. The content script only draws the mascot inside a closed shadow root and never reads page content.
- `tabs`: to find the active tab and follow the user across tabs and windows.
- `storage`: settings.
- `alarms`: auto-dismiss countdown and escalation timers.
- `notifications`: fallback system notification on pages where content scripts can't run (chrome:// pages, the Web Store).
- Single purpose: show Claude Code status in the browser. No data leaves the device.

**Screenshots (1280x800, in this order):**
1. Mascot waving in the corner over a docs page, bubble reads a real question with options.
2. Level 2: grown, annoyed, red shaking bubble. Caption: "The longer you wait, the harder it tries."
3. "Done" bubble showing Claude's final message, expandable.
4. Popup settings: modes, position, sound.
5. Terminal + browser side by side showing the hook firing.

**Promo tile (440x280):** mascot, large, mid-wave, with the tagline "Claude is waiting."

---

## Show HN

**Title (80 chars max):**
Show HN: A pixel mascot that nags you in Chrome when Claude Code needs input

**Body:**

I kept starting a Claude Code task, tabbing to the browser, and coming back ten minutes later to find it had been waiting on a permission prompt the whole time.

So I built a small Chrome extension. Claude Code hooks (Stop, Notification, AskUserQuestion) post to a zero-dependency Node relay on localhost, which pushes over WebSocket to the extension, which draws a pixel mascot on the active tab with a speech bubble showing the question or Claude's final message.

The part I had the most fun with is escalation. For questions and permissions Claude is blocked until you answer, so the mascot gets progressively harder to ignore: corner wave, then walks to the bottom center, then grows 1.8x with an annoyed face and foot-tapping, then a short alarm and it roams the bottom edge. The clock only runs while Chrome is focused, so time in the terminal doesn't count against you. There's a snooze.

Privacy: the relay binds to 127.0.0.1 and rejects any web-page origin, the content script lives in a closed shadow root and never reads the page, and messages are clipped to 1200 chars before leaving the relay.

It's MIT, about 1,500 lines, no build step. Setup is `npx claude-nudge setup` plus the extension. Repo: REPO_URL

Things I'd like to add: replying to questions from the bubble, a button that focuses the terminal, and grouping when several sessions run at once. Curious whether people would want a hosted relay that pushes to a phone for long-running tasks, or whether that's overkill.

**Posting notes:** Tuesday to Thursday, 8-10am US Eastern. Reply to every comment in the first two hours. Don't ask anyone to upvote. If it doesn't catch, you can repost once, two weeks later, with a different title.

---

## X / Twitter launch thread

**Tweet 1 (with the GIF):**
Claude Code finished 10 minutes ago and I was still scrolling.

So I built a pixel mascot that waves at you in Chrome when Claude needs you. Ignore it and it gets annoyed.

Free, open source, local only.
LANDING_URL

**Tweet 2 (clip of level 2 and 3):**
The longer you ignore a question, the harder it tries.

Level 1: walks to center
Level 2: grows, taps foot, bubble turns red
Level 3: alarm, roams the screen

There's a "Gentle" mode. And a snooze. I'm not a monster.

**Tweet 3 (screenshot of the bubble with a real question):**
It shows the actual question and the options, so you know whether it's worth tabbing back. "Done" nudges show Claude's final message.

**Tweet 4 (architecture diagram from the README):**
How it works: Claude Code hooks -> curl -> 60-line Node relay on localhost -> WebSocket -> extension. Nothing leaves your machine. The relay rejects any web-page origin.

**Tweet 5:**
Setup is one command plus the extension:
npx claude-nudge setup

Repo: REPO_URL
Web Store: STORE_URL

Would you want this to ping your phone for long runs? Thinking about it.

**Posting notes:** tag the official Claude account and use #ClaudeCode in tweet 1 only. Pin the thread. Quote-tweet it the next day with a different clip. Reply with the GIF to anyone tweeting "I keep missing Claude Code permission prompts" (search that weekly; there are a lot).

---

## Reddit: r/ClaudeAI and r/ClaudeCode

**Title:**
I built a pixel mascot that nags you in Chrome when Claude Code is waiting on you (free, open source, local only)

**Body:**

Problem: I start a task, tab to the browser, and come back to find Claude has been sitting on a permission prompt for ten minutes.

Fix: a Chrome extension. Claude Code hooks post to a tiny local relay, which tells the extension to draw a pixel mascot on whatever tab you're on, with a speech bubble showing the question (and options), the permission request, or Claude's final message when it's done.

If you ignore a question it escalates: wave -> walks to center -> grows and taps its foot -> short alarm. There's a Gentle mode and a snooze button. Answering in the terminal dismisses it.

Everything's local. The relay only listens on 127.0.0.1 and rejects web-page origins. No account, no analytics.

Setup: `npx claude-nudge setup` + install the extension. Repo: REPO_URL

Happy to answer questions about the hooks setup; the Notification matcher for permission_prompt / idle_prompt took some trial and error.

**Posting notes:** post the GIF as the media, link in the body. r/ClaudeAI allows self-made tools; read the current rules first. Cross-post to r/chrome_extensions and r/SideProject a day later. r/programming will remove it as self-promo; skip it.

---

## Product Hunt

**Name:** Nudge for Claude Code
**Tagline (60 chars):** A pixel mascot that nags you when Claude Code needs you
**Topics:** Developer Tools, Chrome Extensions, Artificial Intelligence, Productivity

**Description:**
Nudge shows a pixel mascot in your browser when Claude Code asks a question, needs permission, or finishes. The bubble shows the actual question so you know whether to tab back. Ignore it and it escalates: walks to center, grows, taps its foot, alarms. Gentle mode and snooze included. Runs entirely on your machine, open source.

**Maker's first comment:**
Hi PH! I built this because I kept leaving Claude Code blocked on a permission prompt while I "quickly checked something" in the browser. The escalation was supposed to be a joke and turned out to be the feature people like most. Everything's local: a 60-line relay on localhost, no accounts. Would love to hear whether you'd want it to ping your phone for long-running tasks.

**Posting notes:** launch on a Tuesday, 12:01am PT. Have the GIF as the first gallery item. Don't launch the same day as Show HN; space them a week apart.

---

## LinkedIn

I kept doing the same thing: kick off a task in Claude Code, switch to the browser "for a second", and come back to find it had been waiting on me for ten minutes.

So I built a small Chrome extension. A pixel mascot appears on whatever tab you're on when Claude needs you, with the question in a speech bubble. Ignore it and it gets progressively harder to ignore.

Two things I learned shipping it:

1. Claude Code hooks are a very good extension point. Stop, Notification, and AskUserQuestion cover everything a "needs attention" tool needs, and a shell script with curl is enough glue.
2. The silly feature (escalation) is the one people share. Build the fun thing.

Free and open source. Link in comments.

---

## Anthropic Discord (showcase / community channel)

Built a Chrome extension that shows a pixel mascot on your active tab when Claude Code asks a question, needs permission, or finishes. Hooks -> local relay -> WebSocket -> extension. It escalates if you ignore it (there's a gentle mode). Everything local, MIT. REPO_URL. Feedback on the hook setup welcome, especially from people running multiple sessions.

---

## Dev.to / Hashnode article

**Title:** I built a mascot that nags me when Claude Code needs input. Here's how Claude Code hooks work.

**Outline:**
1. The problem (two paragraphs, the doomscroll story).
2. What Claude Code hooks are: Stop, Notification, PreToolUse with the AskUserQuestion matcher, PostToolUse and UserPromptSubmit as "resolved" signals. Show the settings.json snippet.
3. The relay: why a 60-line zero-dep Node server, origin checking, why 127.0.0.1 only.
4. The extension: MV3 service worker holding the WebSocket, content script in a closed shadow root, following the active tab across windows, notification fallback for chrome:// pages.
5. Escalation design: why the clock only runs while Chrome is focused, the snooze.
6. What I'd do differently and what's next.
7. Install instructions and repo link.

Why this matters: the article ranks for "Claude Code hooks" searches long after the launch posts are gone, and it's the piece that establishes you as someone who knows the tool.

---

## Demo video script (15 seconds, no voiceover, captions only)

| Time | Shot | Caption |
| --- | --- | --- |
| 0-3s | Terminal: Claude Code asks "Run the migration? (y/n)". Cut to a browser scrolling a feed. | "You: just checking one thing" |
| 3-5s | Mascot pops in the corner, waves, bubble shows the question. | "Claude: hey" |
| 5-8s | Walks to bottom center, waves harder, hint "waiting 15s". | "Claude: hey." |
| 8-11s | Grows, annoyed face, foot tapping, red bubble shakes. | "Claude: HEY." |
| 11-13s | Alarm, hops along the bottom. | "Claude: !!!" |
| 13-15s | Click "Got it", mascot leaves, cut to terminal, type y. End card with install command. | "npx claude-nudge setup" |

Export as GIF (for X, Reddit, GitHub README) and as 9:16 MP4 (YouTube Shorts, TikTok, Instagram Reels). The Shorts version is the same cut with a trending sound.

---

## Where to post, in priority order

| Priority | Channel | Why | When |
| --- | --- | --- | --- |
| 1 | X / Twitter | Where the Claude Code community actually is. GIF-friendly. Anthropic DevRel reposts tools from here. | Launch day, morning US time |
| 1 | r/ClaudeAI, r/ClaudeCode | Highest-intent audience that exists. | Launch day |
| 1 | Show HN | Biggest single spike possible; front page = thousands of installs. | Launch week, Tue-Thu |
| 1 | Anthropic Discord | Direct line to power users and staff. | Launch day |
| 2 | Product Hunt | Reach outside the Claude bubble; badge for the landing page. | One week after Show HN |
| 2 | awesome-claude-code (GitHub) | Open a PR to add it. Lists drive steady installs for months. | Launch week |
| 2 | Dev.to / Hashnode | Long-tail search for "Claude Code hooks". | Week 2 |
| 2 | LinkedIn | Different audience, higher share of engineering managers (future Team tier). | Week 1 |
| 2 | Bluesky, Mastodon (fosstodon) | Small but engaged dev crowd, likes open source and local-only. | Launch day, same thread |
| 3 | YouTube Shorts / TikTok / Reels | The escalation clip is made for it. Cheap to try. | Week 2, then weekly clips |
| 3 | Newsletters: TLDR, Console.dev, JavaScript Weekly, Bytes | Submit via their forms. Console.dev features dev tools weekly. | Week 2 |
| 3 | Chrome Web Store search | Keywords in title and short description: "Claude Code", "notification", "agent". | At listing time |
| 3 | Reply marketing | Search X and Reddit weekly for "missed the permission prompt" / "didn't notice Claude finished". Reply with the GIF, no hard sell. | Ongoing |

## Launch week calendar

| Day | Do |
| --- | --- |
| Mon | Final GIF, landing page live, Web Store listing approved (submit at least a week earlier). Post in Anthropic Discord. |
| Tue | X thread 9am ET. Reddit r/ClaudeAI and r/ClaudeCode 10am ET. Bluesky/Mastodon. Reply to everything. |
| Wed | Show HN 8:30am ET. Stay on it for two hours. Quote-tweet the thread with the level 3 clip. |
| Thu | LinkedIn post. PR to awesome-claude-code. r/chrome_extensions, r/SideProject. |
| Fri | Newsletter submissions. Write the Dev.to article over the weekend. |
| Next Tue | Product Hunt. |
| Week 2+ | Dev.to article, first Shorts clip, weekly reply marketing, "waited on you N minutes" screenshots once that feature ships. |

## Ongoing content ideas (one per week)

- Each escalation level as its own 5-second clip with a one-line caption.
- "Claude waited on me 47 minutes this week" stat screenshot (once Pro ships). Invite people to share theirs.
- Mascot skin reveals (holiday skins, community-drawn skins).
- "Hooks you didn't know Claude Code had" thread, linking the article.
- Poll: Gentle or Full Chaos? (engagement bait that is also product research).
- Before/after: terminal-only vs with Nudge, time-to-respond.
