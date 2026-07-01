import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPostgresConfigured, pgQuery } from "@/lib/db/postgres";
import { getConfig } from "@/lib/support/config";
import type { IntegrationCredentialPayload, IntegrationId } from "./IntegrationTypes";

interface CredentialRecord {
  integrationId: IntegrationId;
  orgId: string;
  encrypted: string;
  iv: string;
  updatedAt: string;
  updatedBy: string;
}

interface CredentialStoreFile {
  records: CredentialRecord[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "integration-credentials.json");

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptionSecret(): string | null {
  const cfg = getConfig();
  return (
    process.env.INTEGRATION_SECRET_KEY?.trim() ||
    cfg.encryptionKey ||
    process.env.AUTH0_SECRET?.trim() ||
    null
  );
}

async function readFileStore(): Promise<CredentialStoreFile> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CredentialStoreFile;
    if (!Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeFileStore(store: CredentialStoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function encryptPayload(payload: IntegrationCredentialPayload, secret: string): {
  encrypted: string;
  iv: string;
} {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    iv: iv.toString("base64"),
    encrypted: encrypted.toString("base64"),
  };
}

function decryptPayload(
  encrypted: string,
  iv: string,
  secret: string
): IntegrationCredentialPayload {
  const key = deriveKey(secret);
  const buf = Buffer.from(encrypted, "base64");
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
  return JSON.parse(plaintext) as IntegrationCredentialPayload;
}

export function credentialStoreBackend(): "postgres" | "file" {
  return isPostgresConfigured() ? "postgres" : "file";
}

export class CredentialStore {
  static async save(
    integrationId: IntegrationId,
    payload: IntegrationCredentialPayload,
    orgId: string,
    updatedBy: string
  ): Promise<void> {
    const secret = encryptionSecret();
    if (!secret) {
      throw new Error(
        "INTEGRATION_SECRET_KEY (or ENCRYPTION_KEY) is required to store credentials"
      );
    }
    const { encrypted, iv } = encryptPayload(payload, secret);

    if (isPostgresConfigured()) {
      await pgQuery`
        INSERT INTO integration_credentials (
          integration_id, org_id, encrypted, iv, updated_at, updated_by
        )
        VALUES (
          ${integrationId}, ${orgId}, ${encrypted}, ${iv}, NOW(), ${updatedBy}
        )
        ON CONFLICT (integration_id, org_id)
        DO UPDATE SET
          encrypted = EXCLUDED.encrypted,
          iv = EXCLUDED.iv,
          updated_at = NOW(),
          updated_by = EXCLUDED.updated_by
      `;
      return;
    }

    const store = await readFileStore();
    const idx = store.records.findIndex(
      (r) => r.integrationId === integrationId && r.orgId === orgId
    );
    const record: CredentialRecord = {
      integrationId,
      orgId,
      encrypted,
      iv,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    if (idx >= 0) store.records[idx] = record;
    else store.records.push(record);
    await writeFileStore(store);
  }

  static async load(
    integrationId: IntegrationId,
    orgId: string
  ): Promise<IntegrationCredentialPayload | null> {
    const secret = encryptionSecret();
    if (!secret) return null;

    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        SELECT encrypted, iv
        FROM integration_credentials
        WHERE integration_id = ${integrationId} AND org_id = ${orgId}
        LIMIT 1
      `;
      if (!rows[0]) return null;
      try {
        return decryptPayload(
          String(rows[0].encrypted),
          String(rows[0].iv),
          secret
        );
      } catch {
        return null;
      }
    }

    const store = await readFileStore();
    const record = store.records.find(
      (r) => r.integrationId === integrationId && r.orgId === orgId
    );
    if (!record) return null;
    try {
      return decryptPayload(record.encrypted, record.iv, secret);
    } catch {
      return null;
    }
  }

  static async delete(integrationId: IntegrationId, orgId: string): Promise<boolean> {
    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        DELETE FROM integration_credentials
        WHERE integration_id = ${integrationId} AND org_id = ${orgId}
        RETURNING integration_id
      `;
      return rows.length > 0;
    }

    const store = await readFileStore();
    const before = store.records.length;
    store.records = store.records.filter(
      (r) => !(r.integrationId === integrationId && r.orgId === orgId)
    );
    if (store.records.length === before) return false;
    await writeFileStore(store);
    return true;
  }

  static async listConfigured(orgId: string): Promise<IntegrationId[]> {
    if (isPostgresConfigured()) {
      const rows = await pgQuery`
        SELECT integration_id
        FROM integration_credentials
        WHERE org_id = ${orgId}
      `;
      return rows.map((r) => String(r.integration_id) as IntegrationId);
    }

    const store = await readFileStore();
    return store.records
      .filter((r) => r.orgId === orgId)
      .map((r) => r.integrationId);
  }
}

export function hasCredentialEncryption(): boolean {
  return Boolean(encryptionSecret());
}
