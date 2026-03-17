import { Context } from "grammy";

export const LEGACY_BOT_USERNAME = "legacy";

export function normalizeBotUsername(value?: string | null): string {
    const normalized = String(value ?? "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase();

    return normalized || LEGACY_BOT_USERNAME;
}

export function getBotUsernameFromContext(ctx: Pick<Context, "me">, fallback?: string | null): string {
    return normalizeBotUsername(ctx.me?.username ?? fallback);
}

export function buildScopedKey(botUsername: string, telegramId: number): string {
    return `${normalizeBotUsername(botUsername)}:${telegramId}`;
}

export function extractBotUsernameFromReturnUrl(returnUrl?: string | null): string | null {
    if (!returnUrl) {
        return null;
    }

    try {
        const url = new URL(returnUrl);
        if (url.hostname !== "t.me") {
            return null;
        }

        const username = url.pathname.replace(/^\/+/, "").trim();
        return username ? normalizeBotUsername(username) : null;
    } catch {
        return null;
    }
}
