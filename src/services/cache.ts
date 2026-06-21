import type { CachedCrawl, CrawlPage } from "../types";

/** Default cache TTL: 1 hour. */
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Normalize a URL for use as a cache key.
 * Removes trailing slashes, fragments, and lowercases the hostname.
 */
function normalizeCacheKey(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		// Remove trailing slash from pathname (except root "/")
		if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
			parsed.pathname = parsed.pathname.slice(0, -1);
		}
		return `crawl:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
	} catch {
		// Fallback: use the raw URL
		return `crawl:${url}`;
	}
}

/**
 * Retrieve a cached crawl result from KV.
 * Returns null if not found or expired.
 */
export async function getCachedCrawl(
	kv: KVNamespace,
	url: string,
): Promise<CachedCrawl | null> {
	const key = normalizeCacheKey(url);
	const cached = await kv.get<CachedCrawl>(key, "json");
	return cached;
}

/**
 * Store a crawl result in KV with a TTL.
 */
export async function setCachedCrawl(
	kv: KVNamespace,
	url: string,
	pages: CrawlPage[],
	total: number,
	finished: number,
	ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
	const key = normalizeCacheKey(url);
	const entry: CachedCrawl = {
		url,
		pages,
		crawledAt: new Date().toISOString(),
		total,
		finished,
	};

	await kv.put(key, JSON.stringify(entry), {
		expirationTtl: ttlSeconds,
	});
}
