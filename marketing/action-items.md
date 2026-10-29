# Action items

Tags: **[you]** only you can do it. **[claude]** can be done in a Claude Code session. **[both]** you decide, Claude executes.
Order matters within each phase. Don't start a phase until the one before it is done.

## Phase 0: decisions (one sitting, today)

- [ ] **[you]** Pick the product name. Suggested: "Nudge for Claude Code". Must not start with "Claude".
- [ ] **[you]** Pick the mascot's name and decide who redraws it (you, a pixel artist on Fiverr for ~$50, or Claude adjusts the sprite). It must look original, not Clawd.
- [ ] **[you]** Read Anthropic's brand guidelines page and confirm the name/mascot plan is fine with it.
- [ ] **[you]** Buy a domain for the landing page and future Cloud relay (e.g. nudge.dev-style; check availability).
- [ ] **[you]** Confirm pricing: Free / Pro $19 once / Cloud $5 mo / Team $8 seat.

## Phase 1: repo ready for the public (week 0)

- [ ] **[claude]** Add MIT LICENSE.
- [ ] **[claude]** Rename across manifest, README, package.json, popup, relay log lines.
- [ ] **[both]** Replace the mascot sprite and icons with the original design.
- [ ] **[claude]** Build the one-command installer: `npx <name> setup` installs hooks, starts the relay, installs the launch agent, prints the extension link. (Needs the npm package name free; check first.)
- [ ] **[claude]** Write PRIVACY.md and publish it as a page (required by the Web Store).
- [ ] **[claude]** Landing page on GitHub Pages: GIF above the fold, install command, Web Store button, GitHub stars, email capture, your name and contact.
- [ ] **[you]** Create an email-capture form (Buttondown or Tally are free) and give Claude the embed.
- [ ] **[you]** Enable GitHub Sponsors on your account; add the Sponsor link to README and popup.
- [ ] **[you]** Flip the repo to public.
- [ ] **[you]** Add Plausible or Umami to the landing page (or skip analytics for launch).

## Phase 2: Chrome Web Store (submit at least one week before launch)

- [ ] **[you]** Register a Chrome Web Store developer account ($5 one-time).
- [ ] **[you]** Record the 15-second demo per the script in launch-copy.md. Export GIF and 9:16 MP4.
- [ ] **[both]** Produce 5 screenshots at 1280x800 and the 440x280 promo tile (list in launch-copy.md).
- [ ] **[claude]** Zip the extension folder for upload; bump the version to 1.0.0.
- [ ] **[you]** Submit the listing with the description and permission justification from launch-copy.md. Expect a slow review because of `<all_urls>`.

## Phase 3: launch week (only after the listing is approved)

- [ ] **[you]** Fill in LANDING_URL, STORE_URL, REPO_URL in launch-copy.md, with a UTM per channel.
- [ ] **[you]** Mon: post in the Anthropic Discord showcase channel.
- [ ] **[you]** Tue 9am ET: X thread with the GIF. 10am: r/ClaudeAI and r/ClaudeCode. Same day: Bluesky, Mastodon.
- [ ] **[you]** Wed 8:30am ET: Show HN. Stay on it for two hours.
- [ ] **[you]** Thu: LinkedIn post. PR to awesome-claude-code. r/chrome_extensions, r/SideProject.
- [ ] **[you]** Fri: submit to TLDR, Console.dev, JavaScript Weekly, Bytes.
- [ ] **[both]** Weekend: Dev.to article on Claude Code hooks (outline in launch-copy.md; Claude drafts, you edit).
- [ ] **[you]** Next Tue: Product Hunt.
- [ ] **[you]** Every week after: search X and Reddit for "missed the permission prompt" and reply with the GIF.

## Phase 4: Pro (weeks 2 to 6)

- [ ] **[you]** Create an ExtensionPay or Lemon Squeezy account for license keys.
- [ ] **[claude]** Reply to AskUserQuestion from the bubble.
- [ ] **[claude]** Jump-back button that focuses the terminal app.
- [ ] **[claude]** Multi-session grouping in the bubble.
- [ ] **[claude]** Weekly "Claude waited on you N minutes" stats with a share-as-image button.
- [ ] **[claude]** License-key gate in the popup; Pro features unlock with the key.
- [ ] **[both]** First mascot and sound pack.
- [ ] **[you]** Launch Pro at $19 to the email list first, then publicly one week later.

## Phase 5: Cloud (start only after ~1,000 installs)

- [ ] **[you]** Cloudflare account; point the domain at it.
- [ ] **[claude]** Hosted relay (Worker + Durable Object for WebSockets), per-user tokens, hook posts to the cloud URL when a token is set.
- [ ] **[claude]** PWA with Web Push for phone nudges.
- [ ] **[claude]** Approve tool calls from the phone through a blocking PreToolUse hook.
- [ ] **[claude]** Telegram bot and Slack/Discord DM delivery.
- [ ] **[claude]** Weekly waiting-time email.
- [ ] **[you]** Stripe or Lemon Squeezy subscription at $5/mo, $48/yr; grandfather early subscribers.
- [ ] **[claude]** Adapters for Codex CLI, Gemini CLI, OpenCode to widen the market.
- [ ] **[you]** When five people ask for team features, scope the Team tier.
