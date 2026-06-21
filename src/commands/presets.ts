import { BotContext } from "../types";
import { getPresets, savePreset, deletePreset, setActivePreset, getActivePreset } from "../services/db";

export async function handlePresets(ctx: BotContext): Promise<void> {
	const userId = ctx.from?.id;
	if (!userId) return;

	const presets = await getPresets(ctx.env.CRAWL_CACHE, userId);
	const activePreset = await getActivePreset(ctx.env.CRAWL_CACHE, userId);

	const presetNames = Object.keys(presets);
	if (presetNames.length === 0) {
		await ctx.reply("⚙️ <b>No Presets Found</b>\n\n<i>Save your first preset using:</i>\n<code>/savepreset mypreset 2 50</code>", { parse_mode: "HTML" });
		return;
	}

	let msg = `⚙️ <b>Your Saved Presets</b>\n\n`;
	for (const name of presetNames) {
		const p = presets[name];
		const isActive = name === activePreset ? " ✅ <i>(Active)</i>" : "";
		msg += `🔹 <b>${name}</b>${isActive}\n`;
		msg += `└ Depth: ${p.depth} | Limit: ${p.limit}\n\n`;
	}

	msg += `<i>Load:</i> <code>/loadpreset &lt;name&gt;</code>\n`;
	msg += `<i>Delete:</i> <code>/delpreset &lt;name&gt;</code>`;

	await ctx.reply(msg, { parse_mode: "HTML" });
}

export async function handleSavePreset(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1) ?? [];
	const userId = ctx.from?.id;
	if (!userId) return;

	if (args.length < 1) {
		await ctx.reply("⚠️ <b>Usage:</b> <code>/savepreset &lt;name&gt; [depth] [limit]</code>\n\nExample: <code>/savepreset fast 1 10</code>", { parse_mode: "HTML" });
		return;
	}

	const name = args[0].toLowerCase();
	const depth = args[1] ? parseInt(args[1], 10) : 2;
	const limit = args[2] ? parseInt(args[2], 10) : 50;

	if (isNaN(depth) || isNaN(limit)) {
		await ctx.reply("⚠️ <b>Invalid Input</b>\nDepth and Limit must be valid numbers.", { parse_mode: "HTML" });
		return;
	}

	await savePreset(ctx.env.CRAWL_CACHE, userId, name, { depth, limit });
	await ctx.reply(`💾 <b>Preset Saved!</b>\n\n<b>Name:</b> ${name}\n<b>Depth:</b> ${depth} | <b>Limit:</b> ${limit}\n\n<i>Activate it with:</i> <code>/loadpreset ${name}</code>`, { parse_mode: "HTML" });
}

export async function handleLoadPreset(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1) ?? [];
	const userId = ctx.from?.id;
	if (!userId) return;

	if (args.length < 1) {
		await ctx.reply("⚠️ <b>Usage:</b> <code>/loadpreset &lt;name&gt;</code>\nOr use <code>/loadpreset default</code> to clear the active preset.", { parse_mode: "HTML" });
		return;
	}

	const name = args[0].toLowerCase();

	if (name === "default" || name === "none" || name === "clear") {
		await setActivePreset(ctx.env.CRAWL_CACHE, userId, "");
		await ctx.reply("✅ <b>Preset Cleared</b>\n\n<i>Future tasks will use default system limits.</i>", { parse_mode: "HTML" });
		return;
	}

	const presets = await getPresets(ctx.env.CRAWL_CACHE, userId);
	if (!presets[name]) {
		await ctx.reply(`⚠️ <b>Not Found</b>\nPreset '${name}' does not exist.`, { parse_mode: "HTML" });
		return;
	}

	await setActivePreset(ctx.env.CRAWL_CACHE, userId, name);
	await ctx.reply(`✅ <b>Preset Activated</b>\n\n<b>${name}</b> (Depth: ${presets[name].depth}, Limit: ${presets[name].limit})\n\n<i>All future crawls will use this setting!</i>`, { parse_mode: "HTML" });
}

export async function handleDelPreset(ctx: BotContext): Promise<void> {
	const args = ctx.message?.text?.split(" ").slice(1) ?? [];
	const userId = ctx.from?.id;
	if (!userId) return;

	if (args.length < 1) {
		await ctx.reply("⚠️ <b>Usage:</b> <code>/delpreset &lt;name&gt;</code>", { parse_mode: "HTML" });
		return;
	}

	const name = args[0].toLowerCase();
	const success = await deletePreset(ctx.env.CRAWL_CACHE, userId, name);

	if (success) {
		// If it was the active preset, clear it
		const active = await getActivePreset(ctx.env.CRAWL_CACHE, userId);
		if (active === name) {
			await setActivePreset(ctx.env.CRAWL_CACHE, userId, "");
		}
		await ctx.reply(`🗑 <b>Preset Deleted:</b> <code>${name}</code>`, { parse_mode: "HTML" });
	} else {
		await ctx.reply(`⚠️ <b>Preset '${name}' not found.</b>`, { parse_mode: "HTML" });
	}
}
