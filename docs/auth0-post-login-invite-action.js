/**
 * Auth0 Post-Login Action — invite-only gate
 *
 * Deploy in Auth0 Dashboard → Actions → Flows → Login → Post-Login
 * Add secret AUTH0_ACTION_SHARED_SECRET as Action secret.
 * Set APP_BASE_URL to your deployment origin.
 *
 * @param {Event} event
 * @param {PostLoginAPI} api
 */
exports.onExecutePostLogin = async (event, api) => {
  const email = event.user.email;
  if (!email) {
    api.access.deny("invite_required", "You must be invited to access this app.");
    return;
  }

  const appBaseUrl = event.secrets.APP_BASE_URL;
  const sharedSecret = event.secrets.AUTH0_ACTION_SHARED_SECRET;
  if (!appBaseUrl || !sharedSecret) {
    api.access.deny("invite_required", "Access control is not configured.");
    return;
  }

  const response = await fetch(`${appBaseUrl}/api/auth/invite-check`, {
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

  if (!response.ok) {
    api.access.deny("invite_required", "You must be invited to access this app.");
    return;
  }

  const result = await response.json();
  if (!result.allowed) {
    if (result.reason === "disabled") {
      api.access.deny("access_disabled", "Your access has been disabled. Contact your administrator.");
      return;
    }
    if (result.reason === "expired_invite") {
      api.access.deny("invite_expired", "Ask an administrator to send a new invite.");
      return;
    }
    api.access.deny("invite_required", "You must be invited to access this app.");
  }
};
