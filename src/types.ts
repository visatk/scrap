import type { Context } from "grammy";

// ─── Browser Rendering /crawl API Types (Updated from latest docs) ──────────

export interface CrawlOptions {
	includeExternalLinks?: boolean;
	includeSubdomains?: boolean;
	includePatterns?: string[];
	excludePatterns?: string[];
}

export interface CrawlRequest {
	url: string;
	limit?: number;
	depth?: number;
	formats?: ("markdown" | "html" | "json")[];
	render?: boolean;
	maxAge?: number;
	modifiedSince?: number;
	source?: "all" | "sitemaps" | "links";
	crawlPurposes?: string[];
	options?: CrawlOptions;
}

export interface CrawlPage {
	url: string;
	status: number | string; // HTTP status code or "completed", "errored", "skipped"
	markdown?: string;
	html?: string;
	json?: unknown;
	metadata?: {
		status?: number;
		title?: string;
		url?: string;
	};
}

export interface CrawlJobResult {
	success: boolean;
	result: {
		id?: string;
		jobId?: string; // Sometimes APIs return id, sometimes jobId
		status: "pending" | "running" | "completed" | "cancelled_due_to_timeout" | "cancelled_due_to_limits" | "cancelled_by_user" | "errored";
		browserSecondsUsed?: number;
		total?: number;
		finished?: number;
		pagesFound?: number;
		pagesCrawled?: number;
		records?: CrawlPage[]; // New API uses "records" instead of "pages"
		pages?: CrawlPage[];   // Keeping for backwards compatibility
		error?: string;
		cursor?: number;
	};
	errors?: Array<{ code: number; message: string }>;
	messages?: Array<{ code: number; message: string }>;
}

export interface CrawlStartResponse {
	success: boolean;
	result: string | { jobId: string; id?: string }; // API might just return the string ID
	errors?: Array<{ code: number; message: string }>;
	messages?: Array<{ code: number; message: string }>;
}

// ─── KV Cache Types ─────────────────────────────────────────────────────────

export interface CachedCrawl {
	url: string;
	pages: CrawlPage[];
	crawledAt: string;
	total: number;
	finished: number;
}

// ─── Bot Context Type ───────────────────────────────────────────────────────

export type BotContext = Context & {
	env: Env;
	executionCtx: ExecutionContext;
};
