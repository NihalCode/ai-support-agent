import "server-only";

/**
 * Built-in Cyware product presets — doc sources and env var mapping for CTIX,
 * CSAP, CFTR, and Orchestrate. One-click import uses Theneo llms.txt exports
 * (CSAP, Orchestrate, CTIX) or the Postman Documenter JSON (CFTR).
 */

export type CywareProductId = "ctix" | "csap" | "cftr" | "orchestrate";

export interface CywareProductPreset {
  id: CywareProductId;
  name: string;
  /** Public docs landing page (shown in UI). */
  docsSiteUrl: string;
  importStrategy: "theneo" | "postman-documenter";
  theneo?: { origin: string; project: string; llmsPath: string; llmsPaths?: string[] };
  postmanDocumenter?: { collectionUrl: string };
  /** Spec id written to the registry after import. */
  specId: string;
}

export const CYWARE_PRODUCT_PRESETS: Record<CywareProductId, CywareProductPreset> = {
  ctix: {
    id: "ctix",
    name: "Cyware Intel Exchange (CTIX)",
    docsSiteUrl: "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference",
    importStrategy: "theneo",
    theneo: {
      origin: "https://ctixapiv3.cyware.com",
      project: "intel-exchange-api-reference",
      llmsPath: "/intel-exchange-api-reference/llms.txt",
      llmsPaths: ["/intel-exchange-api-reference/llms.txt", "/llms.txt"],
    },
    specId: "cyware-ctix-api",
  },
  csap: {
    id: "csap",
    name: "Cyware Security Automation Platform (CSAP)",
    docsSiteUrl: "https://csapapi.cyware.com/",
    importStrategy: "theneo",
    theneo: {
      origin: "https://csapapi.cyware.com",
      project: "cyware-csap-api-reference",
      llmsPath: "/cyware-csap-api-reference/llms.txt",
      llmsPaths: ["/llms.txt", "/cyware-csap-api-reference/llms.txt"],
    },
    specId: "cyware-csap-api",
  },
  cftr: {
    id: "cftr",
    name: "Cyware Fusion and Threat Response (CFTR)",
    docsSiteUrl: "https://cftrapi.cyware.com/",
    importStrategy: "postman-documenter",
    postmanDocumenter: {
      collectionUrl:
        "https://cftrapi.cyware.com/api/collections/4787352/UVeDuTqn?segregateAuth=true&versionTag=latest",
    },
    specId: "cyware-cftr-api",
  },
  orchestrate: {
    id: "orchestrate",
    name: "Cyware Orchestrate",
    docsSiteUrl: "https://orchestrateapi.cyware.com/cyware-orchestrate-api-reference-theneo",
    importStrategy: "theneo",
    theneo: {
      origin: "https://orchestrateapi.cyware.com",
      project: "cyware-orchestrate-api-reference-theneo",
      llmsPath: "/cyware-orchestrate-api-reference-theneo/llms.txt",
      llmsPaths: [
        "/cyware-orchestrate-api-reference-theneo/llms.txt",
        "/cyware-orchestrate-api-reference/llms.txt",
        "/llms.txt",
      ],
    },
    specId: "cyware-orchestrate-api",
  },
};

export function listCywareProductPresets(): CywareProductPreset[] {
  return Object.values(CYWARE_PRODUCT_PRESETS);
}

export function getCywareProductPreset(id: string): CywareProductPreset | null {
  return CYWARE_PRODUCT_PRESETS[id as CywareProductId] ?? null;
}

/** Env var prefix per product (CTIX keeps CYWARE_* aliases for backward compat). */
export function envPrefixForProduct(id: CywareProductId): string {
  switch (id) {
    case "ctix":
      return "CYWARE";
    case "csap":
      return "CSAP";
    case "cftr":
      return "CFTR";
    case "orchestrate":
      return "ORCHESTRATE";
  }
}
