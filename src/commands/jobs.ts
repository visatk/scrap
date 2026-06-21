import { BotContext } from "../types";
import { getJobs } from "../services/db";

export async function handleJobs(ctx: BotContext): Promise<void> {
	const userId = ctx.from?.id;
	if (!userId) return;

	const jobs = await getJobs(ctx.env.CRAWL_CACHE, userId);

	if (jobs.length === 0) {
		await ctx.reply("🗂 <b>You don't have any crawl jobs yet!</b>\n\nStart one with /crawl", { parse_mode: "HTML" });
		return;
	}

	// Telegram limits messages to 4096 chars, so we only show the last 10 jobs
	const recentJobs = jobs.slice(0, 10);
	
	let message = `🗂 <b>Your Recent Crawl Jobs:</b>\n\n`;
	
	for (const job of recentJobs) {
		const statusEmoji = job.status === "completed" ? "✅" : (job.status === "running" || job.status === "pending" ? "⏳" : "❌");
		const date = new Date(job.timestamp).toLocaleString();
		
		message += `${statusEmoji} <b>Job ID:</b> <code>${job.jobId}</code>\n`;
		message += `🔗 <b>URL:</b> ${job.url}\n`;
		message += `📅 <b>Date:</b> ${date}\n`;
		message += `└ <i>/status ${job.jobId}</i> | <i>/results ${job.jobId}</i>\n\n`;
	}

	if (jobs.length > 10) {
		message += `<i>...and ${jobs.length - 10} more older jobs.</i>`;
	}

	await ctx.reply(message, { 
		parse_mode: "HTML",
		link_preview_options: { is_disabled: true }
	});
}
