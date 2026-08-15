# Repository Guidelines

Read the exact versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing any code.

## Project Structure & Module Organization

This is an Expo SDK 57 / React Native app using Expo Router and strict TypeScript. Route screens live in `src/app/` (`index.tsx`, `ai.tsx`, `transcribe.tsx`, and `settings.tsx`). Reusable UI primitives are in `src/components/ui/`; domain entities and services are in `src/domain/`; SQLite clients, migrations, repositories, and tests are in `src/db/`. AI and transcription integrations are under `src/services/`, while UI/session state lives in `src/stores/`. Shared date logic, theme tokens, utilities, and types are in `src/temporal/`, `src/theme/`, `src/lib/`, and `src/types/`. Product and architecture notes belong in `docs/`; images and app icons belong in `assets/`.

## Build, Test, and Development Commands

Use Bun for all package and development tasks:

```bash
bun install              # Install dependencies from bun.lock
bun start                # Start the Expo development server
bun run ios              # Build and run the iOS development app
bun run android          # Build and run Android
bun test                 # Run the Bun test suite
bun run lint             # Run Expo ESLint checks
bun run typecheck        # Run strict TypeScript checking
```

Read the versioned Expo 57 documentation before changing Expo or native-platform code.

Whenever a change adds or updates a dependency, plugin, permission, configuration, or
other functionality that requires native code (for example, Expo SQLite), run the
Android development EAS build before considering the change validated:

```bash
eas build --platform android --profile development
```

## Cross-Platform UI Design Rules

Every UI feature must maintain product and interaction parity on iOS and Android; do
not require pixel-perfect visual equivalence, since each platform has different native
capabilities. Use the iOS 26+ / 27 design direction as the shared product reference:
Liquid Glass on iOS where supported, using `expo-glass-effect`'s `GlassView` or
`GlassContainer`, and account for its documented fallback to a regular `View` on
unsupported platforms. On Android, translate that same direction into a practical
Android version rather than copying iOS code or omitting the pattern. This includes
floating buttons, floating tab bars, segmented controls, rounded surfaces, and floating
composers or input bars; their Android implementations may use flatter surfaces,
native Android spacing and interaction conventions, and different exact geometry.
Use `expo-blur` only when blur is needed, following its Android API requirements
(`BlurTargetView` and an appropriate `blurMethod`) and its documented performance
limitations on older Android versions.

Global blur rule: every new and existing component that needs a blurred or glass
surface must use `AdaptiveBlur` from `@/motion` (or a component that delegates to
it) on every platform. Do not import or render `BlurView` directly in product
components, and do not bypass `AdaptiveBlur` for one-off visual treatments. Pass
an explicit `blurTarget` only when the Android capture hierarchy is safe; otherwise
let `AdaptiveBlur` render its approved native fallback.

## Android Runtime & Native-View Safety

- A `BlurTargetView` must never contain a `BlurView` or `GlassSurface` that targets
  that same `BlurTargetView`. Dimezis BlurView forbids this recursive capture
  hierarchy and it can terminate the Android process during mounts, navigation, or
  overlay creation.
- Never distribute a root blur target through context or another implicit global
  mechanism. Pass a blur target explicitly only to bounded floating chrome that is
  a sibling of, and rendered outside, the target it captures.
- Never wrap the navigator, route tree, or an entire screen in a live `BlurView`.
  A full-screen `BlurTargetView` may capture route content only when every blur view
  using it is outside that target. Route-local Android glass without such a safe
  sibling target must render the approved translucent Tier C material without a
  native blur view.
- Treat mounting a menu, sheet, portal, modal, animated overlay, or newly focused
  route as a native-view lifecycle event. Audit its complete rendered hierarchy,
  explicit target/ref ownership, cleanup, and Android back behavior before assuming
  navigation itself is at fault.
- Keep one Expo Router navigator and derive custom-navigation selection from Router
  state. Global overlays may be siblings of the navigator, but route-derived state
  must be published only by the focused route so inactive mounted tabs cannot
  overwrite it.
- Android back handlers must be scoped to visible state and removed on cleanup. The
  handling order is context menu, modal/sheet/assistant, nested route, then system
  behavior; a handler must return `true` only when it actually owns the dismissal.
