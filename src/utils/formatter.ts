import type { CrawlPage } from "../types";

/** Characters that must be escaped in Telegram HTML parse mode. */
const HTML_ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
};

/**
 * Escape text for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Compile all crawled pages into a single Markdown document tailored for AI consumption.
 * Adds clear delimiters and metadata for each page so LLMs can easily parse it.
 */
export function generateAiKnowledgeBase(url: string, pages: CrawlPage[]): string {
	let doc = `# 🧠 AI Knowledge Base Generation\n\n`;
	doc += `> **Automated Document Extraction by Pine Bot**\n> \n`;
	doc += `> - **Source Origin:** [${url}](${url})\n`;
	doc += `> - **Generation Time:** ${new Date().toUTCString()}\n`;
	doc += `> - **Total Documents Processed:** ${pages.length}\n\n`;
	doc += `---\n\n`;

	// Create an index/table of contents
	doc += `## 📑 Table of Contents\n\n`;
	pages.forEach((page, index) => {
		const title = page.metadata?.title || page.url;
		doc += `${index + 1}. [${title}](${page.url})\n`;
	});
	doc += `\n---\n\n`;

	// Add the actual content
	pages.forEach((page, index) => {
		const title = page.metadata?.title || page.url;
		
		doc += `## 📄 Document ${index + 1}: ${title}\n\n`;
		doc += `**URL:** ${page.url}\n`;
		if (page.metadata?.status) {
			doc += `**HTTP Status:** ${page.metadata.status}\n`;
		}
		
		if (page.status === "errored" || (typeof page.status === "number" && page.status >= 400)) {
			doc += `\n> ⚠️ **Error:** This page could not be fully crawled or returned an error.\n\n`;
		}

		if (page.markdown) {
			doc += `\n### 📝 Content\n\n`;
			doc += `${page.markdown.trim()}\n\n`;
		} else {
			doc += `\n*No readable markdown content extracted for this page.*\n\n`;
		}

		doc += `---\n\n`;
	});

	return doc;
}

/**
 * Format a progress/status update message for an ongoing crawl.
 */
export function formatCrawlStatus(
	jobId: string,
	status: string,
	total?: number,
	finished?: number,
): string {
	const statusEmoji =
		status === "completed"
			? "✅"
			: status === "errored" || status.includes("cancelled")
				? "❌"
				: "⏳";

	let msg =
		`${statusEmoji} <b>Live Crawl Status</b>\n\n` +
		`🎯 <b>Task ID:</b> <code>${escapeHtml(jobId)}</code>\n` +
		`📌 <b>Status:</b> ${escapeHtml(status)}\n`;

	if (total !== undefined) {
		msg += `🗂 <b>Pages Discovered:</b> ${total}\n`;
	}
	if (finished !== undefined) {
		msg += `🚀 <b>Pages Processed:</b> ${finished}\n`;
	}

	return msg;
}
