import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getCrawlStatus } from "../services/crawler";
import { formatCrawlStatus, generateAiKnowledgeBase } from "../utils/formatter";

/**
 * Handle /status <job_id> command.
 * Checks the status of an ongoing or completed crawl job.
 */
export async function handleStatus(ctx: Context): Promise<void> {
	const env = (ctx as unknown as { env: Env }).env;
	const text = ctx.message?.text ?? "";
	const parts = text.split(/\s+/);

	// Extract job ID
	const jobId = parts[1];
	if (!jobId) {
		await ctx.reply(
			"⚠️ <b>Usage:</b> <code>/status &lt;job_id&gt;</code>\n\n" +
				"Provide the job ID returned when you started a crawl.",
			{ parse_mode: "HTML" },
		);
		return;
	}

	try {
		await ctx.reply("🔍 Checking crawl status...");

		// Fetch the full job status (not limit=1)
		const result = await getCrawlStatus(
			env.CF_ACCOUNT_ID,
			env.CF_API_TOKEN,
			jobId,
			false
		);

		if (!result.success) {
			const errMsg = result.errors
				?.map((e) => e.message)
				.join(", ") ?? "Unknown error";
			await ctx.reply(
				`❌ <b>Error:</b> ${errMsg}`,
				{ parse_mode: "HTML" },
			);
			return;
		}

		const status = result.result.status;
		const total = result.result.total;
		const finished = result.result.finished;
		const pages = result.result.records ?? result.result.pages ?? [];

		// If complete and has pages, show full results as a Document
		if (status === "completed" && pages && pages.length > 0) {
			// Try to find the URL from the first page for the title/filename
			const url = pages[0]?.url ?? "unknown-source";
			const mdContent = generateAiKnowledgeBase(url, pages);
			const buffer = new TextEncoder().encode(mdContent);
			const hostname = url === "unknown-source" ? "docs" : new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '_');

			await ctx.replyWithDocument(new InputFile(buffer, `knowledge_base_${hostname}.md`), {
				caption: `✅ **Crawl Complete!**\n🆔 Job: <code>${jobId}</code>\n📊 Processed ${finished} out of ${total} discovered links.\n\n🤖 *Upload this file to Claude/ChatGPT/Gemini for instant context!*`,
				parse_mode: "HTML"
			});
			return;
		}

		// Otherwise show status summary
		const statusMsg = formatCrawlStatus(
			jobId,
			status,
			total,
			finished,
		);
		await ctx.reply(statusMsg, { parse_mode: "HTML" });
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "status command failed",
				jobId,
				error: error instanceof Error ? error.message : String(error),
			}),
		);

		await ctx.reply(
			`❌ <b>Failed to check status</b>\n<pre>${error instanceof Error ? error.message : String(error)}</pre>`,
			{ parse_mode: "HTML" },
		);
	}
}