- For Android process exits, collect `adb logcat` around `AndroidRuntime`, React
  Native, Hermes, Reanimated, and the app process whenever device tooling exists.
  Do not call an interaction fixed solely because typecheck, lint, unit tests, or a
  bundle succeeds. If no device or `adb` is available, state that limitation and
  distinguish a statically corrected path from a runtime-confirmed fix.
- After changes to navigation, global overlays, blur/glass, gestures, Reanimated, or
  modal state, exercise launch, every tab transition, ten repeated tab loops, every
  quick-action path, assistant open/close followed by navigation, keyboard input,
  and Android back on a real Android runtime before declaring runtime validation.

## Coding Style & Naming Conventions

Use 2-space indentation, strict TypeScript, and the existing ESLint configuration. Use `PascalCase` for React components and classes, `camelCase` for functions, variables, and hooks (`useResolvedTheme`), and descriptive `*.test.ts` names. Prefer the `@/*` path alias for `src` imports. Keep styling in React Native `StyleSheet`s and reuse tokens from `src/theme/tokens.ts` rather than introducing ad hoc values.

## Testing Guidelines

Tests use Bun’s test runner and are colocated with the implementation, for example `src/db/migrator.test.ts`. Add focused regression coverage for database migrations, repositories, date handling, providers, and parsing changes. There is no configured coverage threshold; run `bun test`, `bun run lint`, and `bun run typecheck` before opening a PR.

## Architecture & Configuration Rules

Never edit a shipped SQLite migration; add the next numbered migration. Keep API keys in Expo SecureStore, never AsyncStorage, logs, or committed configuration. Do not add fake-success, demo-data, or mock-production behavior; failures should be typed and user-visible.
NEVER use, invoke, install, reference, depend on, or run GStack/gstack for this repository.

Android-first distribution does not permit Android-only domain architecture.
AETHER targets Android, iOS, and iPadOS; keep domain and service behavior portable
and place inherently native details behind platform adapters. Do not treat
`Platform.OS === 'ios'` as equivalent to iPhone when UI or native behavior can run
on iPadOS or at resizable widths.

## Known Tradeoff & Validation Debt Checkpoint

Before and near the end of work that intersects Universal Capture, native Android,
native iOS/iPadOS, Share Extensions, App Intents, App Groups, Quick Settings,
system sharing, native builds, release/build size, Android 16/API 36, or
public-beta/GA readiness, inspect `docs/KNOWN_TRADEOFFS.md` and ask internally:

> Does this task touch an unresolved tradeoff or provide an opportunity to close
> one with real evidence?

If yes, close the gap when it is safely within the task and available environment,
add or update tests/evidence, update the tradeoff status, and update related
documentation or the changelog when materially resolved. Never leave stale text
claiming a gap is open after real evidence closes it.

If closure requires a physical Android device, physical iPhone/iPad, Xcode, Apple
signing/provisioning, unavailable EAS quota, store-side artifact inspection, or
credentials unavailable to the environment, state that limitation explicitly.
Surface the relevant gate at the natural native-validation, beta, release, GA,
build/signing, or store-preparation point, and ask the user only when their action
is then required. Do not repeatedly request the same unavailable resource during
unrelated tasks, and do not block unrelated feature work solely because a
documented device gate remains open. This rule is persistent engineering memory,
not a recurring prompt.

## Changelog Guidelines

Before editing `CHANGELOG.md`, read `RULES.md` and follow its required entry format.
Keep entries in reverse chronological order, with the newest entry at the top. Use
the exact `## Unreleased - YYYY.MM.DD (N) [Entry Name]` heading format, and keep
the sequence number correct when multiple entries share a date. Use expressive,
feature-specific `###` headings rather than repeating generic labels such as
"Added", "Changed", or "Removed". Keep heading levels consecutive and
MD001-compliant. Include useful implementation, documentation, or test
references, and report native-device, live-provider, and other validation limits
honestly.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects matching history, such as `feat: ...`, `fix: ...`, or `chore: ...`. PRs should explain the behavior change, list validation commands, link relevant issues, and include screenshots or recordings for UI changes. Call out schema migrations, native permission changes, and configuration changes explicitly.
