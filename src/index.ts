import { createBot } from "./bot";
import { webhookCallback } from "grammy";
import { getActiveJobs, getCancelSignal, saveJob, deleteJob } from "./services/db";
import { getCrawlStatus } from "./services/crawler";
import { setCachedCrawl } from "./services/cache";
import { sendDocumentToUser } from "./utils/formatter";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// ── Health check ─────────────────────────────────────────────────
		if (request.method === "GET" && url.pathname === "/") {
			return new Response("🌲 Pine Docs Scraper Bot is running", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			});
		}

		// ── Telegram webhook endpoint ────────────────────────────────────
		if (request.method === "POST" && url.pathname === "/webhook") {
			// Verify the secret token if set
			if (env.BOT_WEBHOOK_SECRET) {
				const secretHeader = request.headers.get(
					"X-Telegram-Bot-Api-Secret-Token",
				);
				if (secretHeader !== env.BOT_WEBHOOK_SECRET) {
					console.error(
						JSON.stringify({
							message: "webhook auth failed",
							received: secretHeader ? "invalid" : "missing",
						}),
					);
					return new Response("Unauthorized", { status: 403 });
				}
			}

			try {
				const bot = createBot(env.BOT_TOKEN, env, ctx);
				const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
					timeoutMilliseconds: 60000, // Return to Telegram within 60s
				});
				return await handleUpdate(request);
			} catch (error) {
				console.error(
					JSON.stringify({
						message: "webhook handler error",
						error: error instanceof Error ? error.message : String(error),
					}),
				);
				// Always return 200 to Telegram to prevent redelivery loops
				return new Response("OK", { status: 200 });
			}
		}

		// ── Setup helper: register the webhook ───────────────────────────
		if (request.method === "GET" && url.pathname === "/setup") {
			const workerUrl = url.origin;
			const webhookUrl = `${workerUrl}/webhook`;

			const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;

			const body: Record<string, unknown> = {
				url: webhookUrl,
				allowed_updates: ["message"],
				drop_pending_updates: true,
			};

			if (env.BOT_WEBHOOK_SECRET) {
				body.secret_token = env.BOT_WEBHOOK_SECRET;
			}

			const response = await fetch(telegramUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			const result = await response.json<{
				ok: boolean;
				description?: string;
			}>();

			if (result.ok) {
				// Also set commands
				try {
					const bot = createBot(env.BOT_TOKEN, env, ctx);
					await bot.api.setMyCommands([
						{ command: "start", description: "Start the bot" },
						{ command: "help", description: "Show all commands" },
						{ command: "crawl", description: "Start a new crawl job" },
						{ command: "jobs", description: "List your crawl jobs" },
						{ command: "status", description: "Check job status: /status <job_id>" },
						{ command: "results", description: "Fetch results: /results <job_id>" },
						{ command: "cancel", description: "Cancel a job: /cancel <job_id>" },
						{ command: "delete", description: "Delete from history: /delete <job_id>" },
						{ command: "presets", description: "List saved crawl presets" },
						{ command: "savepreset", description: "Save current config as preset" },
						{ command: "loadpreset", description: "Load a preset: /loadpreset <name>" },
						{ command: "delpreset", description: "Delete a preset: /delpreset <name>" },
						{ command: "cancel_session", description: "Abort active wizard step" }
					]);
				} catch (err) {
					console.error("Failed to set commands:", err);
				}

				return new Response(
					`✅ Webhook set to ${webhookUrl}\n✅ Commands registered`,
					{ status: 200, headers: { "Content-Type": "text/plain" } },
				);
			} else {
				return new Response(
					`❌ Failed to set webhook: ${result.description}`,
					{ status: 500, headers: { "Content-Type": "text/plain" } },
				);
			}
		}

		// ── 404 for everything else ──────────────────────────────────────
		return new Response("Not Found", { status: 404 });
	},

	// ── Cron Trigger Handler ─────────────────────────────────────────
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Fetch all currently running/pending jobs
		const activeJobs = await getActiveJobs(env.CRAWL_CACHE);
		
		for (const job of activeJobs) {
			try {
				// Check if the user requested a cancellation
				const isCancelled = await getCancelSignal(env.CRAWL_CACHE, job.jobId);
				if (isCancelled) {
					await saveJob(env.CRAWL_CACHE, job.userId, {
						jobId: job.jobId,
						url: job.url,
						status: "cancelled",
						timestamp: Date.now(),
					});
					continue;
				}

				// Check status from Cloudflare API
				const result = await getCrawlStatus(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, job.jobId, true);
				const status = result.result?.status;

				if (status === "completed") {
					// Fetch full payload
					const fullResult = await getCrawlStatus(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, job.jobId, false);
					const pagesArray = fullResult.result?.records ?? fullResult.result?.pages ?? [];
					const total = fullResult.result?.total ?? pagesArray.length;
					const finished = fullResult.result?.finished ?? pagesArray.length;

					// Cache the result
					await setCachedCrawl(env.CRAWL_CACHE, job.url, pagesArray, total, finished);

					// Mark as completed
					await saveJob(env.CRAWL_CACHE, job.userId, {
						jobId: job.jobId,
						url: job.url,
						status: "completed",
						timestamp: Date.now(),
					});

					// Push document to Telegram via Bot API
					await sendDocumentToUser(
						env.BOT_TOKEN,
						job.userId,
						job.url,
						pagesArray,
						job.jobId,
						finished,
						total
					);

				} else if (status !== "pending" && status !== "running") {
					// It failed or timed out on Cloudflare's end
					await saveJob(env.CRAWL_CACHE, job.userId, {
						jobId: job.jobId,
						url: job.url,
						status: status === "cancelled_due_to_timeout" ? "timed_out" : "errored",
						timestamp: Date.now(),
					});
				}
				// If it's still running, we do nothing and wait for the next cron cycle.

			} catch (err) {
				console.error(JSON.stringify({ message: "Cron error processing job", jobId: job.jobId, error: err instanceof Error ? err.message : String(err) }));
			}
		}
	}
} satisfies ExportedHandler<Env>;
