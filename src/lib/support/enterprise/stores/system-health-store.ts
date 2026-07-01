import "server-only";

import { randomUUID } from "node:crypto";

import { pgQuery, isPostgresConfigured } from "@/lib/db/postgres";
import type { SystemHealthEvent, SystemHealthSeverity, SystemHealthSource } from "../types";
import {
  defaultOrgId,
  enterpriseDataDir,
  readJsonArrayFile,
  writeJsonArrayFile,
} from "../file-store";

const MAX_ENTRIES = 500;

function healthFile(): string {
  return `${enterpriseDataDir("health")}/events.json`;
}

function rowToEvent(row: Record<string, unknown>): SystemHealthEvent {
  return {
    id: String(row.id),
    source: String(row.source) as SystemHealthSource,
    severity: String(row.severity) as SystemHealthSeverity,
    status: String(row.status) as "open" | "resolved",
    title: String(row.title),
    message: String(row.message),
    technicalDetails: row.technical_details ? String(row.technical_details) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : undefined,
  };
}

export async function recordSystemHealthEvent(input: {
  source: SystemHealthSource;
  severity: SystemHealthSeverity;
  title: string;
  message: string;
  technicalDetails?: string;
}): Promise<SystemHealthEvent> {
  const event: SystemHealthEvent = {
    id: randomUUID(),
    source: input.source,
    severity: input.severity,
    status: "open",
    title: input.title,
    message: input.message,
    technicalDetails: input.technicalDetails,
    createdAt: new Date().toISOString(),
  };

  if (isPostgresConfigured()) {
    await pgQuery`
      INSERT INTO system_health_events (
        id, org_id, source, severity, status, title, message, technical_details, created_at
      ) VALUES (
        ${event.id}, ${defaultOrgId()}, ${event.source}, ${event.severity}, ${event.status},
        ${event.title}, ${event.message}, ${event.technicalDetails ?? null}, ${event.createdAt}
      )
    `;
    return event;
  }

  const all = readJsonArrayFile<SystemHealthEvent>(healthFile());
  all.unshift(event);
  writeJsonArrayFile(healthFile(), all.slice(0, MAX_ENTRIES));
  return event;
}

export async function listSystemHealthEvents(status?: "open" | "resolved"): Promise<SystemHealthEvent[]> {
  if (isPostgresConfigured()) {
    const rows = status
      ? await pgQuery`
          SELECT * FROM system_health_events
          WHERE org_id = ${defaultOrgId()} AND status = ${status}
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `
      : await pgQuery`
          SELECT * FROM system_health_events
          WHERE org_id = ${defaultOrgId()}
          ORDER BY created_at DESC LIMIT ${MAX_ENTRIES}
        `;
    return rows.map(rowToEvent);
  }
  const all = readJsonArrayFile<SystemHealthEvent>(healthFile());
  return (status ? all.filter((e) => e.status === status) : all).slice(0, MAX_ENTRIES);
}

export async function resolveSystemHealthEvent(id: string): Promise<SystemHealthEvent | null> {
  const resolvedAt = new Date().toISOString();
  if (isPostgresConfigured()) {
    await pgQuery`
      UPDATE system_health_events
      SET status = 'resolved', resolved_at = ${resolvedAt}
      WHERE id = ${id} AND org_id = ${defaultOrgId()}
    `;
    const rows = await pgQuery`
      SELECT * FROM system_health_events WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  const all = readJsonArrayFile<SystemHealthEvent>(healthFile());
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status: "resolved", resolvedAt };
  writeJsonArrayFile(healthFile(), all);
  return all[idx];
}
