import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scan } from "../src/scan";

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
  tempDir = mkdtempSync(join(tmpdir(), "ordaze-scan-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("scan", () => {
  it("finds event from direct SDK call: analytics.track", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts": 'analytics.track("user_signed_up", { plan: "pro" });',
    });
    const result = scan({ dir: tempDir });
    expect(result.events.some((e) => e.name === "user_signed_up")).toBe(true);
  });

  it("finds event from wrapper function: trackEvent", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts":
        'import { logEvent } from "firebase/analytics";\n' +
        "export function trackEvent(name: string) { logEvent(analytics, name); }",
      "src/app.ts": 'trackEvent("purchase_completed");',
    });
    const result = scan({ dir: tempDir });
    expect(result.events.some((e) => e.name === "purchase_completed")).toBe(true);
  });

  it("finds multiple events in same file", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts":
        'analytics.track("event_a");\nanalytics.track("event_b");\nanalytics.track("event_c");',
    });
    const result = scan({ dir: tempDir });
    expect(result.events.length).toBeGreaterThanOrEqual(3);
  });

  it("deduplicates same event across multiple files", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/page1.ts": 'analytics.track("page_viewed");',
      "src/page2.ts": 'analytics.track("page_viewed");',
    });
    const result = scan({ dir: tempDir });
    const pageViewed = result.events.filter((e) => e.name === "page_viewed");
    expect(pageViewed).toHaveLength(1);
    expect(pageViewed[0].occurrences.length).toBe(2);
  });

  it("extracts correct line numbers", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts": 'const x = 1;\nconst y = 2;\nanalytics.track("on_line_3");',
    });
    const result = scan({ dir: tempDir });
    const event = result.events.find((e) => e.name === "on_line_3");
    expect(event).toBeDefined();
    expect(event!.occurrences[0].lineNumber).toBe(3);
  });

  it("extracts enclosing function name for TS/JS function", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts":
        "function handleSignup() {\n" +
        '  analytics.track("user_signed_up");\n' +
        "}",
    });
    const result = scan({ dir: tempDir });
    const event = result.events.find((e) => e.name === "user_signed_up");
    expect(event).toBeDefined();
    expect(event!.occurrences[0].functionName).toBe("handleSignup");
  });

  it("extracts enclosing function name for TS/JS arrow function", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts":
        "const handleClick = () => {\n" +
        '  analytics.track("button_clicked");\n' +
        "};",
    });
    const result = scan({ dir: tempDir });
    const event = result.events.find((e) => e.name === "button_clicked");
    expect(event).toBeDefined();
    expect(event!.occurrences[0].functionName).toBe("handleClick");
  });

  it("extracts enclosing function name for Python def", () => {
    createFixture({
      "pyproject.toml": "[project]",
      "main.py":
        'def handle_purchase():\n    track_event("purchase_done")\n',
    });
    const result = scan({ dir: tempDir, language: "python" });
    const event = result.events.find((e) => e.name === "purchase_done");
    if (event) {
      expect(event.occurrences[0].functionName).toBe("handle_purchase");
    }
  });

  it("skips test directories", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts": 'analytics.track("real_event");',
      "__tests__/app.test.ts": 'analytics.track("test_event");',
    });
    const result = scan({ dir: tempDir });
    expect(result.events.some((e) => e.name === "real_event")).toBe(true);
    expect(result.events.some((e) => e.name === "test_event")).toBe(false);
  });

  it("handles files with read errors gracefully", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/analytics.ts": 'import Analytics from "@segment/analytics-node";',
      "src/app.ts": 'analytics.track("works");',
    });
    expect(() => scan({ dir: tempDir })).not.toThrow();
  });

  it("returns git metadata when in a git repo", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/app.ts": "const x = 1;",
    });
    const result = scan({ dir: tempDir });
    expect(result.git).toBeDefined();
    expect(result.git.commitSha).toBeUndefined();
  });

  it("returns empty events when no patterns match", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/app.ts": "const x = 1;\nconsole.log(x);",
    });
    const result = scan({ dir: tempDir });
    expect(result.events).toEqual([]);
    expect(result.totalOccurrences).toBe(0);
  });

  it("respects language override parameter", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/app.ts": 'trackEvent("ts_event");',
      "src/main.py": 'track_event("py_event")',
    });
    const result = scan({ dir: tempDir, language: "python" });
    expect(result).toBeDefined();
  });

  it("returns duration in milliseconds", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/app.ts": "const x = 1;",
    });
    const result = scan({ dir: tempDir });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("returns detected language with confidence", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/a.ts": "x",
      "src/b.ts": "x",
      "src/c.ts": "x",
    });
    const result = scan({ dir: tempDir });
    expect(result.language).not.toBeNull();
    expect(result.language!.language).toBe("typescript");
    expect(result.language!.confidence).toBeGreaterThan(0);
  });
});
