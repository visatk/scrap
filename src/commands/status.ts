import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getCrawlStatus } from "../services/crawler";
import { formatCrawlStatus, sendKnowledgeBaseDocument } from "../utils/formatter";
import { BotContext } from "../types";

/**
 * Handle /status <job_id> command.
 * Checks the status of an ongoing or completed crawl job.
 */
export async function handleStatus(ctx: BotContext): Promise<void> {
	const env = ctx.env;
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
			let url = "unknown-source";
			if (pages.length > 0 && pages[0].url) {
				try {
					url = new URL(pages[0].url).origin;
				} catch {}
			}
			await sendKnowledgeBaseDocument(ctx, url, pages, jobId, finished ?? pages.length, total ?? pages.length);
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
