# @ordaze/scanner

Scan your codebase for analytics events. Detect SDKs, discover tracking patterns, and report coverage to [Ordaze](https://ordaze.com).

## Features

- Auto-detects language (TypeScript, Swift, Kotlin, Python, Go, PHP, Ruby, Dart, Java)
- Recognizes 12 analytics SDKs (Segment, Amplitude, Mixpanel, PostHog, Firebase, and more)
- 3-phase pattern discovery: SDK imports, wrapper functions, generic fallback
- Per-file, per-line occurrence tracking with enclosing function names
- Zero dependencies (pure Node.js stdlib)

## CLI Usage

```bash
# Install globally
npm install -g @ordaze/scanner

# Or run with npx
npx @ordaze/scanner --dir=.

# Scan and report to Ordaze
ordaze-scan --dir=. --token=atk_xxx --url=https://app.ordaze.com --source=web

# CI mode: fail if coverage below 80%
ordaze-scan --dir=. --token=atk_xxx --url=https://app.ordaze.com --strict --min-coverage=80

# Dry run (scan without reporting)
ordaze-scan --dir=. --dry-run

# JSON output
ordaze-scan --dir=. --json
```

## GitHub Action

```yaml
- uses: Jasiuno/ordaze-scanner@v1
  with:
    token: ${{ secrets.ORDAZE_TOKEN }}
    url: ${{ secrets.ORDAZE_URL }}
    strict: true
    min-coverage: 80
```

## Programmatic Usage

```typescript
import { scan } from "@ordaze/scanner";

const result = scan({ dir: "." });

console.log(`Found ${result.events.length} events`);
for (const event of result.events) {
  console.log(`  ${event.name} (${event.occurrences.length} occurrences)`);
}
```

## Supported SDKs

Firebase, Segment, Amplitude, Mixpanel, PostHog, Google Analytics (gtag), Rudderstack, Heap, Braze, Snowplow, Pendo, CleverTap

## License

MIT
