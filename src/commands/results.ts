import { InputFile } from "grammy";
import { BotContext } from "../types";
import { getCrawlStatus } from "../services/crawler";
import { sendKnowledgeBaseDocument } from "../utils/formatter";
import { getJobs } from "../services/db";

export async function handleResults(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1);
	const jobId = args?.[0];

	if (!jobId) {
		await ctx.reply("⚠️ Please provide a Job ID. Example: <code>/results 1234abcd</code>", { parse_mode: "HTML" });
		return;
	}

	const userId = ctx.from?.id;
	if (userId) {
		const jobs = await getJobs(ctx.env.CRAWL_CACHE, userId);
		const job = jobs.find(j => j.jobId === jobId);
		if (!job && jobs.length > 0) {
			// Not strictly blocking if they have no jobs to support backwards compat or shared IDs,
			// but if they have jobs and this isn't one of them, we can warn them.
			// Let's just allow fetching any valid ID they provide.
		}
	}

	try {
		await ctx.reply(`🔍 <b>Fetching results for Job ID:</b> <code>${jobId}</code>...`, { parse_mode: "HTML" });
		
		const result = await getCrawlStatus(
			ctx.env.CF_ACCOUNT_ID,
			ctx.env.CF_API_TOKEN,
			jobId,
			false // fetch full results
		);

		const status = result.result?.status;

		if (status !== "completed") {
			await ctx.reply(`⚠️ <b>Results not ready.</b>\n\nCurrent Status: <b>${status}</b>\n\nPlease wait until the job is completed. You can check progress with <code>/status ${jobId}</code>`, { parse_mode: "HTML" });
			return;
		}

		const pagesArray = result.result.records ?? result.result.pages ?? [];
		const total = result.result.total ?? pagesArray.length;
		const finished = result.result.finished ?? pagesArray.length;
		
		// Using dummy URL if we can't find original
		let url = "unknown-source";
		if (pagesArray.length > 0 && pagesArray[0].url) {
			try {
				url = new URL(pagesArray[0].url).origin;
			} catch {}
		}

		await sendKnowledgeBaseDocument(ctx, url, pagesArray, jobId, finished, total);

	} catch (error) {
		await ctx.reply(`❌ <b>Failed to fetch results:</b> ${(error as Error).message}`, { parse_mode: "HTML" });
	}
}
