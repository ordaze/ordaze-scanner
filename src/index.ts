// Core scan function
export { scan } from "./scan";
export type { ScanOptions } from "./scan";

// Language detection
export { detectLanguage } from "./detect-language";

// Pattern discovery
export { discoverPatterns } from "./discover";

// Pattern utilities
export { buildPatterns, extractEventName, SDK_SIGNATURES, GENERIC_FUNCTION_NAMES } from "./patterns";
export type { SdkSignature } from "./patterns";

// File collection
export { collectSourceFiles } from "./files";
export type { CollectOptions } from "./files";

// API reporting
export { reportUsage, fetchCatalog } from "./report";
export type { ReportPayload, ReportResponse, CatalogResponse } from "./report";

// All types
export type {
  Language,
  DetectedLanguage,
  TrackingPattern,
  Occurrence,
  DiscoveredEvent,
  ScanResult,
} from "./types";
export { SKIP_DIRS, EXT_TO_LANGUAGE } from "./types";
