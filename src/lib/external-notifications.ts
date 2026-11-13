import "server-only";
import { getSql } from "@/lib/db";
import { ensureAlertsSchema } from "@/lib/alerts";

type Channel = "telegram" | "discord";
let ready: Promise<void> | undefined;
export async function ensureExternalNotificationsSchema() {
  if (!ready) ready = (async () => {
    await ensureAlertsSchema();
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS operational_notification_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`INSERT INTO operational_notification_config (id) VALUES (1) ON CONFLICT DO NOTHING`;
    await sql`CREATE TABLE IF NOT EXISTS operational_notification_deliveries (
      event_id TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing', attempts INTEGER NOT NULL DEFAULT 1,
      last_error TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, channel)
    )`;
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}

function configuredChannels(): Channel[] {
  const channels: Channel[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) channels.push("telegram");
  if (process.env.DISCORD_WEBHOOK_URL) channels.push("discord");
  return channels;
}

function message(a: Record<string, unknown>) {
  const clean = (v: unknown, limit: number) => String(v || "").replace(/[\u0000-\u001f]/g, " ").slice(0, limit);
  const recovered = a.state === "recovered";
  return `${recovered ? "✅ Recuperação registrada" : "🚨 Alerta DevCentral"}\n` +
    `Projeto: ${clean(a.project_name, 80)}\n` +
    `Prioridade: ${clean(a.severity, 15)}\n` +
    `${clean(a.title, 220)}\n` +
    `Estado: ${recovered ? "recuperado" : "ativo"}. Abra a Telemetria para verificar evidências.`;
}

async function postMessage(channel: Channel, content: string) {
  let url: string;
  let body: object;
  if (channel === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    if (!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Token do Telegram inválido");
    url = `https://api.telegram.org/bot${token}/sendMessage`;
    body = { chat_id: process.env.TELEGRAM_CHAT_ID, text: content, disable_web_page_preview: true };
  } else {
    const webhook = new URL(process.env.DISCORD_WEBHOOK_URL || "");
    if (webhook.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(webhook.hostname) ||
        !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhook.pathname)) throw new Error("Webhook do Discord inválido");
    url = webhook.toString();
    body = { content, allowed_mentions: { parse: [] } };
  }
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Serviço externo retornou HTTP ${response.status}`);
}

export async function dispatchExternalNotifications() {
  await ensureExternalNotificationsSchema();
  const channels = configuredChannels();
  if (!channels.length) return { enabled: false, attempted: 0, delivered: 0, failed: 0 };
  const sql = getSql();
  const configured = await sql`SELECT enabled_at FROM operational_notification_config WHERE id = 1`;
  const enabledAt = process.env.NOTIFY_EXISTING_ALERTS === "true"
    ? "1970-01-01T00:00:00.000Z"
    : new Date(String(configured[0].enabled_at)).toISOString();
  const alerts = await sql`SELECT id, project_name, title, severity, state, state_changed_at
    FROM operational_alerts WHERE state_changed_at >= ${enabledAt}::timestamptz
    AND state_changed_at >= NOW() - INTERVAL '7 days'
    ORDER BY state_changed_at DESC LIMIT 60`;
  let attempted = 0, delivered = 0, failed = 0;
  for (const a of alerts) {
    if (a.state === "recovered" && process.env.NOTIFY_RECOVERIES === "false") continue;
    const key = `${String(a.id)}:${String(a.state)}:${new Date(String(a.state_changed_at)).toISOString()}`;
    for (const channel of channels) {
      if (attempted >= 30) return { enabled: true, attempted, delivered, failed, truncated: true };
      // Atomic claim: skips sent and in-flight events; retries failed/stale events up to four times.
      const claimed = await sql`INSERT INTO operational_notification_deliveries
        (event_id, channel, status, attempts, updated_at) VALUES (${key}, ${channel}, 'processing', 1, NOW())
        ON CONFLICT (event_id, channel) DO UPDATE SET status='processing',
          attempts=operational_notification_deliveries.attempts+1, updated_at=NOW()
        WHERE operational_notification_deliveries.attempts < 4 AND (
          (operational_notification_deliveries.status='failed' AND operational_notification_deliveries.updated_at < NOW()-INTERVAL '5 minutes')
          OR (operational_notification_deliveries.status='processing' AND operational_notification_deliveries.updated_at < NOW()-INTERVAL '15 minutes')
        ) RETURNING event_id`;
      if (!claimed.length) continue;
      attempted++;
      try {
        await postMessage(channel, message(a));
        await sql`UPDATE operational_notification_deliveries SET status='sent', last_error='', updated_at=NOW()
          WHERE event_id=${key} AND channel=${channel}`;
        delivered++;
      } catch (err) {
        // Do not store raw URLs or tokens returned by remote error messages.
        failed++;
        await sql`UPDATE operational_notification_deliveries SET status='failed',
          last_error='Não foi possível entregar a notificação', updated_at=NOW()
          WHERE event_id=${key} AND channel=${channel}`;
        console.error(`Falha ao enviar notificação por ${channel}`, err instanceof Error ? err.name : "erro");
      }
    }
  }
  return { enabled: true, attempted, delivered, failed };
}
