import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

async function readStore(): Promise<CredentialStoreFile> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CredentialStoreFile;
    if (!Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: CredentialStoreFile): Promise<void> {
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
    const store = await readStore();
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
    await writeStore(store);
  }

  static async load(
    integrationId: IntegrationId,
    orgId: string
  ): Promise<IntegrationCredentialPayload | null> {
    const secret = encryptionSecret();
    if (!secret) return null;
    const store = await readStore();
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
    const store = await readStore();
    const before = store.records.length;
    store.records = store.records.filter(
      (r) => !(r.integrationId === integrationId && r.orgId === orgId)
    );
    if (store.records.length === before) return false;
    await writeStore(store);
    return true;
  }

  static async listConfigured(orgId: string): Promise<IntegrationId[]> {
    const store = await readStore();
    return store.records
      .filter((r) => r.orgId === orgId)
      .map((r) => r.integrationId);
  }
}

export function hasCredentialEncryption(): boolean {
  return Boolean(encryptionSecret());
}
