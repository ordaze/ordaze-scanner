import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { discoverPatterns } from "../src/discover";

let tempDir: string;

function createFixture(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(tempDir, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ordaze-discover-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("discoverPatterns", () => {
  describe("Phase 1: SDK imports", () => {
    it("finds Firebase SDK import and returns logEvent pattern", () => {
      createFixture({
        "src/analytics.ts": 'import { logEvent } from "firebase/analytics";\nlogEvent(analytics, "test");',
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.some((p) => p.sdk === "firebase")).toBe(true);
      expect(patterns.some((p) => p.functionName === "logEvent")).toBe(true);
    });

    it("finds Segment SDK import and returns analytics.track pattern", () => {
      createFixture({
        "src/tracking.ts": 'import Analytics from "@segment/analytics-node";\nanalytics.track("event");',
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.some((p) => p.sdk === "segment")).toBe(true);
      expect(patterns.some((p) => p.functionName === "analytics.track")).toBe(true);
    });

    it("finds MULTIPLE SDKs across different files", () => {
      createFixture({
        "src/firebase.ts": 'import { logEvent } from "firebase/analytics";',
        "src/segment.ts": 'import Analytics from "@segment/analytics-node";',
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      const sdks = new Set(patterns.map((p) => p.sdk).filter(Boolean));
      expect(sdks.size).toBeGreaterThanOrEqual(2);
      expect(sdks.has("firebase")).toBe(true);
      expect(sdks.has("segment")).toBe(true);
    });
  });

  describe("Phase 2: Wrapper functions", () => {
    it("follows wrapper file that imports SDK and exports trackEvent", () => {
      createFixture({
        "src/analytics.ts":
          'import { logEvent } from "firebase/analytics";\n' +
          "export function trackEvent(name: string) { logEvent(analytics, name); }",
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.some((p) => p.functionName === "trackEvent" && p.source === "import-follow")).toBe(true);
    });

    it("ignores file named analytics that does not import any SDK", () => {
      createFixture({
        "src/analytics.ts":
          "export function trackEvent(name: string) { console.log(name); }",
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.some((p) => p.source === "import-follow")).toBe(false);
    });
  });

  describe("Phase 3: Generic fallback", () => {
    it("falls back to generic names when no SDK found", () => {
      createFixture({
        "src/main.ts": 'trackEvent("user_signed_up");\nlogEvent("test");',
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.source === "builtin")).toBe(true);
    });

    it("only includes generic names that appear with string args in codebase", () => {
      createFixture({
        "src/main.ts": 'trackEvent("real_event");',
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      const names = patterns.map((p) => p.functionName);
      expect(names).toContain("trackEvent");
      expect(names).not.toContain("logEvent");
    });

    it("does not include names that only appear as variable calls", () => {
      createFixture({
        "src/main.ts": "trackEvent(someVariable);",
      });
      const patterns = discoverPatterns(tempDir, "typescript");
      expect(patterns.some((p) => p.functionName === "trackEvent")).toBe(false);
    });
  });

  it("does NOT follow config functions that contain 'track' as substring", () => {
    createFixture({
      "src/analytics.ts":
        'import { logEvent } from "firebase/analytics";\n' +
        "export function isSessionTrackingEnabled() { return true; }\n" +
        "export function getNetworkTrackingConfig() { return {}; }\n" +
        "export function trackEvent(name: string) { logEvent(analytics, name); }",
    });
    const patterns = discoverPatterns(tempDir, "typescript");
    const wrapperNames = patterns
      .filter((p) => p.source === "import-follow")
      .map((p) => p.functionName);
    expect(wrapperNames).toContain("trackEvent");
    expect(wrapperNames).not.toContain("isSessionTrackingEnabled");
    expect(wrapperNames).not.toContain("getNetworkTrackingConfig");
  });

  it("returns empty array for directory with no source files", () => {
    const patterns = discoverPatterns(tempDir, "typescript");
    expect(patterns).toEqual([]);
  });
});
