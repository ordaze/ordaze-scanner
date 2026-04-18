
# @ordaze/scanner

[![npm version](https://img.shields.io/npm/v/@ordaze/scanner.svg)](https://www.npmjs.com/package/@ordaze/scanner)
[![npm downloads](https://img.shields.io/npm/dm/@ordaze/scanner.svg)](https://www.npmjs.com/package/@ordaze/scanner)
[![license](https://img.shields.io/npm/l/@ordaze/scanner.svg)](./LICENSE)

> Scan your codebase for analytics events. Detect SDKs, discover tracking patterns, report coverage to Ordaze.

**Ordaze is an analytics event registry for product and engineering teams** — a versioned tracking plan, type-safe code generation for 13 languages, and this scanner: a static source-code analyzer that runs in CI to catch analytics drift before it ships. Nothing runs in production, no SDK is required on the target repo, and no user data ever leaves your servers.

- Website: [ordaze.com](https://ordaze.com)
- What is Ordaze: [ordaze.com/what-is-ordaze](https://ordaze.com/what-is-ordaze)
- iOS teams: [ordaze.com/for-ios](https://ordaze.com/for-ios)
- Android teams: [ordaze.com/for-android](https://ordaze.com/for-android)
- Scanner docs: [ordaze.com/docs/scanner](https://ordaze.com/docs/scanner)

---

## Quick start (30 seconds)

```bash
# Scan the current directory and report to Ordaze
npx @ordaze/scanner scan \
  --token=$ORDAZE_TOKEN \
  --url=https://app.ordaze.com \
  --source=web
```

You'll see something like:

```
Scanning /home/you/apps/storefront...
Detected: typescript (92% confidence)
Found 35 unique events (44 occurrences)

  purchase_completed    — src/checkout/PurchaseFlow.ts:124
  coupon_applied        — src/checkout/PurchaseFlow.ts:98
  cart_viewed           — src/cart/Cart.tsx:42
  ...

Reported to Ordaze ✓
  matched:   28
  missing:    6    (in registry, not found in code)
  unmatched:  7    (in code, not found in registry)
  coverage:  80%
```

Everything after that — fixing mismatches, filling the registry — happens in the dashboard at [app.ordaze.com](https://app.ordaze.com).

---

## Generated code

Ordaze ships default Handlebars templates for all 13 supported languages. Here's what the scanner's sibling codegen produces for a `purchase_completed` event with `amount: number`, `currency: string`, and optional `coupon_code: string`:

### Swift

```swift
extension Analytics {
    static func purchaseCompleted(amount: Int, currency: String, couponCode: String? = nil) -> Analytics.V2Event {
        var parameters: [String: Any] = [:]
        parameters["amount"] = amount
        parameters["currency"] = currency
        if let couponCode { parameters["coupon_code"] = couponCode }
        return Analytics.V2Event(name: "purchase_completed", parameters: parameters)
    }
}
```

### Kotlin

```kotlin
sealed class AnalyticsEvent(val eventName: String, val bundle: Bundle? = null) {
    data class PurchaseCompleted(
        val amount: Int,
        val currency: String,
        val couponCode: String? = null,
    ) : AnalyticsEvent(
        "purchase_completed",
        bundleOf(
            "amount" to amount,
            "currency" to currency,
            "coupon_code" to couponCode,
        )
    )
}
```

### TypeScript

```ts
export interface PurchaseCompletedProperties {
  amount: number;
  currency: string;
  couponCode?: string;
}

export function purchaseCompleted(
  properties: PurchaseCompletedProperties,
): AnalyticsEvent<"purchase_completed", PurchaseCompletedProperties> {
  return { name: "purchase_completed", properties };
}
```

All 13 languages (Swift, Kotlin, TypeScript, Python, Java, JavaScript, C#, Go, Rust, Ruby, PHP, Dart, React Native) ship with a default template you can customize in the in-app editor. See [ordaze.com/docs/code-generation](https://ordaze.com/docs/code-generation) for per-language output.

---

## GitHub Action

```yaml
name: Event Coverage
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Jasiuno/ordaze-scanner@v1
        with:
          token: ${{ secrets.ORDAZE_TOKEN }}
          url: ${{ secrets.ORDAZE_URL }}
          strict: true
          min-coverage: 80
```

The action fails the PR when coverage drops below the threshold, so a broken event never reaches production. Full setup at [ordaze.com/docs/scanner](https://ordaze.com/docs/scanner).

---

## CLI options

```
Usage: ordaze-scan [options]

Options:
  --dir=<path>             Directory to scan (default: current directory)
  --token=<api-token>      Ordaze API token (env: ORDAZE_TOKEN)
  --url=<base-url>         Ordaze API base URL (env: ORDAZE_URL, default: https://app.ordaze.com)
  --source=<slug>          Source slug (e.g. ios, android, web, backend)
  --platform=<slug>        Alias for --source (legacy)
  --ext=<"*.ts *.tsx">     Limit file extensions (defaults to auto-detected language)
  --repo=<name>            Override auto-detected repo name
  --version=<tag>          Override auto-detected version
  --append                 Merge with existing results (multi-repo scans)
  --strict                 Exit 1 if coverage is below --min-coverage
  --min-coverage=<0-100>   Minimum coverage percentage (used with --strict)
  --dry-run                Scan but do not report to Ordaze
  --json                   Emit results as JSON instead of human text
  --help                   Show this help
  --version                Print version
```

---

## Programmatic usage

```ts
import { scan } from "@ordaze/scanner";

const result = scan({ dir: "." });

console.log(`Found ${result.events.length} unique events`);
for (const event of result.events) {
  console.log(`  ${event.name} (${event.occurrences.length} occurrences)`);
  for (const occ of event.occurrences) {
    console.log(`    ${occ.filePath}:${occ.lineNumber} in ${occ.functionName ?? "<top-level>"}`);
  }
}
```

See [src/types.ts](./src/types.ts) for the full `ScanResult` shape.

---

## Supported SDKs

The scanner recognizes call patterns from 12 analytics SDKs out of the box:

| | |
|---|---|
| Segment (analytics.js / Analytics-Swift / Analytics-Kotlin) | Amplitude |
| Mixpanel | Firebase Analytics |
| PostHog | Google Analytics (gtag) |
| RudderStack | Heap |
| Braze | Snowplow |
| Pendo | CleverTap |

If your team wraps one of these SDKs in a helper like `myAnalytics.track()`, the scanner only catches calls that also hit a recognized SDK pattern inside the wrapper. Custom wrapper registration (a `--wrappers` flag) is on the roadmap — track it on the [scanner docs page](https://ordaze.com/docs/scanner).

---

## How it works (and what it doesn't)

The scanner is **regex-based**, not AST-based. That's a deliberate choice:

- **Language-agnostic by default.** Adding a new language means adding a pattern, not shipping a per-language compiler.
- **Fast.** Scans a typical mobile app repo in under a second. Suitable for every PR, not just nightly.
- **No build dependency.** It doesn't care whether your TypeScript compiles, your Kotlin is on the latest Gradle, or your Swift project links.

The tradeoffs, stated plainly:

- **Dynamic event names get flagged for review.** `track(eventName)` where `eventName` is a variable is reported as "ambiguous," not matched.
- **Custom wrappers need registration.** See above — on the roadmap.
- **We don't resolve calls across files.** A function that wraps `track()` in another module won't be detected unless its *own* name matches a known SDK pattern.

If you need true call-graph resolution, the Ordaze team is tracking the request — open an issue with your use case. For most teams, regex + the in-app mapping step catches ~95% of real events, and the rest get flagged for manual review instead of silently missed.

---

## Contributing

PRs welcome. The scanner is intentionally minimal — small surface, few dependencies, broad language coverage. If you want to add a new SDK pattern or a new language auto-detect rule:

1. Fork + branch.
2. Add your pattern to `src/patterns.ts`.
3. Add a fixture + test in `tests/`.
4. Open a PR with real-world source code the pattern catches (and a case it intentionally doesn't, if relevant).

For bigger changes (call-graph resolution, wrapper registration, new output formats), open an issue first so we can align on scope.

---

## License

MIT. See [LICENSE](./LICENSE).

