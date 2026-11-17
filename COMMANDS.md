# TitanBot MBVN — Commands Guide & Starter Setup (99 Slash Commands)

Use `/commands dashboard` in your Discord server to enable or disable any of the **99 slash commands** or **18 categories** below.

---

## 🎯 Recommended Starter Setup (What to Enable First)

### Phase 1: Keep Enabled Right Now (Core Server Foundation)
Start with these **7 categories** so your server is secure, welcoming, and easy to moderate without overwhelming members:
1. **Core (7 commands)** — Always keep enabled (`/configwizard`, `/commands`, `/help`, `/ping`, `/stats`, `/uptime`, `/support`).
2. **Moderation (16 commands)** — Essential for you and your `@Moderator` role (`/warn`, `/timeout`, `/kick`, `/ban`, `/purge`, `/lock`, `/cases`).
3. **Logging (1 command)** — Run **`/logging`** once to turn on audit logs in your new `#bot-logs` channel.
4. **Verification (3 commands)** *OR* **Welcome (4 commands)** — Pick **one** onboarding flow:
   - Use **`/verification setup`** if you want new members to click a "✅ Verify" button to get `@Member`, plus **`/welcome`** for join messages.
   - Or use **`/autorole add`** if you want them to get `@Member` automatically without clicking a button.
5. **Ticket (4 commands)** — Run **`/ticket`** to post a "Create Support Ticket" button panel so members can open private help channels with staff.
6. **Utility (8 commands)** — Handy everyday commands (`/serverinfo`, `/userinfo`, `/avatar`, `/report`).

### Phase 2: Enable Later (Or Disable for Now in `/commands dashboard`)
If you want a clean, focused server while you finish setting up, you can temporarily **disable** these categories in `/commands dashboard` and turn them on as your community grows:
- **Economy (19 commands)** — Disable for now unless you want virtual currency, gambling, and a server shop right away *(especially `/slut`, `/crime`, `/rob` if you want a family-friendly server)*.
- **Leveling (6 commands)** — Enable when you're ready for chat XP and rank leaderboards.
- **Music (5 commands)** & **JoinToCreate (1 command)** — Enable when you start using voice channels.
- **Community Applications (2 commands)**, **Giveaway (4 commands)**, **Birthday (1 command)**, **Reaction Roles (1 command)**, **ServerStats (1 command)** — Enable as needed when you want staff application forms, giveaways, or self-assignable role panels.

---

## 📖 Summary of All 99 Slash Commands (18 Categories)

### 1. ⚙️ Core (7 Commands)
*Protected system and bot health commands.*
- **`/commands`** (`dashboard`, `enable`, `disable`) — Enable or disable any command or category for this server.
- **`/configwizard`** — Open the server configuration dashboard (prefix, mod role, log channel) and DM setup wizard.
- **`/help`** — Interactive help menu browsing all command categories.
- **`/ping`** — Check bot response latency and Discord WebSocket API speed.
- **`/stats`** — View bot memory, CPU, uptime, and server statistics.
- **`/support`** — Get a link to the support server.
- **`/uptime`** — Check how long the bot has been online since last restart.

### 2. 🛡️ Moderation (16 Commands)
*Usable by Server Admins and anyone with your configured `@Moderator` role.*
- **`/warn`** — Issue a formal warning to a user (saved to database).
- **`/warnings`** — View or clear active warnings for a user.
- **`/cases`** — Look up moderation case history and audit records.
- **`/usernotes`** — Attach private staff-only notes to a user's profile.
- **`/timeout`** — Mute/timeout a member for a set duration.
- **`/untimeout`** — Remove an active timeout from a member.
- **`/kick`** — Kick a member from the server.
- **`/ban`** — Ban a user from the server.
- **`/unban`** — Unban a user by User ID.
- **`/masskick`** — Kick multiple users at once.
- **`/massban`** — Ban multiple users at once.
- **`/purge`** — Bulk-delete a specified number of recent messages in a channel.
- **`/lock`** — Lock the current channel so `@everyone` cannot send messages.
- **`/unlock`** — Unlock a locked channel.
- **`/say`** — Make the bot send a plain text announcement in a channel.
- **`/dm`** — Send a direct message to a server member through the bot.

### 3. 📋 Logging (1 Command)
- **`/logging`** — Open the interactive Logging Dashboard to set log channels (`#bot-logs`), ignore channels/users, and toggle which events are logged.

### 4. ✅ Verification (3 Commands)
- **`/verification`** (`setup`, `remove`, `dashboard`) — Post a "✅ Verify" button panel that grants `@Member` when clicked, or open the verification dashboard.
- **`/autoverify`** — Configure automatic verification rules (such as account age gates).
- **`/verify`** — Slash command fallback for a user to verify themselves.

### 5. 👋 Welcome & Onboarding (4 Commands)
- **`/welcome`** — Configure welcome messages/embeds when a new member joins.
- **`/goodbye`** — Configure goodbye messages when a member leaves.
- **`/greet`** — Unified dashboard to manage both welcome and goodbye settings.
- **`/autorole`** (`add`, `remove`, `list`) — Automatically assign a role on join *(keep empty if using `/verification`)*.

### 6. 🎫 Support Tickets (4 Commands)
- **`/ticket`** — Set up the interactive "Open a Ticket" panel, staff roles, categories, and limits.
- **`/claim`** — Claim an open support ticket so other staff know you're handling it.
- **`/priority`** — Set a ticket's urgency level (`low`, `medium`, `high`, `urgent`).
- **`/close`** — Close and archive the current support ticket channel.

