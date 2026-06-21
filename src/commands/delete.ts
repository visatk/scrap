import { BotContext } from "../types";
import { deleteJob, getJobs } from "../services/db";

export async function handleDelete(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1);
	const jobId = args?.[0];

	if (!jobId) {
		await ctx.reply("⚠️ Please provide a Job ID. Example: <code>/delete 1234abcd</code>", { parse_mode: "HTML" });
		return;
	}

	const userId = ctx.from?.id;
	if (!userId) return;

	try {
		const success = await deleteJob(ctx.env.CRAWL_CACHE, userId, jobId);
		
		if (success) {
			await ctx.reply(`🗑 <b>Job Deleted!</b>\n\nTask ID: <code>${jobId}</code> has been removed from your history.`, { parse_mode: "HTML" });
		} else {
			await ctx.reply("⚠️ <b>Job not found in your history.</b>", { parse_mode: "HTML" });
		}
	} catch (error) {
		await ctx.reply(`❌ <b>Failed to delete job:</b> ${(error as Error).message}`, { parse_mode: "HTML" });
	}
}
