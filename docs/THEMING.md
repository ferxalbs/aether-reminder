# AETHER theming architecture

This document describes the implementation contract for product UI. It is not a
catalog of Material 3 roles.

## Identity

AETHER owns the visual hierarchy: OLED black in dark mode, restrained white/gray
typography, fixed typography and spacing, reusable rounded geometry, and a bounded
glass strategy for floating chrome. Android Dynamic Color personalizes the
interactive accent family; it does not recolor the canvas, every card, every
border, or status colors.

The dark canvas remains `#000000`. Raised surfaces remain AETHER neutral surfaces.
Destructive, warning, and success roles remain product status roles rather than
being replaced by the wallpaper's primary color.

## Token layers

- `src/theme/primitives.ts` owns immutable AETHER primitives: the monochrome base,
  spacing, primitive radii, touch targets, and typography.
- `src/theme/types.ts` defines the cross-platform `AetherTheme`, semantic colors,
  component tokens, and Material 3 input roles.
- `src/theme/resolveAetherTheme.ts` maps the selected appearance and optional
  Material palette into the AETHER semantic contract.
- `src/theme/materialYou.ts` is the only Android Material palette bridge.
- `src/theme/useAetherTheme.ts` is the product-facing resolver hook;
  `useSemanticColors()` is the compact color-only adapter.

`AetherTheme` exposes `colors`, `components`, `shape`, `radii`, `spacing`,
`typography`, `control`, and `motion`. Product components should consume these
roles instead of choosing light/dark hex values themselves.

Semantic color groups include canvas/surfaces, primary-to-tertiary text, subtle /
default / strong / selected / focused borders, separators, accent and on-accent
pairs, selected and pressed states, focus/ripple, status colors, glass fallback,
and scrim. Component tokens currently cover cards, buttons, fields, navigation,
switches, sheets, pills, and composers. `ShapeTokens` provides compact, control,
field, card, sheet, and pill roles; primitive radii remain available for
intentional one-off geometry.

## Appearance and color source are independent

`themePreference` controls appearance: `light`, `dark`, or `system`.
`materialColorsEnabled` controls the Android color source. The persisted boolean
is retained for compatibility; it is not a light/dark setting.

| Platform / capability | Appearance | Color source |
| --- | --- | --- |
| Android 12+ | OLED Dark, Light, or System | AETHER monochrome or wallpaper-derived Material You accents |
| Android 11 and below | OLED Dark, Light, or System | AETHER monochrome; Dynamic Color is unavailable |
| iOS / iPadOS | OLED Dark, Light, or System | AETHER semantic palette; no fake Android wallpaper palette |

The Settings row is Android-only and is disabled below Android 12. It uses
“Dynamic Colors” because that is the supported behavior; it does not claim that
older Android versions have Material You.

## Android Material You source

The bridge reads `isDynamicColorAvailable` from
`@expo/ui/jetpack-compose`. When enabled and available, it calls
`getMaterialColors({ scheme })` with no `seedColor`. In SDK 57 this is the
wallpaper-derived Android 12+ path. The palette is re-read when the app returns
to the foreground so wallpaper/system palette changes are not permanently cached.

The resolver consumes the same role values for React Native surfaces and native
controls:

| AETHER semantic | Material 3 input |
| --- | --- |
| `accent`, `interactive` | `primary` |
| `onAccent`, `interactiveForeground` | `onPrimary` |
| `accentContainer`, `selected`, navigation indicator | `primaryContainer` |
| `onAccentContainer`, selected foreground | `onPrimaryContainer` |
| `focus`, selected/focused border | `primary` |

The semantic mapper deliberately keeps `background`, `surface`, typography,
structural borders, glass, and product status roles AETHER-owned. Dynamic colors
are budgeted for primary actions, selected states, active navigation, switches,
focus, links/actions where appropriate, and progress/feedback—not applied as a
generic Material app skin.

`Host` controls follow the same policy. In wallpaper mode, native `Host` omits
`seedColor`, so Compose can read the system palette. In AETHER mode, the native
Picker uses the resolved AETHER accent as an explicit seed because an unseeded
Host below Android 12 would otherwise expose the SDK's unrelated static Material
3 baseline. The native Compose switch receives explicit semantic `SwitchColors`.
No product component supplies a seed in true Material You mode.

The old baseline purple values (`#6750A4`, `#D0BCFF`, `#EADDFF`, `#4F378B`) are
not stored as an AETHER Material palette and are not accepted as the Android
dynamic source. A palette supplied while dynamic capability is false is ignored
by the pure resolver.

## Android fallback

Android below API 31 has no wallpaper-derived Dynamic Color. The fallback is the
AETHER monochrome semantic theme. Native surfaces that need a Compose palette use
the deliberate AETHER accent seed described above; this is a seeded Material 3
fallback/tint strategy, not Material You and not a wallpaper claim.

## Native transient surfaces

Application-owned alerts use the platform-aware `AetherAlertDialog` semantic
adapter. Android renders its dialog through Expo UI's Jetpack Compose Material 3
`AlertDialog`; it inherits the wallpaper scheme in true Material You mode and
uses the existing AETHER accent seed only for the deterministic fallback. Apple
platforms use the native SwiftUI alert path.

The Settings appearance control remains a custom AETHER segmented control. It
is not a Material 2 surface, and keeping it preserves the existing geometry,
semantic colors, and shared Apple behavior. The existing Compose-backed switch,
DateTime picker, and bottom sheet likewise remain in place because their Android
implementations already use Material 3 primitives.

## Apple behavior

iOS and iPadOS use the same semantic contract and AETHER palette. SwiftUI-native
controls receive the resolved AETHER accent through supported native tint APIs;
they do not emulate Android wallpaper Dynamic Color. iPadOS remains part of the
shared Apple implementation, with adaptive layout/presentation decisions for
regular and resizable width classes rather than a separate theme system.

Expo Router's platform color API was considered but is not the semantic source of
truth here: direct platform dynamic colors would bypass AETHER's OLED/surface and
accent budget. Native system colors remain available to platform adapters where a
system control specifically requires them.

## Theming a new component

Use the semantic intent or component token:

```tsx
const theme = useAetherTheme();

<Pressable
  style={{
    backgroundColor: theme.components.button.primaryBackground,
    borderColor: theme.colors.borderFocused,
    borderRadius: theme.shape.control,
  }}
>
  <Typography color={theme.components.button.primaryForeground}>
    Save
  </Typography>
</Pressable>
```

Correct: `theme.colors.surfaceRaised`, `theme.colors.textSecondary`,
`theme.colors.selected`, or a component token chosen by intent.

Incorrect: a component-level `isDark ? "#121215" : "#F4F4F6"` branch, a direct
Material role lookup, a wallpaper lookup, or a `Host seedColor` used to imitate
wallpaper Dynamic Color.

## Authority

The implementation follows the [Expo SDK 57 Material Colors documentation](https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/colors/),
including its `Host`, `getMaterialColors`, `isDynamicColorAvailable`, and
seed-versus-wallpaper behavior. The native role model follows Android's
[Material 3 Compose guidance](https://developer.android.com/develop/ui/compose/designsystems/material3),
including `dynamicLightColorScheme`, `dynamicDarkColorScheme`,
`MaterialTheme.colorScheme`, and pairing `primary` with `onPrimary` (and container
roles with their corresponding `on` roles).
