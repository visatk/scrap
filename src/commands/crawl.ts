import type { Context } from "grammy";
import { InputFile } from "grammy";
import { crawlUrl } from "../services/crawler";
import { getCachedCrawl, setCachedCrawl } from "../services/cache";
import { generateAiKnowledgeBase, escapeHtml } from "../utils/formatter";

/** Default crawl depth. */
const DEFAULT_DEPTH = 1;

/** Default max pages. */
const DEFAULT_LIMIT = 50;

/**
 * Parse the /crawl command arguments.
 * Format: /crawl <url> [depth] [limit]
 */
function parseArgs(text: string): {
	url: string | null;
	depth: number;
	limit: number;
} {
	const parts = text.split(/\s+/);
	
	// If the text starts with http:// or https://, the user didn't type /crawl
	const isDirectUrl = parts[0]?.startsWith("http://") || parts[0]?.startsWith("https://");
	
	const url = isDirectUrl ? parts[0] : (parts[1] ?? null);
	
	// Shift indices by 1 if it's a direct URL
	const depthStr = isDirectUrl ? parts[1] : parts[2];
	const limitStr = isDirectUrl ? parts[2] : parts[3];

	const depth = depthStr ? parseInt(depthStr, 10) : DEFAULT_DEPTH;
	const limit = limitStr ? parseInt(limitStr, 10) : DEFAULT_LIMIT;

	return {
		url,
		depth: isNaN(depth) || depth < 0 ? DEFAULT_DEPTH : depth,
		limit: isNaN(limit) || limit < 1 ? DEFAULT_LIMIT : limit,
	};
}

/**
 * Validate a URL string. Must be a valid http/https URL.
 */
function isValidUrl(urlStr: string): boolean {
	try {
		const parsed = new URL(urlStr);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Handle /crawl <url> [depth] [limit] command.
 * Crawls a URL and sends back a single `.md` file containing all the documentation.
 */
export async function handleCrawl(ctx: Context): Promise<void> {
	const botCtx = ctx as unknown as { env: Env; executionCtx: ExecutionContext };
	const env = botCtx.env;
	const text = ctx.message?.text ?? "";
	const { url, depth, limit } = parseArgs(text);

	if (!url) {
		await ctx.reply(
			"⚠️ <b>Usage:</b> <code>/crawl &lt;url&gt; [depth] [limit]</code>\n\n" +
				"<b>Examples:</b>\n" +
				"<code>/crawl https://docs.example.com</code>\n" +
				"<code>/crawl https://docs.example.com 2 50</code>",
			{ parse_mode: "HTML" },
		);
		return;
	}

	if (!isValidUrl(url)) {
		await ctx.reply(
			`❌ Invalid URL: <code>${escapeHtml(url)}</code>\n\nPlease provide a valid http:// or https:// URL.`,
			{ parse_mode: "HTML" },
		);
		return;
	}

	const clampedLimit = Math.min(limit, 100);

	try {
		// 1. Check KV cache first
		const cached = await getCachedCrawl(env.CRAWL_CACHE, url);
		if (cached) {
			await ctx.reply("📦 <b>Serving from cache</b> (crawled recently). Generating AI Knowledge Base...", {
				parse_mode: "HTML",
			});

			const mdContent = generateAiKnowledgeBase(cached.url, cached.pages);
			const buffer = new TextEncoder().encode(mdContent);
			const hostname = new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '_');
			
			await ctx.replyWithDocument(new InputFile(buffer, `knowledge_base_${hostname}.md`), {
				caption: `🤖 **AI Knowledge Base**\n🔗 ${url}\n📊 Found ${cached.finished} pages.`,
			});
			return;
		}

		// 2. Start the crawl job (fast API call)
		const { startCrawl, pollCrawl } = await import("../services/crawler");
		
		const crawlRequest = {
			url,
			depth,
			limit: clampedLimit,
			formats: ["markdown"] as ("markdown" | "html" | "json")[],
			crawlPurposes: ["ai-input", "ai-train", "search"]
		};

		const jobId = await startCrawl(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, crawlRequest);

		// 3. Send "working" indicator & Job ID immediately
		await ctx.reply(
			`🕷️ <b>Started deep crawl for AI context...</b>\n` +
				`🔗 ${escapeHtml(url)}\n` +
				`🆔 Job: <code>${jobId}</code>\n` +
				`📊 Depth: ${depth} | Max pages: ${clampedLimit}\n\n` +
				`⏳ Processing in background. I'll send the document when it's ready. You can also use <code>/status ${jobId}</code> to check manually.`,
			{ parse_mode: "HTML" },
		);

		// 4. Move polling and document generation to a background task
		const backgroundTask = async () => {
			try {
				const result = await pollCrawl(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, jobId);
				const pagesArray = result.result.records ?? result.result.pages ?? [];
				const total = result.result.total ?? pagesArray.length;
				const finished = result.result.finished ?? pagesArray.length;

				// Cache the result
				await setCachedCrawl(
					env.CRAWL_CACHE,
					url,
					pagesArray,
					total,
					finished,
				);

				// Generate and send Markdown document
				const mdContent = generateAiKnowledgeBase(url, pagesArray);
				const buffer = new TextEncoder().encode(mdContent);
				const hostname = new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '_');

				await ctx.replyWithDocument(new InputFile(buffer, `knowledge_base_${hostname}.md`), {
					caption: `✅ **Crawl Complete!**\n🆔 Job: <code>${jobId}</code>\n📊 Processed ${finished} out of ${total} discovered links.\n\n🤖 *Upload this file to Claude/ChatGPT/Gemini for instant context!*`,
					parse_mode: "HTML"
				});
			} catch (bgError) {
				console.error(
					JSON.stringify({
						message: "background polling failed",
						jobId,
						error: bgError instanceof Error ? bgError.message : String(bgError),
					})
				);
				await ctx.reply(
					`❌ <b>Crawl polling failed for job <code>${jobId}</code></b>\n` +
					`<pre>${escapeHtml(bgError instanceof Error ? bgError.message : String(bgError))}</pre>\n` +
					`Use <code>/status ${jobId}</code> to check if it completed successfully on Cloudflare's end.`,
					{ parse_mode: "HTML" }
				);
			}
		};

		// Instruct Cloudflare to keep the Worker alive to finish the background task
		botCtx.executionCtx.waitUntil(backgroundTask());

	} catch (error) {
		console.error(
			JSON.stringify({
				message: "crawl command failed to start",
				url,
				depth,
				limit: clampedLimit,
				error: error instanceof Error ? error.message : String(error),
			}),
		);

		await ctx.reply(
			`❌ <b>Crawl failed to start</b>\n\n` +
				`<pre>${escapeHtml(error instanceof Error ? error.message : String(error))}</pre>\n\n` +
				`Try again or check the URL is accessible.`,
			{ parse_mode: "HTML" },
		);
	}
}
