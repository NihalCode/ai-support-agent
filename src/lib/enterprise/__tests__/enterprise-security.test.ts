import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { metadata as adminMetadata } from "@/app/admin/layout";
import type { AppSession } from "@/lib/auth/session";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  validateMutationCsrf,
} from "@/lib/enterprise/csrf";
import { evaluateEnterpriseAccess } from "@/lib/enterprise/guard";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import type {
  EnterprisePermission,
  EnterprisePrincipal,
} from "@/lib/enterprise/types";

function session(
  role: AppSession["user"]["role"],
  overrides: Partial<AppSession> = {}
): AppSession {
  return {
    authProvider: "auth0",
    assurance: {
      amr: ["pwd", "mfa"],
      acr: "urn:mfa",
      authTime: Math.floor(Date.now() / 1000),
    },
    user: {
      id: `user-${role}`,
      email: `${role}@example.test`,
      name: role,
      role,
      orgId: "org-trusted",
      status: "active",
    },
    ...overrides,
  };
}

describe("enterprise access foundation", () => {
  it("distinguishes unauthenticated and forbidden access", () => {
    expect(
      evaluateEnterpriseAccess(null, "admin_dashboard.access")
    ).toMatchObject({ ok: false, status: 401, reason: "unauthenticated" });
    expect(
      evaluateEnterpriseAccess(session("viewer"), "admin_dashboard.access")
    ).toMatchObject({ ok: false, status: 403, reason: "forbidden" });
  });

  it("allows admin and developer dashboard access", () => {
    expect(
      evaluateEnterpriseAccess(session("admin"), "admin_dashboard.access").ok
    ).toBe(true);
    expect(
      evaluateEnterpriseAccess(session("developer"), "admin_dashboard.access")
        .ok
    ).toBe(true);
  });

  it("denies developer production writes, approval, and sensitive permissions", () => {
    const developer = resolveOrganizationContext(session("developer")).principal;
    expect(
      authorizeEnterprise(developer, "resources.write", {
        organizationId: "org-trusted",
        environment: "production",
      })
    ).toBe(false);
    expect(authorizeEnterprise(developer, "changes.approve")).toBe(false);
    expect(authorizeEnterprise(developer, "credentials.manage")).toBe(false);
    expect(authorizeEnterprise(developer, "security_settings.manage")).toBe(false);
  });

  it("denies disabled principals and unknown permissions by default", () => {
    const principal: EnterprisePrincipal = {
      ...resolveOrganizationContext(session("owner")).principal,
      status: "disabled",
    };
    expect(authorizeEnterprise(principal, "admin_dashboard.access")).toBe(false);
    expect(
      authorizeEnterprise(
        { ...principal, status: "active" },
        "future.permission" as EnterprisePermission
      )
    ).toBe(false);
  });

  it("requires step-up only for sensitive operations", () => {
    const withoutClaims = session("admin", { assurance: undefined });
    expect(
      evaluateEnterpriseAccess(withoutClaims, "admin_dashboard.access").ok
    ).toBe(true);
    expect(
      evaluateEnterpriseAccess(withoutClaims, "changes.approve")
    ).toMatchObject({
      ok: false,
      status: 403,
      reason: "step_up_required",
    });
    expect(
      evaluateEnterpriseAccess(withoutClaims, "resources.write_production", {
        resource: {
          organizationId: "org-trusted",
          environment: "production",
        },
      })
    ).toMatchObject({
      ok: false,
      status: 403,
      reason: "step_up_required",
    });
    expect(evaluateEnterpriseAccess(session("admin"), "changes.approve").ok).toBe(
      true
    );
  });

  it("derives organization context exclusively from the trusted session", () => {
    const trusted = session("owner");
    const context = resolveOrganizationContext(trusted);
    expect(context.organization.id).toBe("org-trusted");
    expect(context.principal.organizationId).toBe(trusted.user.orgId);
    expect(resolveOrganizationContext).toHaveLength(1);
  });

  it("publishes noindex and nofollow metadata", () => {
    expect(adminMetadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });
});

describe("enterprise mutation CSRF", () => {
  beforeEach(() => {
    process.env.CSRF_SIGNING_SECRET =
      "enterprise-csrf-test-secret-at-least-32-characters";
    delete process.env.APP_BASE_URL;
  });

  afterEach(() => {
    delete process.env.CSRF_SIGNING_SECRET;
  });

  it("accepts a same-origin signed double-submit token", () => {
    const token = createCsrfToken();
    const request = new Request("https://support.example.test/api/admin/change", {
      method: "POST",
      headers: {
        origin: "https://support.example.test",
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        [CSRF_HEADER_NAME]: token,
      },
    });
    expect(validateMutationCsrf(request)).toBe(true);
  });

  it("rejects missing, mismatched, and cross-origin tokens", () => {
    const token = createCsrfToken();
    const crossOrigin = new Request(
      "https://support.example.test/api/admin/change",
      {
        method: "POST",
        headers: {
          origin: "https://evil.example.test",
          cookie: `${CSRF_COOKIE_NAME}=${token}`,
          [CSRF_HEADER_NAME]: token,
        },
      }
    );
    expect(validateMutationCsrf(crossOrigin)).toBe(false);
    expect(
      validateMutationCsrf(
        new Request("https://support.example.test/api/admin/change", {
          method: "POST",
          headers: { origin: "https://support.example.test" },
        })
      )
    ).toBe(false);
  });
});
