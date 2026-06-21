import type { Context } from "grammy";

/**
 * Handle /start and /help commands.
 * Sends a welcome message with usage instructions.
 */
export async function handleStart(ctx: Context): Promise<void> {
	const welcomeMessage =
		`🌲 <b>Pine — Docs Scraper Bot</b>\n\n` +
		`I crawl documentation websites and deliver the content right here in Telegram.\n\n` +
		`<b>Commands:</b>\n` +
		`/crawl <code>&lt;url&gt;</code> — Crawl a docs website\n` +
		`/crawl <code>&lt;url&gt; &lt;depth&gt; &lt;maxPages&gt;</code> — Crawl with options\n` +
		`/status <code>&lt;job_id&gt;</code> — Check crawl job status\n` +
		`/help — Show this message\n\n` +
		`<b>Examples:</b>\n` +
		`<code>/crawl https://developers.cloudflare.com/workers/</code>\n` +
		`<code>/crawl https://docs.example.com 2 20</code>\n\n` +
		`<b>Defaults:</b>\n` +
		`• Depth: 1 (start page + linked pages)\n` +
		`• Max pages: 10\n` +
		`• Output: Markdown content\n` +
		`• Cache: 1 hour TTL\n\n` +
		`Powered by Cloudflare Browser Rendering 🚀`;

	await ctx.reply(welcomeMessage, { parse_mode: "HTML" });
}
