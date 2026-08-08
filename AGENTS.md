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
bun run web              # Start the web target
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

## Coding Style & Naming Conventions

Use 2-space indentation, strict TypeScript, and the existing ESLint configuration. Use `PascalCase` for React components and classes, `camelCase` for functions, variables, and hooks (`useResolvedTheme`), and descriptive `*.test.ts` names. Prefer the `@/*` path alias for `src` imports. Keep styling in React Native `StyleSheet`s and reuse tokens from `src/theme/tokens.ts` rather than introducing ad hoc values.

## Testing Guidelines

Tests use Bun’s test runner and are colocated with the implementation, for example `src/db/migrator.test.ts`. Add focused regression coverage for database migrations, repositories, date handling, providers, and parsing changes. There is no configured coverage threshold; run `bun test`, `bun run lint`, and `bun run typecheck` before opening a PR.

## Architecture & Configuration Rules

Never edit a shipped SQLite migration; add the next numbered migration. Keep API keys in Expo SecureStore, never AsyncStorage, logs, or committed configuration. Do not add fake-success, demo-data, or mock-production behavior; failures should be typed and user-visible.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects matching history, such as `feat: ...`, `fix: ...`, or `chore: ...`. PRs should explain the behavior change, list validation commands, link relevant issues, and include screenshots or recordings for UI changes. Call out schema migrations, native permission changes, and configuration changes explicitly.
