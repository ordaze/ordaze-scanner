import { Language, TrackingPattern } from "./types";

/**
 * Build a regex that matches `functionName("event_name"` or `functionName('event_name'`
 * or `functionName(\`event_name\`` and captures the event name in group 1.
 *
 * Backtick matches are restricted to content without `${` to avoid
 * capturing template literal expressions (e.g. `${dynamicName}`).
 */
function callRegex(fnName: string): RegExp {
  // Escape dots for method calls like `analytics.track`
  const escaped = fnName.replace(/\./g, "\\.");
  // Match quoted strings: "..." or '...' or `...` (backticks only if no ${)
  // Two alternations: (1) " or ' delimited, (2) ` delimited without ${ inside
  return new RegExp(
    `${escaped}\\s*\\(\\s*(?:["']([^"']+)["']|\`([^$\`]+)\`)`,
    "g",
  );
}

/** Extract event name from a callRegex match (group 1 or group 2).
 *  Rejects names that look like template expressions (contain ${). */
export function extractEventName(match: RegExpExecArray): string | null {
  const name = match[1] || match[2] || null;
  if (!name) return null;
  // Reject template literal expressions like ${name} or ${event_type}
  if (name.includes("${")) return null;
  return name;
}

/** Known analytics SDK import patterns -> tracking function names */
export interface SdkSignature {
  /** Package/import name to look for */
  importPattern: RegExp;
  /** SDK display name */
  sdk: string;
  /** Tracking function names this SDK uses */
  functionNames: string[];
  /** Languages this SDK applies to */
  languages: Language[];
}

export const SDK_SIGNATURES: SdkSignature[] = [
  // Firebase
  {
    importPattern: /firebase\/analytics|FirebaseAnalytics|import Firebase/,
    sdk: "firebase",
    functionNames: ["logEvent", "Analytics.logEvent"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java", "dart"],
  },
  // Segment
  {
    importPattern: /analytics-node|@segment\/analytics|import Segment|import Analytics/,
    sdk: "segment",
    functionNames: ["analytics.track", "Analytics.track"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java", "python", "go", "php", "ruby"],
  },
  // Amplitude
  {
    importPattern: /@amplitude\/analytics|amplitude-js|import Amplitude/,
    sdk: "amplitude",
    functionNames: ["amplitude.track", "Amplitude.getInstance().logEvent", "logEvent"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java", "python"],
  },
  // Mixpanel
  {
    importPattern: /mixpanel-browser|mixpanel|from ['"]mixpanel|import Mixpanel/,
    sdk: "mixpanel",
    functionNames: ["mixpanel.track", "Mixpanel.mainInstance().track", "mp.track"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java", "python", "ruby"],
  },
  // PostHog
  {
    importPattern: /posthog-js|posthog-node|posthog|import PostHog/,
    sdk: "posthog",
    functionNames: ["posthog.capture", "posthogClient.capture"],
    languages: ["typescript", "javascript", "python", "go", "ruby", "php"],
  },
  // Google Analytics / gtag
  {
    importPattern: /gtag\.js|googletagmanager|@types\/gtag/,
    sdk: "gtag",
    functionNames: ["gtag"],
    languages: ["typescript", "javascript"],
  },
  // Rudderstack
  {
    importPattern: /rudder-sdk-js|@rudderstack/,
    sdk: "rudderstack",
    functionNames: ["rudderanalytics.track", "analytics.track"],
    languages: ["typescript", "javascript"],
  },
  // Heap
  {
    importPattern: /heap-api|heapanalytics/,
    sdk: "heap",
    functionNames: ["heap.track"],
    languages: ["typescript", "javascript"],
  },
  // Braze (Appboy)
  {
    importPattern: /braze-web-sdk|@braze\/web-sdk|import Appboy|import BrazeKit/,
    sdk: "braze",
    functionNames: ["braze.logCustomEvent", "Appboy.logCustomEvent"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java"],
  },
  // Snowplow
  {
    importPattern: /@snowplow\/browser-tracker|snowplow-tracker/,
    sdk: "snowplow",
    functionNames: ["trackSelfDescribingEvent", "trackStructEvent"],
    languages: ["typescript", "javascript", "python", "go"],
  },
  // Pendo
  {
    importPattern: /pendo-io|@pendo/,
    sdk: "pendo",
    functionNames: ["pendo.track"],
    languages: ["typescript", "javascript"],
  },
  // CleverTap
  {
    importPattern: /clevertap-web-sdk|CleverTapSDK|com\.clevertap/,
    sdk: "clevertap",
    functionNames: ["clevertap.event.push", "CleverTap.pushEvent"],
    languages: ["typescript", "javascript", "swift", "kotlin", "java"],
  },
];

/**
 * Generic tracking function names to search for when no known SDK is detected.
 * These are common custom wrapper names across codebases.
 * Note: bare "track" is intentionally excluded -- too many false positives
 * (music players, GPS trackers, progress bars).
 */
export const GENERIC_FUNCTION_NAMES: Record<Language, string[]> = {
  typescript: ["trackEvent", "logEvent", "recordEvent", "sendEvent", "captureEvent", "analytics.track"],
  javascript: ["trackEvent", "logEvent", "recordEvent", "sendEvent", "captureEvent", "analytics.track"],
  swift: ["trackEvent", "logEvent", "recordEvent", "Analytics.track"],
  kotlin: ["trackEvent", "logEvent", "recordEvent", "Analytics.track"],
  java: ["trackEvent", "logEvent", "recordEvent", "Analytics.track"],
  python: ["track_event", "log_event", "record_event", "analytics.track"],
  go: ["TrackEvent", "LogEvent", "RecordEvent"],
  php: ["trackEvent", "logEvent", "Analytics::track"],
  ruby: ["track_event", "log_event", "Analytics.track"],
  dart: ["trackEvent", "logEvent", "recordEvent"],
};

/**
 * Build TrackingPattern objects for a set of function names.
 */
export function buildPatterns(
  functionNames: string[],
  source: TrackingPattern["source"],
  sdk?: string,
): TrackingPattern[] {
  return functionNames.map((fn) => ({
    functionName: fn,
    regex: callRegex(fn),
    source,
    sdk,
  }));
}
