import { readFileSync } from "fs";
import { Language, TrackingPattern } from "./types";
import { SDK_SIGNATURES, GENERIC_FUNCTION_NAMES, buildPatterns } from "./patterns";
import { collectSourceFiles } from "./files";

/**
 * Discover tracking patterns in a codebase using a 3-phase strategy:
 * 1. Scan for known SDK imports (Firebase, Segment, Amplitude, etc.)
 * 2. Follow wrapper functions that import SDKs and re-export tracking helpers
 * 3. Fall back to generic function names (trackEvent, logEvent, etc.)
 *
 * Accepts pre-collected files to avoid redundant directory walks.
 */
export function discoverPatterns(
  dir: string,
  language: Language,
  preCollectedFiles?: string[],
): TrackingPattern[] {
  const patterns: TrackingPattern[] = [];
  const seenFunctions = new Set<string>();

  // Use pre-collected files or collect now (max 500 for discovery phase)
  const files = preCollectedFiles || collectSourceFiles(dir, language, { maxDepth: 6, maxFiles: 500 });

  // Phase 1: Look for known SDK imports
  const sdkPatterns = findSdkImports(files, language);
  for (const p of sdkPatterns) {
    if (!seenFunctions.has(p.functionName)) {
      seenFunctions.add(p.functionName);
      patterns.push(p);
    }
  }

  // Phase 2: Follow wrapper imports. Look for files that re-export tracking functions
  const wrapperPatterns = findWrapperFunctions(files, language);
  for (const p of wrapperPatterns) {
    if (!seenFunctions.has(p.functionName)) {
      seenFunctions.add(p.functionName);
      patterns.push(p);
    }
  }

  // Phase 3: If nothing found, try generic function names
  if (patterns.length === 0) {
    const genericNames = GENERIC_FUNCTION_NAMES[language] || GENERIC_FUNCTION_NAMES.typescript;
    // Only add generic names that actually appear in the codebase
    const found = findUsedFunctions(files, genericNames);
    for (const p of buildPatterns(found, "builtin")) {
      if (!seenFunctions.has(p.functionName)) {
        seenFunctions.add(p.functionName);
        patterns.push(p);
      }
    }
  }

  return patterns;
}

/** Phase 1: Find known SDK imports in files */
function findSdkImports(files: string[], language: Language): TrackingPattern[] {
  const patterns: TrackingPattern[] = [];
  const seenSdks = new Set<string>();
  const applicableSdks = SDK_SIGNATURES.filter((s) => s.languages.includes(language));

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    for (const sdk of applicableSdks) {
      if (!seenSdks.has(sdk.sdk) && sdk.importPattern.test(content)) {
        seenSdks.add(sdk.sdk);
        patterns.push(...buildPatterns(sdk.functionNames, "builtin", sdk.sdk));
      }
    }
  }

  return patterns;
}

/**
 * Phase 2: Find wrapper functions.
 * Looks for files that export tracking-like functions and import from analytics SDKs.
 * e.g. a file that imports from "firebase/analytics" and exports "trackEvent"
 */
function findWrapperFunctions(files: string[], language: Language): TrackingPattern[] {
  const patterns: TrackingPattern[] = [];

  // Common wrapper file names
  const wrapperFilePatterns = [
    /analytics/i,
    /tracking/i,
    /telemetry/i,
    /events/i,
    /metrics/i,
  ];

  for (const file of files) {
    const fileName = file.toLowerCase();
    const isLikelyWrapper = wrapperFilePatterns.some((p) => p.test(fileName));
    if (!isLikelyWrapper) continue;

    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    // Check if this file imports from a known SDK
    const importsSDK = SDK_SIGNATURES.some(
      (s) => s.languages.includes(language) && s.importPattern.test(content),
    );
    if (!importsSDK) continue;

    // Find exported function names that look like tracking functions.
    // Require word boundary or specific suffixes to avoid matching config
    // functions like isSessionTrackingEnabled or getNetworkTrackingConfig.
    const exportedFunctions = extractExportedFunctions(content, language);
    const trackingLike = exportedFunctions.filter((fn) =>
      /^track\w*Event|^log\w*Event|^capture\w*|^record\w*Event|^send\w*Event|^report\w*Event|\.track$|\.capture$|\.logEvent$/i.test(fn),
    );

    if (trackingLike.length > 0) {
      patterns.push(...buildPatterns(trackingLike, "import-follow"));
    }
  }

  return patterns;
}

/** Extract exported function names from a source file */
function extractExportedFunctions(content: string, language: Language): string[] {
  const names: string[] = [];

  if (language === "typescript" || language === "javascript") {
    // export function trackEvent(...)
    const fnMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const m of fnMatches) names.push(m[1]);

    // export const trackEvent = ...
    const constMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+)\s*=/g);
    for (const m of constMatches) names.push(m[1]);
  } else if (language === "swift") {
    // public/static func trackEvent
    const fnMatches = content.matchAll(/(?:public|open|static)\s+func\s+(\w+)/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "kotlin" || language === "java") {
    // fun trackEvent
    const fnMatches = content.matchAll(/(?:fun|public\s+(?:static\s+)?void|public\s+(?:static\s+)?)\s+(\w+)\s*\(/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "python") {
    // def track_event
    const fnMatches = content.matchAll(/def\s+(\w+)\s*\(/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "go") {
    // func TrackEvent
    const fnMatches = content.matchAll(/func\s+(\w+)\s*\(/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "php") {
    // public function trackEvent
    const fnMatches = content.matchAll(/(?:public|protected|private|static)\s+function\s+(\w+)/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "ruby") {
    // def track_event
    const fnMatches = content.matchAll(/def\s+(?:self\.)?(\w+)/g);
    for (const m of fnMatches) names.push(m[1]);
  } else if (language === "dart") {
    // void trackEvent(...) / Future<void> trackEvent(...) / static trackEvent(...)
    const fnMatches = content.matchAll(/(?:void|Future|static)\s+(\w+)\s*\(/g);
    for (const m of fnMatches) names.push(m[1]);
  }

  return names;
}

/** Phase 3: Check which generic function names actually appear in files */
function findUsedFunctions(files: string[], functionNames: string[]): string[] {
  const found = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    for (const fn of functionNames) {
      // Check if the function is called with a string argument (not a template expression)
      const escaped = fn.replace(/\./g, "\\.");
      const regex = new RegExp(`${escaped}\\s*\\(\\s*["']`, "g");
      if (regex.test(content)) {
        found.add(fn);
      }
    }
  }

  return Array.from(found);
}
