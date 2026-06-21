import type { Context } from "grammy";

import { InlineKeyboard } from "grammy";

/**
 * Handle /start and /help commands.
 * Sends a welcome message with usage instructions.
 */
export async function handleStart(ctx: Context): Promise<void> {
	const welcomeMessage = 
		`🤖 <b>Welcome to Pine AI Crawler!</b>\n\n` +
		`I am an advanced web crawler designed to extract clean, perfectly formatted documentation for <b>AI Agents</b> (LLMs).\n\n` +
		`<b>🎯 How to use me:</b>\n` +
		`Just send me any website link, and I will deep-crawl it and give you a clean <code>.md</code> file!\n\n` +
		`<b>⚡ Advanced Commands:</b>\n` +
		`├ <code>/crawl &lt;url&gt; &lt;depth&gt; &lt;limit&gt;</code>\n` +
		`└ <code>/status &lt;job_id&gt;</code>\n\n` +
		`<b>💡 Example:</b>\n` +
		`<code>https://developers.cloudflare.com/workers/ 2 50</code>\n\n` +
		`<i>Ready when you are! Send me a link to begin.</i> 🚀`;

	const keyboard = new InlineKeyboard()
		.url("👨‍💻 Developer Channel", "https://t.me/drkingbd")
		.row()
		.url("📖 Cloudflare Docs", "https://developers.cloudflare.com/browser-rendering/");

	await ctx.reply(welcomeMessage, { 
		parse_mode: "HTML",
		reply_markup: keyboard,
		link_preview_options: { is_disabled: true }
	});
}
