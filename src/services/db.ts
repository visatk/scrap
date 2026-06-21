import { KVNamespace } from "@cloudflare/workers-types";
import { CrawlJobRecord, CrawlPreset, WizardSession } from "../types";

/**
 * Seven days expiration for most user data to prevent infinite growth.
 */
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

// ─── Jobs ─────────────────────────────────────────────────────────────

export async function saveJob(kv: KVNamespace, userId: number, job: CrawlJobRecord): Promise<void> {
	await kv.put(`job:${userId}:${job.jobId}`, JSON.stringify(job), {
		expirationTtl: SEVEN_DAYS_IN_SECONDS
	});
	
	// If the job is active, also save it to the active_job index for the cron trigger
	if (job.status === "running" || job.status === "pending") {
		await kv.put(`active_job:${job.jobId}`, JSON.stringify({ userId, url: job.url }), {
			expirationTtl: SEVEN_DAYS_IN_SECONDS
		});
	} else {
		// If completed/failed/cancelled, remove from active index
		await kv.delete(`active_job:${job.jobId}`);
	}
}

export async function getJobs(kv: KVNamespace, userId: number): Promise<CrawlJobRecord[]> {
	const list = await kv.list({ prefix: `job:${userId}:` });
	const jobs = await Promise.all(
		list.keys.map(async (key) => {
			const data = await kv.get(key.name);
			return data ? (JSON.parse(data) as CrawlJobRecord) : null;
		})
	);
	
	// Filter out nulls and sort by timestamp descending (newest first)
	return jobs.filter((j): j is CrawlJobRecord => j !== null).sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteJob(kv: KVNamespace, userId: number, jobId: string): Promise<boolean> {
	const key = `job:${userId}:${jobId}`;
	const existing = await kv.get(key);
	if (!existing) return false;
	await kv.delete(key);
	await kv.delete(`active_job:${jobId}`); // Clean up active index just in case
	return true;
}

// ─── Active Jobs Index (For Cron Triggers) ────────────────────────────

export interface ActiveJobIndex {
	jobId: string;
	userId: number;
	url: string;
}

export async function getActiveJobs(kv: KVNamespace): Promise<ActiveJobIndex[]> {
	let cursor: string | undefined;
	const activeJobs: ActiveJobIndex[] = [];

	do {
		const list = await kv.list({ prefix: `active_job:`, cursor });
		
		await Promise.all(
			list.keys.map(async (key) => {
				const data = await kv.get(key.name);
				if (data) {
					const parsed = JSON.parse(data);
					activeJobs.push({
						jobId: key.name.split(":")[1],
						userId: parsed.userId,
						url: parsed.url
					});
				}
			})
		);
		cursor = list.list_complete ? undefined : list.cursor;
	} while (cursor);

	return activeJobs;
}

// ─── Cancel Signals ───────────────────────────────────────────────────

export async function setCancelSignal(kv: KVNamespace, jobId: string): Promise<void> {
	await kv.put(`cancel:${jobId}`, "true", { expirationTtl: 3600 }); // Valid for 1 hr
}

export async function getCancelSignal(kv: KVNamespace, jobId: string): Promise<boolean> {
	const val = await kv.get(`cancel:${jobId}`);
	return val === "true";
}

// ─── Presets ──────────────────────────────────────────────────────────

export async function savePreset(kv: KVNamespace, userId: number, name: string, preset: CrawlPreset): Promise<void> {
	await kv.put(`preset:${userId}:${name}`, JSON.stringify(preset));
}

export async function getPreset(kv: KVNamespace, userId: number, name: string): Promise<CrawlPreset | null> {
	const data = await kv.get(`preset:${userId}:${name}`);
	return data ? JSON.parse(data) : null;
}

export async function deletePreset(kv: KVNamespace, userId: number, name: string): Promise<boolean> {
	const key = `preset:${userId}:${name}`;
	const existing = await kv.get(key);
	if (!existing) return false;
	await kv.delete(key);
	return true;
}

export async function getPresets(kv: KVNamespace, userId: number): Promise<Record<string, CrawlPreset>> {
	const list = await kv.list({ prefix: `preset:${userId}:` });
	const presets: Record<string, CrawlPreset> = {};
	
	await Promise.all(
		list.keys.map(async (key) => {
			const name = key.name.split(":").pop()!;
			const data = await kv.get(key.name);
			if (data) presets[name] = JSON.parse(data);
		})
	);

	return presets;
}

export async function setActivePreset(kv: KVNamespace, userId: number, name: string): Promise<void> {
	await kv.put(`active_preset:${userId}`, name);
}

export async function getActivePreset(kv: KVNamespace, userId: number): Promise<string | null> {
	return await kv.get(`active_preset:${userId}`);
}

// ─── Wizard Sessions ──────────────────────────────────────────────────

export async function saveSession(kv: KVNamespace, userId: number, session: WizardSession): Promise<void> {
	await kv.put(`session:${userId}`, JSON.stringify(session), { expirationTtl: 3600 }); // Expire after 1 hr
}

export async function getSession(kv: KVNamespace, userId: number): Promise<WizardSession | null> {
	const data = await kv.get(`session:${userId}`);
	return data ? JSON.parse(data) : null;
}

export async function deleteSession(kv: KVNamespace, userId: number): Promise<void> {
	await kv.delete(`session:${userId}`);
}
