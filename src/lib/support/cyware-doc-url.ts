import "server-only";

import {
  CYWARE_PRODUCT_PRESETS,
  type CywareProductId,
  type CywareProductPreset,
} from "./cyware-products";
import type { NormalizedApiSpec, NormalizedEndpoint } from "./types";

/** Convert Theneo `.md` export URL to the browsable docs SPA path. */
export function theneoMdToBrowseUrl(mdUrl: string): string {
  try {
    const u = new URL(mdUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !parts[parts.length - 1]!.endsWith(".md")) return mdUrl;
    const project = parts[0]!;
    const rest = parts
      .slice(1)
      .join("/")
      .replace(/\.md$/i, "");
    return `${u.origin}/${project}/${project}/${rest}`;
  } catch {
    return mdUrl;
  }
}

export function slugifyDocTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function presetForSpec(spec?: NormalizedApiSpec, sourceName?: string): CywareProductPreset | undefined {
  if (spec?.id) {
    const hit = Object.values(CYWARE_PRODUCT_PRESETS).find((p) => p.specId === spec.id);
    if (hit) return hit;
  }
  if (sourceName) {
    const lower = sourceName.toLowerCase();
    return Object.values(CYWARE_PRODUCT_PRESETS).find((p) => lower.includes(p.id) || lower.includes(p.name.toLowerCase()));
  }
  return undefined;
}

function guessTheneoBrowseUrl(
  preset: CywareProductPreset,
  ep: NormalizedEndpoint
): string | undefined {
  const theneo = preset.theneo;
  if (!theneo) return preset.docsSiteUrl;
  const pathParts = ep.path
    .replace(/^\/|\/$/g, "")
    .split("/")
    .filter((p) => p && !p.startsWith("{"));
  const category = pathParts[0] ?? "endpoints";
  const slug = slugifyDocTitle(ep.name);
  if (!slug) return preset.docsSiteUrl;
  return `${theneo.origin}/${theneo.project}/${theneo.project}/${category}/${slug}`;
}

function guessCftrBrowseUrl(preset: CywareProductPreset, ep: NormalizedEndpoint): string {
  const slug = slugifyDocTitle(ep.name);
  const base = preset.docsSiteUrl.replace(/\/$/, "");
  return slug ? `${base}/#${slug}` : base;
}

/** Resolve a deep link to the exact API reference page for an endpoint. */
export function resolveApiDocUrl(input: {
  spec?: NormalizedApiSpec;
  endpoint?: NormalizedEndpoint;
  title?: string;
  method?: string;
  path?: string;
  docUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
}): string | undefined {
  if (input.docUrl) return theneoMdToBrowseUrl(input.docUrl);

  const ep: NormalizedEndpoint | undefined =
    input.endpoint ??
    (input.title && input.method && input.path
      ? ({
          name: input.title,
          method: input.method,
          path: input.path,
          docUrl: input.docUrl,
          headersRequired: [],
          headersOptional: [],
          pathParams: [],
          queryParams: [],
          requiredFields: [],
          optionalFields: [],
          responses: [],
          effect: "read",
        } satisfies NormalizedEndpoint)
      : undefined);

  const spec = input.spec;
  const preset = presetForSpec(spec, input.sourceName ?? spec?.name);
  if (!preset) return input.sourceUrl ? theneoMdToBrowseUrl(input.sourceUrl) : undefined;

  if (ep?.docUrl) return theneoMdToBrowseUrl(ep.docUrl);

  if (preset.importStrategy === "theneo" && ep) {
    return guessTheneoBrowseUrl(preset, ep);
  }

  if (preset.id === "cftr" && ep) {
    return guessCftrBrowseUrl(preset, ep);
  }

  return preset.docsSiteUrl;
}

export function cqlDocUrl(input: {
  pageUrl?: string;
  heading?: string;
  url?: string;
}): string | undefined {
  if (input.url) return input.url;
  if (!input.pageUrl) return undefined;
  const anchor = input.heading ? slugifyDocTitle(input.heading) : "";
  return anchor ? `${input.pageUrl}#${anchor}` : input.pageUrl;
}

export function productIdFromSource(sourceName?: string): CywareProductId | undefined {
  if (!sourceName) return undefined;
  const lower = sourceName.toLowerCase();
  for (const id of ["ctix", "csap", "cftr", "orchestrate"] as CywareProductId[]) {
    if (lower.includes(id)) return id;
  }
  return undefined;
}
