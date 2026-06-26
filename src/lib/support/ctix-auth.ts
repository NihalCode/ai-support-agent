import "server-only";

import { createHmac } from "node:crypto";

/** CTIX Open API HMAC-SHA1 auth query params (AccessID, Signature, Expires). */
export interface CtixAuthQuery {
  AccessID: string;
  Signature: string;
  Expires: string;
}

export function generateCtixAuthQuery(
  accessId: string,
  secretKey: string,
  expiryOffsetSeconds = 20
): CtixAuthQuery {
  const expires = Math.floor(Date.now() / 1000) + expiryOffsetSeconds;
  const toSign = `${accessId}\n${expires}`;
  const signature = createHmac("sha1", secretKey).update(toSign).digest("base64");
  return {
    AccessID: accessId,
    Signature: signature,
    Expires: String(expires),
  };
}
