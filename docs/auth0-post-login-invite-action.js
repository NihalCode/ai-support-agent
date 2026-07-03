/**
 * Auth0 Post-Login Action — invite-only gate (Support Agent or Docs — one Action per app)
 *
 * Deploy in Auth0 Dashboard → Actions → Flows → Login → Post-Login
 *
 * Action secrets (set per Action — same names, values for that application):
 *   APP_BASE_URL                 — production origin, e.g. https://ai-support-agent-ecru.vercel.app
 *   AUTH0_ACTION_SHARED_SECRET   — same value as Vercel env
 *   AUTH0_CLIENT_ID              — optional; skip Action when client_id differs (multi-app tenant)
 *
 * @param {Event} event
 * @param {PostLoginAPI} api
 */
exports.onExecutePostLogin = async (event, api) => {
  try {
    const email = event.user?.email;
    if (!email) {
      api.access.deny("invite_required", "You must be invited to access this app.");
      return;
    }

    const expectedClientId = event.secrets.AUTH0_CLIENT_ID?.trim();
    if (expectedClientId && event.client?.client_id !== expectedClientId) {
      return;
    }

    const appBaseUrl = event.secrets.APP_BASE_URL?.trim();
    const sharedSecret = event.secrets.AUTH0_ACTION_SHARED_SECRET?.trim();

    if (!appBaseUrl || !sharedSecret) {
      api.access.deny(
        "auth_configuration_error",
        "Access control is not configured. Set APP_BASE_URL and AUTH0_ACTION_SHARED_SECRET in Action secrets."
      );
      return;
    }

    let response;
    try {
      response = await fetch(`${appBaseUrl}/api/auth/invite-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sharedSecret}`,
        },
        body: JSON.stringify({
          email,
          auth0UserId: event.user.user_id,
          connection: event.connection?.name,
        }),
      });
    } catch {
      api.access.deny(
        "auth_configuration_error",
        "Sign-in could not verify workspace access. Check APP_BASE_URL and network reachability."
      );
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      api.access.deny(
        "auth_configuration_error",
        "Sign-in could not verify workspace access. invite-check returned a non-JSON response."
      );
      return;
    }

    let result;
    try {
      result = await response.json();
    } catch {
      api.access.deny(
        "auth_configuration_error",
        "Sign-in could not verify workspace access. invite-check returned invalid JSON."
      );
      return;
    }

    if (!response.ok) {
      api.access.deny(
        "auth_configuration_error",
        "Sign-in could not verify workspace access. Check AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL."
      );
      return;
    }

    if (result.allowed) {
      return;
    }

    if (result.reason === "auth_configuration_error") {
      api.access.deny(
        "auth_configuration_error",
        "Sign-in could not verify workspace access. Contact an administrator."
      );
      return;
    }

    if (result.reason === "disabled") {
      api.access.deny(
        "access_disabled",
        "Your access has been disabled. Contact your administrator."
      );
      return;
    }

    if (result.reason === "expired_invite") {
      api.access.deny("invite_expired", "Ask an administrator to send a new invite.");
      return;
    }

    api.access.deny("invite_required", "You must be invited to access this app.");
  } catch {
    api.access.deny(
      "auth_configuration_error",
      "Sign-in could not verify workspace access. Contact an administrator."
    );
  }
};
