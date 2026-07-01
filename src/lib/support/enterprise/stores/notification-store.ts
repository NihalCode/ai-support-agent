import "server-only";

import { randomUUID } from "node:crypto";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { AppNotification, NotificationLevel } from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

const MAX_ENTRIES = 300;

function notificationsFile(): string {
  return `${enterpriseDataDir("notifications")}/items.json`;
}

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    level: String(row.level) as NotificationLevel,
    title: String(row.title),
    message: String(row.message),
    technicalMessage: row.technical_message ? String(row.technical_message) : undefined,
    read: Boolean(row.read),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function createNotification(input: {
  userId: string;
  level?: NotificationLevel;
  title: string;
  message: string;
  technicalMessage?: string;
}): Promise<AppNotification> {
  const notification: AppNotification = {
    id: randomUUID(),
    userId: input.userId,
    level: input.level ?? "info",
    title: input.title,
    message: input.message,
    technicalMessage: input.technicalMessage,
    read: false,
    createdAt: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO app_notifications (
        id, org_id, user_id, level, title, message, technical_message, read, created_at
      ) VALUES (
        ${notification.id}, ${defaultOrgId()}, ${notification.userId}, ${notification.level},
        ${notification.title}, ${notification.message}, ${notification.technicalMessage ?? null},
        ${notification.read}, ${notification.createdAt}
      )
    `;
    return notification;
  }

  const all = readJsonArrayFile<AppNotification>(notificationsFile());
  all.unshift(notification);
  writeJsonArrayFile(notificationsFile(), all.slice(0, MAX_ENTRIES));
  return notification;
}

export async function listNotifications(
  userId: string,
  unreadOnly = false
): Promise<AppNotification[]> {
  if (isPostgresConfigured()) {
    const rows = unreadOnly
      ? await pgQuery`
          SELECT * FROM app_notifications
          WHERE org_id = ${defaultOrgId()} AND user_id = ${userId} AND read = FALSE
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `
      : await pgQuery`
          SELECT * FROM app_notifications
          WHERE org_id = ${defaultOrgId()} AND user_id = ${userId}
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `;
    return rows.map(rowToNotification);
  }
  let items = readJsonArrayFile<AppNotification>(notificationsFile()).filter(
    (n) => n.userId === userId
  );
  if (unreadOnly) items = items.filter((n) => !n.read);
  return items.slice(0, MAX_ENTRIES);
}

export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await pgQuery`
      UPDATE app_notifications SET read = TRUE
      WHERE id = ${id} AND user_id = ${userId} AND org_id = ${defaultOrgId()}
    `;
    return true;
  }
  const all = readJsonArrayFile<AppNotification>(notificationsFile());
  const idx = all.findIndex((n) => n.id === id && n.userId === userId);
  if (idx < 0) return false;
  all[idx] = { ...all[idx], read: true };
  writeJsonArrayFile(notificationsFile(), all);
  return true;
}
