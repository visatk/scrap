import { createBot } from "./bot";
import { webhookCallback } from "grammy";

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
} satisfies ExportedHandler<Env>;
