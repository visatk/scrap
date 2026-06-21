import type {
	CrawlRequest,
	CrawlStartResponse,
	CrawlJobResult,
	CrawlPage,
} from "../types";

/** Default poll interval in milliseconds (5 seconds). */
const POLL_INTERVAL_MS = 5_000;

/** Maximum time to poll before giving up (10 minutes). */
const MAX_POLL_MS = 600_000;

/**
 * Build the base URL for the Browser Rendering REST API.
 */
function baseUrl(accountId: string): string {
	return `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;
}

/**
 * Start a crawl job via POST /crawl.
 * Returns the job ID for polling.
 */
export async function startCrawl(
	accountId: string,
	apiToken: string,
	options: CrawlRequest,
): Promise<string> {
	const url = `${baseUrl(accountId)}/crawl`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(options),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Crawl API returned ${response.status}: ${text}`,
		);
	}

	const data = await response.json<CrawlStartResponse>();
	
	if (!data.success) {
		const errMsg = data.errors?.map((e) => e.message).join(", ") ?? "Unknown error";
		throw new Error(`Crawl failed to start: ${errMsg}`);
	}

	// The API returns the job ID directly as the result string according to the docs
	if (typeof data.result === "string") {
		return data.result;
	} else if (data.result && typeof data.result === "object" && 'id' in data.result) {
		return data.result.id!;
	} else if (data.result && typeof data.result === "object" && 'jobId' in data.result) {
		return data.result.jobId!;
	}
	
	throw new Error("Could not parse job ID from response");
}

/**
 * Get the status/results of a crawl job via GET /crawl/{jobId}.
 * Uses limit=1 when just polling for status to save bandwidth.
 */
export async function getCrawlStatus(
	accountId: string,
	apiToken: string,
	jobId: string,
	pollOnly: boolean = false,
): Promise<CrawlJobResult> {
	// If just polling, add limit=1 to avoid pulling large payloads
	const url = `${baseUrl(accountId)}/crawl/${jobId}${pollOnly ? '?limit=1' : '?limit=100'}`;

	const response = await fetch(url, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiToken}`,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Crawl status API returned ${response.status}: ${text}`,
		);
	}

	return response.json<CrawlJobResult>();
}

/**
 * Poll a crawl job until it completes, errors, or times out.
 */
export async function pollCrawl(
	accountId: string,
	apiToken: string,
	jobId: string,
	maxWaitMs: number = MAX_POLL_MS,
	intervalMs: number = POLL_INTERVAL_MS,
): Promise<CrawlJobResult> {
	const deadline = Date.now() + maxWaitMs;

	while (Date.now() < deadline) {
		const result = await getCrawlStatus(accountId, apiToken, jobId, true);
		const status = result.result.status;

		if (status === "completed") {
			// Fetch the full result without limit=1
			return await getCrawlStatus(accountId, apiToken, jobId, false);
		}

		// If status is not pending or running, and we didn't return above (completed), it's a failure
		if (status !== "pending" && status !== "running") {
			throw new Error(`Crawl job ${jobId} ended with failed status: ${status}`);
		}

		// Wait before next poll
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(`Crawl job ${jobId} timed out after ${maxWaitMs / 1000}s while waiting for completion.`);
}

/**
 * High-level crawl function: starts a crawl and polls until complete.
 */
export async function crawlUrl(
	accountId: string,
	apiToken: string,
	targetUrl: string,
	depth: number = 2,
	limit: number = 50,
): Promise<{
	jobId: string;
	pages: CrawlPage[];
	total: number;
	finished: number;
}> {
	const crawlRequest: CrawlRequest = {
		url: targetUrl,
		depth,
		limit,
		formats: ["markdown"],
		// Since we want this for AI, we'll try to fetch static pages faster, 
		// but fallback to JS rendering if we have to. Let's use the default (render: true).
		crawlPurposes: ["ai-input", "ai-train", "search"]
	};

	// Start the crawl
	const jobId = await startCrawl(accountId, apiToken, crawlRequest);

	// Poll until complete
	const result = await pollCrawl(accountId, apiToken, jobId);

	// In the new API, results are in `records` instead of `pages`
	const pagesArray = result.result.records ?? result.result.pages ?? [];

	return {
		jobId,
		pages: pagesArray,
		total: result.result.total ?? pagesArray.length,
		finished: result.result.finished ?? pagesArray.length,
	};
}
