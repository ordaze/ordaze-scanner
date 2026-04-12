import { describe, it, expect } from "vitest";
import { buildPatterns, extractEventName, SDK_SIGNATURES, GENERIC_FUNCTION_NAMES } from "../src/patterns";

describe("callRegex (via buildPatterns)", () => {
  function testMatch(fnName: string, code: string): string | null {
    const patterns = buildPatterns([fnName], "builtin");
    const regex = new RegExp(patterns[0].regex.source, patterns[0].regex.flags);
    const match = regex.exec(code);
    return match ? extractEventName(match) : null;
  }

  it('matches double-quoted strings: track("event_name")', () => {
    expect(testMatch("track", 'track("user_signed_up")')).toBe("user_signed_up");
  });

  it("matches single-quoted strings: track('event_name')", () => {
    expect(testMatch("track", "track('purchase_completed')")).toBe("purchase_completed");
  });

  it("matches backtick strings: track(`event_name`)", () => {
    expect(testMatch("track", "track(`page_viewed`)")).toBe("page_viewed");
  });

  it('matches with whitespace: track( "event_name" )', () => {
    expect(testMatch("track", 'track( "checkout_started" )')).toBe("checkout_started");
  });

  it("does NOT match variable arguments: track(eventName)", () => {
    expect(testMatch("track", "track(eventName)")).toBeNull();
  });

  it('matches dotted method: analytics.track("name")', () => {
    expect(testMatch("analytics.track", 'analytics.track("button_clicked")')).toBe("button_clicked");
  });

  it("does NOT match template literal expressions: track(`${name}`)", () => {
    expect(testMatch("track", "track(`${name}`)")).toBeNull();
  });

  it("does NOT match template literal with prefix: track(`event_${x}`)", () => {
    expect(testMatch("track", "track(`event_${x}`)")).toBeNull();
  });

  it("does NOT match JSX artifacts: track('{eventInput}')", () => {
    expect(testMatch("track", "track('{eventInput}')")).toBeNull();
  });

  it("does NOT match closing brace artifacts: track('}something')", () => {
    expect(testMatch("track", "track('}something')")).toBeNull();
  });
});

describe("buildPatterns", () => {
  it("returns correct count and structure", () => {
    const patterns = buildPatterns(["trackEvent", "logEvent"], "builtin", "firebase");
    expect(patterns).toHaveLength(2);
    expect(patterns[0].functionName).toBe("trackEvent");
    expect(patterns[0].source).toBe("builtin");
    expect(patterns[0].sdk).toBe("firebase");
    expect(patterns[1].functionName).toBe("logEvent");
  });
});

describe("SDK_SIGNATURES", () => {
  it("has 12 SDK signatures", () => {
    expect(SDK_SIGNATURES.length).toBe(12);
  });

  it("each SDK has required fields", () => {
    for (const sdk of SDK_SIGNATURES) {
      expect(sdk.importPattern).toBeInstanceOf(RegExp);
      expect(sdk.sdk).toBeTruthy();
      expect(sdk.functionNames.length).toBeGreaterThan(0);
      expect(sdk.languages.length).toBeGreaterThan(0);
    }
  });
});

describe("GENERIC_FUNCTION_NAMES", () => {
  it('does not contain bare "track" in any language', () => {
    for (const [lang, names] of Object.entries(GENERIC_FUNCTION_NAMES)) {
      expect(names).not.toContain("track");
    }
  });

  it("covers all 10 supported languages", () => {
    const languages = Object.keys(GENERIC_FUNCTION_NAMES);
    expect(languages).toContain("typescript");
    expect(languages).toContain("javascript");
    expect(languages).toContain("swift");
    expect(languages).toContain("kotlin");
    expect(languages).toContain("java");
    expect(languages).toContain("python");
    expect(languages).toContain("go");
    expect(languages).toContain("php");
    expect(languages).toContain("ruby");
    expect(languages).toContain("dart");
  });
});
