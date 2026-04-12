import type { ScanResult } from "./types";

export interface ReportPayload {
  source: string;
  repo?: string;
  scannerVersion: string;
  commitSha?: string;
  branch?: string;
  duration: number;
  events: Array<{
    name: string;
    filePath?: string;
    occurrences: Array<{
      filePath: string;
      lineNumber: number;
      columnNumber?: number;
      lineContent: string;
      functionName?: string;
      matchType: string;
    }>;
  }>;
}

export interface ReportResponse {
  matched: number;
  unmatched: string[];
  missing: string[];
  total: number;
  autoCreated?: number;
}

export interface CatalogResponse {
  protocolVersion: number;
  events: Array<{
    name: string;
    camelCase?: string;
    pascalCase?: string;
    status: string;
    properties?: string[];
    fields?: Record<string, string>;
  }>;
  excludeFiles?: string[];
  version?: string;
}

/**
 * Build a report payload from scan results.
 */
export function buildReportPayload(
  result: ScanResult,
  options: { source: string; repo?: string; scannerVersion: string },
): ReportPayload {
  return {
    source: options.source,
    repo: options.repo || result.git.repo,
    scannerVersion: options.scannerVersion,
    commitSha: result.git.commitSha,
    branch: result.git.branch,
    duration: result.duration,
    events: result.events.map((e) => ({
      name: e.name,
      filePath: e.occurrences[0]?.filePath,
      occurrences: e.occurrences.map((o) => ({
        filePath: o.filePath,
        lineNumber: o.lineNumber,
        columnNumber: o.columnNumber,
        lineContent: o.lineContent,
        functionName: o.functionName,
        matchType: o.matchType,
      })),
    })),
  };
}

/**
 * Report scan results to the Ordaze API.
 */
export async function reportUsage(
  url: string,
  token: string,
  payload: ReportPayload,
): Promise<ReportResponse> {
  const resp = await fetch(`${url}/api/v1/usage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to report (HTTP ${resp.status}): ${text}`);
  }

  return resp.json();
}

/**
 * Fetch the event catalog from the Ordaze API.
 */
export async function fetchCatalog(
  url: string,
  token: string,
  source?: string,
): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (source) params.set("source", source);

  const resp = await fetch(`${url}/api/v1/catalog?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to fetch catalog (HTTP ${resp.status}): ${text}`);
  }

  return resp.json();
}
