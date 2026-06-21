import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getCachedCrawl, setCachedCrawl } from "../services/cache";
import { escapeHtml, sendKnowledgeBaseDocument, normalizeUrl } from "../utils/formatter";
import { BotContext } from "../types";
import { getActivePreset, getPreset, saveSession, saveJob, getCancelSignal } from "../services/db";

/** Default crawl depth. */
const DEFAULT_DEPTH = 1;

/** Default max pages. */
const DEFAULT_LIMIT = 50;

/**
 * Handle /crawl <url> [depth] [limit] command.
 * Starts interactive wizard if no URL is provided.
 */
export async function handleCrawl(ctx: BotContext): Promise<void> {
	const env = ctx.env;
	const text = ctx.message?.text ?? "";
	const parts = text.split(/\s+/);
	const userId = ctx.from?.id;
	
	if (!userId) return;

	// Check if this is an implicit call (just sent a URL directly) or explicit /crawl
	const isImplicit = parts[0]?.startsWith("http://") || parts[0]?.startsWith("https://");
	
	let url = isImplicit ? parts[0] : parts[1];
	let depthStr = isImplicit ? parts[1] : parts[2];
	let limitStr = isImplicit ? parts[2] : parts[3];

	// If no URL provided at all, start the wizard
	if (!url && !isImplicit && parts[0] === "/crawl") {
		await saveSession(env.CRAWL_CACHE, userId, { step: "AWAIT_URL" });
		await ctx.reply("🪄 <b>Interactive Crawl Wizard</b>\n\nLet's get started. Please send me the <b>URL</b> you want to crawl (e.g. <code>https://docs.example.com</code>).", { parse_mode: "HTML" });
		return;
	}

	// Validate URL
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error("Invalid protocol");
		}
		url = normalizeUrl(url); // Apply URL normalization
	} catch {
		await ctx.reply(`❌ Invalid URL: <code>${escapeHtml(url)}</code>\n\nPlease provide a valid http:// or https:// URL.`, { parse_mode: "HTML" });
		return;
	}

	// Determine defaults based on active preset
	let activeDepth = DEFAULT_DEPTH;
	let activeLimit = DEFAULT_LIMIT;

	const presetName = await getActivePreset(env.CRAWL_CACHE, userId);
	if (presetName) {
		const preset = await getPreset(env.CRAWL_CACHE, userId, presetName);
		if (preset) {
			activeDepth = preset.depth;
			activeLimit = preset.limit;
		}
	}

	const depth = depthStr ? parseInt(depthStr, 10) : activeDepth;
	const limit = limitStr ? parseInt(limitStr, 10) : activeLimit;
	const finalDepth = isNaN(depth) || depth < 0 ? activeDepth : depth;
	const finalLimit = isNaN(limit) || limit < 1 ? activeLimit : Math.min(limit, 100);

	try {
		// 1. Check KV cache first
		const cached = await getCachedCrawl(env.CRAWL_CACHE, url);
		if (cached) {
			await sendKnowledgeBaseDocument(ctx, cached.url, cached.pages, null, cached.finished, cached.total);
			return;
		}

		// 2. Start the crawl job (fast API call)
		const { startCrawl, pollCrawl } = await import("../services/crawler");
		
		const crawlRequest = {
			url,
			depth: finalDepth,
			limit: finalLimit,
			formats: ["markdown"] as ("markdown" | "html" | "json")[],
			crawlPurposes: ["ai-input", "ai-train", "search"]
		};

		const jobId = await startCrawl(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, crawlRequest);

		// Save job to DB immediately
		await saveJob(env.CRAWL_CACHE, userId, {
			jobId,
			url,
			status: "running",
			timestamp: Date.now()
		});

		// 3. Send "working" indicator & Job ID immediately
		let msg = `🔍 <b>Analyzing URL & Initializing Crawl...</b>\n\n` +
				`🔗 <b>Target:</b> ${escapeHtml(url)}\n` +
				`🗂 <b>Depth:</b> ${finalDepth} | <b>Max Pages:</b> ${finalLimit}\n`;
				
		if (presetName && !depthStr && !limitStr) {
			msg += `⚙️ <i>Using active preset: ${presetName}</i>\n`;
		}

		msg += `🆔 <b>Task ID:</b> <code>${jobId}</code>\n\n` +
				`<i>⚙️ Extracting data and formatting for AI. This usually takes 1-5 minutes.</i>\n\n` +
				`⚠️ <b>Note:</b> <i>If Cloudflare limits pause the bot in the background, you might not receive the file automatically. If it takes too long, simply tap</i> <code>/status ${jobId}</code> <i>to fetch your results manually!</i>`;

		await ctx.reply(msg, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });

		// 4. Move polling and document generation to a background task
		const backgroundTask = async () => {
			try {
				const checkAbort = async () => await getCancelSignal(env.CRAWL_CACHE, jobId);
				const result = await pollCrawl(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, jobId, checkAbort);
				
				const pagesArray = result.result.records ?? result.result.pages ?? [];
				const total = result.result.total ?? pagesArray.length;
				const finished = result.result.finished ?? pagesArray.length;

				// Cache the result
				await setCachedCrawl(env.CRAWL_CACHE, url, pagesArray, total, finished);

				// Update Job Status
				await saveJob(env.CRAWL_CACHE, userId, {
					jobId,
					url,
					status: "completed",
					timestamp: Date.now()
				});

				// Generate and send Markdown document
				await sendKnowledgeBaseDocument(ctx, url, pagesArray, jobId, finished, total);
			} catch (bgError) {
				const errMsg = bgError instanceof Error ? bgError.message : String(bgError);
				
				let newStatus = "errored";
				if (errMsg.includes("cancelled_by_user")) newStatus = "cancelled";
				else if (errMsg.includes("timeout") || errMsg.includes("deadline")) newStatus = "timed_out";

				// Update Job Status to errored/cancelled/timed_out
				await saveJob(env.CRAWL_CACHE, userId, {
					jobId,
					url,
					status: newStatus,
					timestamp: Date.now()
				});

				console.error(JSON.stringify({ message: "background polling failed", jobId, error: errMsg }));
				
				if (newStatus === "cancelled") {
					await ctx.reply(`🛑 <b>Job Cancelled Successfully:</b> <code>${jobId}</code>`, { parse_mode: "HTML" });
				} else {
					await ctx.reply(
						`❌ <b>Crawl polling failed for job <code>${jobId}</code></b>\n` +
						`<pre>${escapeHtml(errMsg)}</pre>\n` +
						`Use <code>/status ${jobId}</code> to check if it completed successfully on Cloudflare's end.`,
						{ parse_mode: "HTML" }
					);
				}
			}
		};

		// Instruct Cloudflare to keep the Worker alive to finish the background task
		ctx.executionCtx.waitUntil(backgroundTask());

	} catch (error) {
		console.error(JSON.stringify({ message: "crawl command failed to start", url, error: error instanceof Error ? error.message : String(error) }));
		await ctx.reply(
			`❌ <b>Crawl failed to start</b>\n\n<pre>${escapeHtml(error instanceof Error ? error.message : String(error))}</pre>\n\nTry again or check the URL is accessible.`,
			{ parse_mode: "HTML" }
		);
	}
}
