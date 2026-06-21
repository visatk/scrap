import type { Context } from "grammy";

import { InlineKeyboard } from "grammy";

/**
 * Handle /start and /help commands.
 * Sends a welcome message with usage instructions.
 */
export async function handleStart(ctx: Context): Promise<void> {
	const welcomeMessage = 
		`🌲 <b>Welcome to Pine AI Crawler!</b>\n\n` +
		`I am an enterprise-grade web scraper built to extract deep, clean, and structured documentation tailored for <b>AI Agents</b> (LLMs).\n\n` +
		`<b>🎯 Quick Start:</b>\n` +
		`Send me any link to extract its contents immediately, or type /crawl to open the Interactive Wizard.\n\n` +
		`<b>🛠 Main Commands:</b>\n` +
		`├ <code>/crawl</code> - Start an interactive crawl wizard\n` +
		`├ <code>/jobs</code> - View your recent crawl tasks\n` +
		`└ <code>/status &lt;job_id&gt;</code> - Check live job progress\n\n` +
		`<b>⚙️ Advanced Tools:</b>\n` +
		`├ <code>/results &lt;job_id&gt;</code> - Download completed docs\n` +
		`├ <code>/cancel &lt;job_id&gt;</code> - Force stop a running task\n` +
		`├ <code>/delete &lt;job_id&gt;</code> - Remove task from history\n` +
		`├ <code>/presets</code> - Manage your crawler settings\n` +
		`└ <code>/cancel_session</code> - Abort an active wizard\n\n` +
		`<i>Ready to feed your AI? Send me a link to begin!</i> 🚀`;

	const keyboard = new InlineKeyboard()
		.url("👨‍💻 Developer Channel", "https://t.me/drkingbd");

	await ctx.reply(welcomeMessage, { 
		parse_mode: "HTML",
		reply_markup: keyboard,
		link_preview_options: { is_disabled: true }
	});
}
