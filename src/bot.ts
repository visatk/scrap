import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { handleStart } from "./commands/start";
import { handleCrawl } from "./commands/crawl";
import { handleStatus } from "./commands/status";

/**
 * Create and configure the grammY Bot instance.
 *
 * The bot is created per-request because the BOT_TOKEN comes from
 * environment secrets, which are only available at request time in Workers.
 *
 * @param token - Telegram Bot API token
 * @param env - Cloudflare Worker Env bindings
 * @param executionCtx - Cloudflare Worker ExecutionContext
 */
export function createBot(token: string, env: Env, executionCtx: ExecutionContext): Bot {
	const bot = new Bot(token);

	// ── Plugins ──────────────────────────────────────────────────────────
	bot.api.config.use(autoRetry());

	// ── Middleware: inject env into context ──────────────────────────────
	bot.use(async (ctx, next) => {
		// Attach env to the context so command handlers can access bindings
		(ctx as unknown as { env: Env; executionCtx: ExecutionContext }).env = env;
		(ctx as unknown as { env: Env; executionCtx: ExecutionContext }).executionCtx = executionCtx;
		await next();
	});

	// ── Commands ─────────────────────────────────────────────────────────
	bot.command("start", handleStart);
	bot.command("help", handleStart);
	bot.command("crawl", handleCrawl);
	bot.command("status", handleStatus);

	// ── Default handler ─────────────────────────────────────────────────
	bot.on("message:text", async (ctx) => {
		const text = ctx.message.text.trim();
		if (text.startsWith("http://") || text.startsWith("https://")) {
			// Treat it exactly like a /crawl command
			return handleCrawl(ctx);
		}

		await ctx.reply(
			`🤔 <b>I didn't quite catch that.</b>\n\n` +
				`To start a crawl, simply send me a valid website URL (starting with <code>http://</code> or <code>https://</code>).\n\n` +
				`Type /help to see all available commands!`,
			{ parse_mode: "HTML" }
		);
	});

	// ── Error handler ───────────────────────────────────────────────────
	bot.catch((err) => {
		console.error(
			JSON.stringify({
				message: "bot error",
				error: err.message,
				stack: err.stack,
				ctx: {
					updateId: err.ctx?.update?.update_id,
					chatId: err.ctx?.chat?.id,
				},
			}),
		);
	});

	return bot;
}
