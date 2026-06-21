import { BotContext } from "../types";
import { setCancelSignal, getJobs } from "../services/db";

export async function handleCancel(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1);
	const jobId = args?.[0];

	if (!jobId) {
		await ctx.reply("⚠️ Please provide a Job ID. Example: <code>/cancel 1234abcd</code>", { parse_mode: "HTML" });
		return;
	}

	const userId = ctx.from?.id;
	if (userId) {
		const jobs = await getJobs(ctx.env.CRAWL_CACHE, userId);
		const job = jobs.find(j => j.jobId === jobId);
		if (!job && jobs.length > 0) {
			// Job not found in user's history
			await ctx.reply("⚠️ <b>Job not found in your history.</b> Make sure the ID is correct.", { parse_mode: "HTML" });
			return;
		}
		if (job && job.status === "completed") {
			await ctx.reply("⚠️ <b>Job is already completed.</b> Cannot cancel.", { parse_mode: "HTML" });
			return;
		}
	}

	try {
		await setCancelSignal(ctx.env.CRAWL_CACHE, jobId);
		await ctx.reply(`🛑 <b>Job Cancellation Requested!</b>\n\nTask ID: <code>${jobId}</code>\n\nThe background process will safely terminate on the next polling cycle (within 5 seconds).`, { parse_mode: "HTML" });
	} catch (error) {
		await ctx.reply(`❌ <b>Failed to cancel job:</b> ${(error as Error).message}`, { parse_mode: "HTML" });
	}
}
