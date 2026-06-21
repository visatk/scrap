import { BotContext } from "../types";
import { getJobs } from "../services/db";

export async function handleJobs(ctx: BotContext): Promise<void> {
	const userId = ctx.from?.id;
	if (!userId) return;

	const jobs = await getJobs(ctx.env.CRAWL_CACHE, userId);

	if (jobs.length === 0) {
		await ctx.reply("🗂 <b>No Crawl Jobs Found</b>\n\n<i>You haven't started any tasks yet. Send me a URL to begin!</i>", { parse_mode: "HTML" });
		return;
	}

	// Telegram limits messages to 4096 chars, so we only show the last 10 jobs
	const recentJobs = jobs.slice(0, 10);
	
	let message = `🗂 <b>Your Crawl History</b> (Latest ${recentJobs.length})\n\n`;
	
	for (const job of recentJobs) {
		let statusEmoji = "⏳";
		let statusText = "Processing";
		if (job.status === "completed") { statusEmoji = "✅"; statusText = "Completed"; }
		else if (job.status === "cancelled") { statusEmoji = "🛑"; statusText = "Cancelled"; }
		else if (job.status === "timed_out") { statusEmoji = "⏱"; statusText = "Timed Out"; }
		else if (job.status === "errored") { statusEmoji = "❌"; statusText = "Failed"; }

		const date = new Date(job.timestamp).toLocaleString();
		
		message += `${statusEmoji} <b>Task:</b> <code>${job.jobId}</code>\n`;
		message += `🔗 <b>URL:</b> ${job.url}\n`;
		message += `📅 <b>Date:</b> ${date}\n`;
		message += `└ <i>Status: ${statusText}</i> — /status_${job.jobId}\n\n`;
	}

	if (jobs.length > 10) {
		message += `<i>...and ${jobs.length - 10} older tasks hidden.</i>`;
	}

	await ctx.reply(message, { 
		parse_mode: "HTML",
		link_preview_options: { is_disabled: true }
	});
}
