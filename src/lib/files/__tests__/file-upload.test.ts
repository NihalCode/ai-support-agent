import { describe, expect, it } from "vitest";
import { detectFileType } from "../FileTypeDetector";
import { scanUpload } from "../FileSecurityScanner";
import { parseFileContent } from "../CybersecurityFileParsers";

const OPENAPI = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "CTIX", version: "1" },
  paths: {
    "/v3/indicators/": { get: {} },
    "/v3/tags/": { post: {} },
  },
});

const STIX = JSON.stringify({
  type: "bundle",
  objects: [{ type: "indicator", id: "indicator--1" }],
});

const SIGMA = `title: Suspicious PowerShell
detection:
  selection:
    EventID: 4688
  condition: selection
`;

describe("FileTypeDetector", () => {
  it("detects OpenAPI JSON", () => {
    expect(detectFileType("api.json", "application/json", OPENAPI)).toBe("openapi");
  });

  it("detects STIX bundle", () => {
    expect(detectFileType("bundle.json", "application/json", STIX)).toBe("stix");
  });

  it("detects Sigma YAML", () => {
    expect(detectFileType("rule.yml", "text/yaml", SIGMA)).toBe("sigma");
  });

  it("detects IOC CSV", () => {
    const csv = "type,value\nip,1.2.3.4\n";
    expect(detectFileType("iocs.csv", "text/csv", csv)).toBe("ioc_csv");
  });

  it("detects PCAP by extension", () => {
    expect(detectFileType("capture.pcap", "application/octet-stream", "")).toBe("pcap");
  });
});

describe("FileSecurityScanner", () => {
  it("blocks executable extensions", () => {
    const r = scanUpload("malware.exe", 100, "application/octet-stream");
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it("allows json uploads", () => {
    expect(scanUpload("spec.json", OPENAPI.length, "application/json").ok).toBe(true);
  });
});

describe("CybersecurityFileParsers", () => {
  it("parses OpenAPI with endpoint count", () => {
    const r = parseFileContent("openapi", "api.json", OPENAPI);
    expect(r.summary).toMatch(/2 endpoint/i);
    expect(r.suggestedIntents).toContain("generate_api_request");
  });

  it("parses STIX with object count", () => {
    const r = parseFileContent("stix", "bundle.json", STIX);
    expect(r.summary).toMatch(/1 object\(s\)/i);
  });

  it("parses Sigma rule title", () => {
    const r = parseFileContent("sigma", "rule.yml", SIGMA);
    expect(r.summary).toMatch(/1 Sigma rule/i);
  });

  it("parses IOC CSV rows", () => {
    const csv = "type,value\nip,1.2.3.4\ndomain,evil.test\n";
    const r = parseFileContent("ioc_csv", "iocs.csv", csv);
    expect(r.summary).toMatch(/2 row\(s\)/i);
  });

  it("gracefully handles PCAP", () => {
    const r = parseFileContent("pcap", "cap.pcap", "");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/parser not enabled/i);
  });
});