### 7. 🧰 Utility (8 Commands)
- **`/serverinfo`** — View detailed stats, roles, and creation date for the server.
- **`/userinfo`** — View a member's join date, account age, and roles.
- **`/avatar`** — Display a user's full-size profile picture.
- **`/report`** — Let members privately report a user to staff (or configure the report channel).
- **`/firstmsg`** — Get a jump link to the very first message in the current channel.
- **`/todo`** — Personal or shared interactive to-do list.
- **`/weather`** — Look up real-time weather for any city.
- **`/wipedata`** — Lets a user delete their own personal economy/leveling data.

### 8. 🛠️ Tools (11 Commands)
- **`/embedbuilder`** — Build and post a custom Discord embed with live preview.
- **`/poll`** — Create a reaction/button poll with up to 10 choices.
- **`/countdown`** — Start a live-updating countdown timer in chat.
- **`/randomuser`** — Pick a random member from the server (great for quick drawings).
- **`/calculate`** — Evaluate a math expression.
- **`/baseconvert`** — Convert numbers between binary, decimal, and hex.
- **`/generatepassword`** — Generate a random secure password (sent ephemerally).
- **`/hexcolor`** — Preview a random or specific hex color code.
- **`/shorten`** — Shorten a long URL via `is.gd`.
- **`/time`** — Check the current time across world timezones.
- **`/unixtime`** — Convert or get the current Discord Unix timestamp.

### 9. 🎭 Reaction Roles (1 Command)
- **`/reactroles`** — Create and manage self-assignable role panels (members click buttons/reactions to get roles like notifications or game tags).

### 10. 📊 Server Stats (1 Command)
- **`/serverstats`** — Create auto-updating voice channel counters at the top of your server (e.g., `Members: 120`, `Bots: 4`, updated every 15 mins).

### 11. 📝 Community Applications (2 Commands)
- **`/app-admin`** (`setup`, `review`, `list`, `dashboard`) — Create custom application forms (e.g., Moderator Application) and review submissions with Approve/Deny buttons.
- **`/apply`** (`submit`, `status`, `list`) — Used by members to apply for open positions/roles.

### 12. 🎉 Giveaways (4 Commands)
- **`/gcreate`** — Start a timed giveaway with automatic winner selection.
- **`/gend`** — End an active giveaway early and pick winners immediately.
- **`/greroll`** — Reroll new winner(s) for an ended giveaway.
- **`/gdelete`** — Delete a giveaway and remove it from the database.

### 13. ⭐ Leveling & XP (6 Commands)
- **`/rank`** — View your (or another member's) current XP and level card.
- **`/leaderboard`** — Show the top 10 highest-level members in the server.
- **`/level`** — Admin dashboard to configure XP rates, level-up messages, and milestone role rewards.
- **`/leveladd`** — Give levels to a user (Admin).
- **`/levelremove`** — Remove levels from a user (Admin).
- **`/levelset`** — Set a user's exact level (Admin).

### 14. 💰 Economy & Shop (19 Commands)
- **`/economy`** (`dashboard`) — Admin dashboard to configure economy settings and currency.
- **`/shop-config`** — Admin command to add/edit buyable roles and items in the server shop.
- **`/balance`** — Check wallet and bank balance.
- **`/daily`** — Claim a daily currency reward.
- **`/work`** — Work a shift for guaranteed currency.
- **`/beg`** — Beg for small spare change.
- **`/fish`** — Catch fish to sell for coins.
- **`/mine`** — Mine ores for coins.
- **`/deposit`** — Move cash from wallet into the safe bank.
- **`/withdraw`** — Withdraw cash from bank to wallet.
- **`/pay`** — Send currency to another member.
- **`/shop`** — Browse items/roles available in the server shop.
- **`/buy`** — Purchase an item or role from the shop.
- **`/inventory`** — View purchased items.
- **`/eleaderboard`** — Top 10 richest users in the server.
- **`/gamble`** — Bet coins for a chance to double them.
- **`/crime`** — High-risk action that either pays out or fines you.
- **`/rob`** — Attempt to steal wallet cash from another member.
- **`/slut`** — Risky random payout/loss command *(Tip: many servers disable `/slut` in `/commands dashboard`)*.

### 15. 🎵 Music (5 Commands)
- **`/play`** — Play a song or playlist in voice chat via Lavalink v4.
- **`/music`** — Interactive player controls (pause, skip, loop, volume, shuffle, 24/7 mode).
- **`/nowplaying`** — Show the current track and progress bar.
- **`/queue`** — View the upcoming song queue.
- **`/join`** — Have the bot join your voice channel.

### 16. 🔊 Join to Create Voice (1 Command)
- **`/jointocreate`** — Configure a "➕ Join to Create" lobby voice channel that automatically spawns personal temporary voice rooms for members.

### 17. 🎂 Birthday (1 Command)
- **`/birthday`** (`set`, `info`, `list`, `remove`, `next`, `setchannel`) — Let members save their birthday and have the bot announce birthdays daily in a chosen channel.

### 18. 🎲 Fun & Minigames (4 Commands)
- **`/count`** — Set up a `#counting` channel game where members count upward one by one.
- **`/fight`** — Challenge another member to a turn-based 1v1 text battle.
- **`/flip`** — Flip a coin (Heads or Tails).
- **`/roll`** — Roll dice (`1d6`, `2d20+5`, etc.).
