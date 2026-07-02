# Build App (removed)

The **Build App** workflow was removed from AI Support Agent. The product is now focused on:

- Support issue investigation
- Cyware API endpoint assistance (CSAP, CFTR, CTIX, Orchestrate)
- CQL generation and explanation
- Customer response and developer handoff drafting
- Integrations (Jira, Zendesk, Slack, Confluence)

If a user asks to build or deploy an application, the agent responds with a graceful unsupported message and offers API/CQL/implementation guidance instead.

Historical approval records for `build-app-scaffold` / `build-app-deploy` may still appear in audit logs (read-only).

For API assistance, use the main chat or the **API Registry** and **CQL** activities in the IDE.
