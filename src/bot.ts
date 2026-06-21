import { Bot } from "grammy";
import { BotContext } from "./types";
import { handleStart } from "./commands/start";
import { handleCrawl } from "./commands/crawl";
import { handleStatus } from "./commands/status";
import { handleJobs } from "./commands/jobs";
import { handleResults } from "./commands/results";
import { handleCancel } from "./commands/cancel";
import { handleDelete } from "./commands/delete";
import { handlePresets, handleSavePreset, handleLoadPreset, handleDelPreset } from "./commands/presets";
import { getSession, saveSession, deleteSession } from "./services/db";

/**
 * Initialize and configure the Grammy Bot instance.
 */
export function createBot(token: string, env: Env, executionCtx: ExecutionContext): Bot<BotContext> {
	const bot = new Bot<BotContext>(token);

	// Inject env and executionCtx
	bot.use((ctx, next) => {
		ctx.env = env;
		ctx.executionCtx = executionCtx;
		return next();
	});

	// Command Handlers
	bot.command("start", handleStart);
	bot.command("help", handleStart);
	bot.command("crawl", handleCrawl);
	bot.command("status", handleStatus);
	bot.command("jobs", handleJobs);
	bot.command("results", handleResults);
	bot.command("cancel", handleCancel);
	bot.command("delete", handleDelete);
	bot.command("presets", handlePresets);
	bot.command("savepreset", handleSavePreset);
	bot.command("loadpreset", handleLoadPreset);
	bot.command("delpreset", handleDelPreset);

	// Wizard session cancellation
	bot.command("cancel_session", async (ctx) => {
		const userId = ctx.from?.id;
		if (userId) {
			const session = await getSession(ctx.env.CRAWL_CACHE, userId);
			if (session) {
				await deleteSession(ctx.env.CRAWL_CACHE, userId);
				await ctx.reply("🛑 <b>Wizard session aborted.</b>", { parse_mode: "HTML" });
				return;
			}
		}
		await ctx.reply("⚠️ No active wizard session to cancel.");
	});

	// Default message handler: intercepts URLs for direct crawling or wizard inputs
	bot.on("message:text", async (ctx) => {
		const text = ctx.message.text.trim();
		const userId = ctx.from?.id;
		const env = ctx.env;

		// 1. Wizard State Machine
		if (userId) {
			const session = await getSession(env.CRAWL_CACHE, userId);
			if (session) {
				if (session.step === "AWAIT_URL") {
					// Extremely basic URL validation
					if (!text.startsWith("http://") && !text.startsWith("https://")) {
						await ctx.reply("⚠️ Please provide a valid URL starting with http:// or https://");
						return;
					}
					session.url = text;
					session.step = "AWAIT_DEPTH";
					await saveSession(env.CRAWL_CACHE, userId, session);
					await ctx.reply("✅ URL saved.\n\nWhat <b>depth</b> would you like? (Reply with a number, e.g. <code>2</code>)", { parse_mode: "HTML" });
					return;
				} else if (session.step === "AWAIT_DEPTH") {
					session.depth = parseInt(text, 10) || 1;
					session.step = "AWAIT_LIMIT";
					await saveSession(env.CRAWL_CACHE, userId, session);
					await ctx.reply("✅ Depth saved.\n\nWhat <b>max pages (limit)</b> would you like? (Reply with a number, e.g. <code>50</code>)", { parse_mode: "HTML" });
					return;
				} else if (session.step === "AWAIT_LIMIT") {
					const limit = parseInt(text, 10) || 50;
					await deleteSession(env.CRAWL_CACHE, userId);
					
					// Override the message text to simulate a /crawl command with args
					ctx.message.text = `${session.url} ${session.depth} ${limit}`;
					return handleCrawl(ctx);
				}
			}
		}

		// 2. Direct URL fallback (Implicit Crawl)
		if (text.startsWith("http://") || text.startsWith("https://")) {
			return handleCrawl(ctx);
		}

		// 3. Unrecognized Command/Text
		await ctx.reply(
			`🤔 <b>I didn't quite catch that.</b>\n\n` +
				`To start a crawl, simply send me a valid website URL (starting with <code>http://</code> or <code>https://</code>) or type /crawl to start the wizard.\n\n` +
				`Type /help to see all available commands, or visit our <a href="https://t.me/drkingbd">Developer Channel</a> for updates!`,
			{ parse_mode: "HTML", link_preview_options: { is_disabled: true } }
		);
	});

	// Handle standard errors
	bot.catch((err) => {
		console.error(`Error while handling update ${err.ctx.update.update_id}:`);
		console.error(err.error);
	});

	return bot;
}
