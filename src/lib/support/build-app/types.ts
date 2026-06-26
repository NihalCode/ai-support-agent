/** Build App + Deploy — types for app scaffolding, editing, and Vercel deployment. */

export type BuildAppTemplateId =
  | "blank-next-app"
  | "cyware-api-dashboard"
  | "cql-search-app"
  | "indicator-search-dashboard"
  | "case-management-dashboard"
  | "orchestrate-workflow-dashboard"
  | "api-playground-app"
  | "support-portal-app";

export type BuildAppProjectStatus =
  | "planning"
  | "pending_approval"
  | "scaffolded"
  | "building"
  | "ready"
  | "deploying"
  | "deployed"
  | "failed";

export type DeploymentTarget = "preview" | "production";

export interface BuildAppEndpointRef {
  method: string;
  path: string;
  name?: string;
  product?: string;
}

export interface BuildAppTemplateManifest {
  id: BuildAppTemplateId;
  name: string;
  description: string;
  products: string[];
  keywords: string[];
  defaultEndpoints?: BuildAppEndpointRef[];
}

export interface BuildAppFileChange {
  path: string;
  action: "create" | "update" | "delete";
  content?: string;
  previousContent?: string;
}

export interface BuildAppPlan {
  id: string;
  title: string;
  summary: string;
  templateId: BuildAppTemplateId;
  templateReason: string;
  endpoints: BuildAppEndpointRef[];
  features: string[];
  envSnippet: string;
  clarifyingQuestions: string[];
  readOnly: boolean;
  deployReady: boolean;
  createdAt: string;
}

export interface BuildAppProject {
  id: string;
  name: string;
  description: string;
  templateId: BuildAppTemplateId;
  status: BuildAppProjectStatus;
  plan?: BuildAppPlan;
  rootDir: string;
  files: string[];
  pendingChanges: BuildAppFileChange[];
  appliedChanges: BuildAppFileChange[];
  buildOutput?: string;
  buildOk?: boolean;
  testOutput?: string;
  testOk?: boolean;
  previewUrl?: string;
  deployments: BuildAppDeployment[];
  gitBranch?: string;
  lastCommit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildAppDeployment {
  id: string;
  target: DeploymentTarget;
  url: string;
  state: "ready" | "error" | "mock";
  mock: boolean;
  logs: string;
  createdAt: string;
}

export interface BuildAppRequest {
  message: string;
  projectId?: string;
  templateOverride?: BuildAppTemplateId;
}

export interface BuildAppAgentResult {
  plan: BuildAppPlan;
  project?: BuildAppProject;
  explanation: string;
  needsApproval: boolean;
  approvalPreview?: string;
  pendingChanges?: BuildAppFileChange[];
}

export interface VercelReadinessReport {
  ready: boolean;
  issues: string[];
  hasVercelJson: boolean;
  hasBuildScript: boolean;
  envVarsRequired: string[];
  envVarsPresent: string[];
}

export interface DeploymentPlan {
  projectId: string;
  target: DeploymentTarget;
  steps: string[];
  risks: string[];
  requiresApproval: boolean;
  mock: boolean;
}
