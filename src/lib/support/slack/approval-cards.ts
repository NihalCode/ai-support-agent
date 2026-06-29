import "server-only";

import type { ApprovalRequest } from "../types";
import { redact } from "../redact";
import type { SlackBlock } from "./client";

export function buildApprovalBlocks(approval: ApprovalRequest): SlackBlock[] {
  const action = approval.action.type;
  const safety = approval.safety.safetyClass;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Approval required:* ${action}\n*Risk:* ${safety}\n${redact(approval.preview)}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: redact(approval.safety.reason),
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          value: `approve:${approval.id}`,
          action_id: "approval_approve",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          value: `reject:${approval.id}`,
          action_id: "approval_reject",
        },
      ],
    },
  ];
}
