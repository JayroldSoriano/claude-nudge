# Claude Nudge: monetization plan

Written 2026-10-29. Assumes the honest reality: almost every user is a developer who could
rebuild this in an afternoon, with Claude Code itself. Nobody pays for the code. People pay for
(1) not having to maintain it, (2) things that need infrastructure they don't want to run,
(3) fun. The plan is built around those three.

## 0. Fix these before trying to make a cent

| Blocker | Why it matters | Action |
| --- | --- | --- |
| Repo is private, no LICENSE | Devs won't install a closed-source thing that reads their Claude messages. Open source is the distribution engine, not the enemy. | Make public, add MIT. |
| Name and mascot are Anthropic's ("Claude", "Clawd") | Selling a product named after a trademark, with the owner's mascot, is the one thing that can get the Web Store listing pulled or draw a letter. Free fan projects get tolerated; paid ones get noticed. | Rename to a "for Claude Code" form (e.g. **Nudge for Claude Code**). Give the mascot its own name and a visibly original design. Keep "works with Claude Code" in the description, not the product name. Read Anthropic's brand guidelines page before launch. (Not legal advice.) |
| Three-step install (relay, hooks, load unpacked) | Every extra step halves installs. | Ship `npx claude-nudge setup`: installs hooks, starts the relay, installs the launch agent, prints "now install the extension" link. Web Store listing handles the extension half. |
| No Web Store listing | The listing is the SEO surface and the trust signal. | $5 developer account. Needs a privacy policy URL and a permission justification for `<all_urls>` + `scripting` ("renders the mascot on whatever tab is active; nothing leaves the machine; relay is localhost-only"). Expect a slower review because of `<all_urls>`. |
| No demo asset | The escalating mascot is the entire pitch. | One 12-second GIF: doomscrolling -> corner wave -> walks to center -> grows and taps foot -> alarm. Make it once, reuse everywhere. |
| No landing page | Every channel needs one link. | GitHub Pages: GIF above the fold, one install command, Web Store button, Pro button, GitHub stars badge. |

## 1. Tiers

Never paywall anything that exists in the repo today. The free tier is the marketing budget.

### Free (open source, forever)
Everything currently shipped: nudges for question / permission / done / idle, escalation, snooze, settings, the relay, the hooks installer.

### Pro: one-time $19 at launch, $29 after (license key)
Payment via ExtensionPay or Lemon Squeezy (Chrome Web Store has no built-in payments). Features chosen because a developer *could* build each one but won't bother for a weekend:

- **Reply from the bubble.** Answer `AskUserQuestion` options and approve permissions without leaving Chrome. (Already on the roadmap. This is the headline Pro feature.)
- **Jump back.** One button focuses the terminal app (relay runs `osascript`).
- **Multi-session view.** When 3 Claude Code sessions run, the bubble shows which one wants you.
- **Mascot and sound packs.** Original characters, holiday skins, alarm sounds. Cosmetics are the lowest-rebuild-incentive, highest-fun purchase in dev tools (see Slack emoji packs, Oh My Zsh themes, iTerm color schemes people pay for).
- **Waiting stats.** "Claude waited on you 47 minutes this week." Shareable screenshot = free marketing.

Why $19 one-time rather than a subscription: it's under one hour of a developer's time, it removes the "I'll just build it" calculation, and one-time purchases convert 3-5x better than subscriptions for a tool with no running cost.

### Cloud: $4/month (the only subscription)
A hosted relay that pushes nudges off the machine:

- Phone (push via PWA, or Telegram / Discord / Slack DM).
- Any browser on any machine (desktop at home, laptop at the cafe) with no port forwarding.
- Long Claude runs: start a task, walk away, get pinged when it needs you.

This is the actual moat. A developer rebuilding this has to run a server, handle auth, keep a WebSocket alive on mobile, and pay for push. Most won't. It's a subscription because it has a per-user running cost. Launch it only after the free tier has ~1,000 installs; before that, the demand isn't proven and the infra is a distraction.

### Team: $6/seat/month (later, only if asked)
Shared Slack channel delivery for a team running agent fleets, admin console, aggregate "time agents spent blocked on humans". Do not build until at least five separate people ask for it. If they do, this is where real money is: engineering managers buying for 20 seats beat 200 individual $19 sales.

### Sponsorship (zero effort, start day one)
GitHub Sponsors + Buy Me a Coffee. A "Sponsor" link in the popup footer and README. Expect tens of dollars a month; it's a signal, not an income.

### Indirect (probably the largest return)
A visible, shareable Claude Code tool is reputation capital: inbound contract work setting up Claude Code for teams, speaking slots, a newsletter audience, job offers. Treat every launch post as a portfolio piece. Put your name and a contact link on the landing page.

## 2. Realistic numbers

Be sober. Most developer-tool extensions make under $100/month.

| Metric | Conservative | Decent launch |
| --- | --- | --- |
| Installs by month 3 | 300 | 2,000 |
| Free -> Pro conversion | 1% | 3% |
| Pro revenue, first quarter | ~$60 | ~$1,200 |
| Cloud subscribers by month 6 | 10 ($40/mo) | 60 ($240/mo) |
| GitHub stars by month 3 | 150 | 1,500 |

The decent column needs one of: a Show HN front page, a repost from an Anthropic DevRel account, or a viral GIF on X. Plan the launch to make all three possible.

## 3. Sequence

1. **Week 0 (prep):** rename, MIT license, public repo, `npx` installer, GIF, landing page, Web Store submission (submit early; review takes days to weeks with `<all_urls>`), GitHub Sponsors on.
2. **Week 1 (launch):** see `launch-copy.md`. Free only. Collect emails on the landing page ("notify me about Pro").
3. **Weeks 2-6:** ship reply-from-bubble and jump-back. Launch Pro at $19 to the email list first, then publicly. Post the "Claude waited on you N minutes" stat screenshots.
4. **Month 3+:** if installs > 1,000, build Cloud. If teams ask, scope Team.

## 4. Metrics to watch

- Web Store installs and weekly active users (Web Store dashboard).
- Landing page -> install command copy rate (Plausible or Umami, both privacy-friendly and cheap).
- Free -> Pro conversion (ExtensionPay / Lemon Squeezy dashboards).
- GitHub stars and issues opened (issues = people actually using it).
- Which channel each install came from: use UTM links per channel on the landing page.
