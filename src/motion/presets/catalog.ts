import { MotionSprings as Motion } from "@/theme/motionSprings";
import type {
  MotionPresetId,
  MotionTier,
  ResolvedMotionPreset,
} from "../core/types";

const SPRING = Motion;

function preset(
  id: MotionPresetId,
  tier: MotionTier,
  overrides: Partial<ResolvedMotionPreset>,
): ResolvedMotionPreset {
  return {
    id,
    tier,
    mode: "spring",
    durationMs: Motion.reducedMotionDuration,
    damping: SPRING.pressSpring.damping,
    stiffness: SPRING.pressSpring.stiffness,
    mass: SPRING.pressSpring.mass,
    scale: 1,
    translateY: 0,
    opacityFrom: 1,
    haptic: true,
    secondaryMotion: false,
    continuous: false,
    ...overrides,
  };
}

function byTier<T>(tier: MotionTier, values: Record<MotionTier, T>): T {
  return values[tier];
}

export function resolveMotionPreset(
  id: MotionPresetId,
  tier: MotionTier,
): ResolvedMotionPreset {
  switch (id) {
    case "task.enter":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "timing",
        }),
        durationMs: byTier(tier, {
          full: 280,
          standard: 220,
          reduced: 160,
          minimal: 120,
        }),
        translateY: byTier(tier, {
          full: 10,
          standard: 8,
          reduced: 4,
          minimal: 0,
        }),
        opacityFrom: byTier(tier, {
          full: 0,
          standard: 0,
          reduced: 0,
          minimal: 0,
        }),
        damping: SPRING.cardSpring.damping,
        stiffness: SPRING.cardSpring.stiffness,
        mass: SPRING.cardSpring.mass,
        secondaryMotion: tier === "full",
      });
    case "task.complete":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "timing",
        }),
        durationMs: byTier(tier, {
          full: 220,
          standard: 180,
          reduced: 140,
          minimal: 120,
        }),
        scale: byTier(tier, { full: 1, standard: 1, reduced: 1, minimal: 1 }),
        damping: SPRING.cardSpring.damping,
        stiffness: SPRING.cardSpring.stiffness,
        mass: SPRING.cardSpring.mass,
        secondaryMotion: tier === "full",
        haptic: true,
      });
    case "task.dismiss":
      return preset(id, tier, {
        mode: tier === "minimal" ? "timing" : "spring",
        durationMs: byTier(tier, {
          full: 240,
          standard: 200,
          reduced: 150,
          minimal: 120,
        }),
        translateY: byTier(tier, {
          full: -8,
          standard: -6,
          reduced: 0,
          minimal: 0,
        }),
        opacityFrom: 1,
        haptic: true,
      });
    case "task.reorder":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 260,
          standard: 220,
          reduced: 140,
          minimal: 0,
        }),
        haptic: tier !== "minimal",
      });
    case "navigation.push":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 260,
          standard: 220,
          reduced: 160,
          minimal: 0,
        }),
        damping: SPRING.screenSpring.damping,
        stiffness: SPRING.screenSpring.stiffness,
        mass: SPRING.screenSpring.mass,
        translateY: byTier(tier, {
          full: 12,
          standard: 8,
          reduced: 0,
          minimal: 0,
        }),
        opacityFrom: 0,
        haptic: false,
        secondaryMotion: tier === "full",
      });
    case "navigation.tab":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 140,
          standard: 120,
          reduced: 80,
          minimal: 0,
        }),
        damping: 34,
        stiffness: 480,
        mass: 0.4,
        haptic: false,
      });
    case "navigation.modal":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 300,
          standard: 240,
          reduced: 160,
          minimal: 0,
        }),
        damping: SPRING.sheetSpring.damping,
        stiffness: SPRING.sheetSpring.stiffness,
        mass: SPRING.sheetSpring.mass,
        haptic: false,
      });
    case "surface.press":
      return preset(id, tier, {
        mode: tier === "minimal" ? "none" : "spring",
        scale: byTier(tier, {
          full: Motion.pressScale,
          standard: Motion.pressScale,
          reduced: Motion.buttonPressScale,
          minimal: 1,
        }),
        damping: SPRING.pressSpring.damping,
        stiffness: SPRING.pressSpring.stiffness,
        mass: SPRING.pressSpring.mass,
        haptic: true,
      });
    case "surface.release":
      return preset(id, tier, {
        mode: tier === "minimal" ? "none" : "spring",
        scale: 1,
        damping: SPRING.pressSpring.damping,
        stiffness: SPRING.pressSpring.stiffness,
        mass: SPRING.pressSpring.mass,
        haptic: false,
      });
    case "orb.idle":
      return preset(id, tier, {
        mode: tier === "full" ? "spring" : "none",
        continuous: tier === "full",
        secondaryMotion: tier === "full",
        haptic: false,
      });
    case "orb.listen":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        continuous: tier === "full" || tier === "standard",
        scale: byTier(tier, {
          full: 1.04,
          standard: 1.03,
          reduced: 1.02,
          minimal: 1,
        }),
        haptic: true,
      });
    case "orb.think":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "timing",
          reduced: "none",
          minimal: "none",
        }),
        continuous: tier === "full",
        haptic: false,
      });
    case "orb.success":
      return preset(id, tier, {
        mode: tier === "minimal" ? "timing" : "spring",
        durationMs: byTier(tier, {
          full: 220,
          standard: 180,
          reduced: 140,
          minimal: 120,
        }),
        haptic: true,
      });
    case "orb.error":
      return preset(id, tier, {
        mode: "timing",
        durationMs: 140,
        haptic: true,
      });
    case "capture.enter":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "timing",
        }),
        durationMs: byTier(tier, {
          full: 240,
          standard: 200,
          reduced: 150,
          minimal: 120,
        }),
        opacityFrom: 0,
        haptic: false,
      });
    case "capture.commit":
      return preset(id, tier, {
        mode: tier === "minimal" ? "timing" : "spring",
        durationMs: byTier(tier, {
          full: 220,
          standard: 180,
          reduced: 140,
          minimal: 120,
        }),
        haptic: true,
      });
    case "sheet.present":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "spring",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 280,
          standard: 220,
          reduced: 150,
          minimal: 0,
        }),
        damping: SPRING.sheetSpring.damping,
        stiffness: SPRING.sheetSpring.stiffness,
        mass: SPRING.sheetSpring.mass,
        haptic: false,
      });
    case "sheet.dismiss":
      return preset(id, tier, {
        mode: byTier(tier, {
          full: "spring",
          standard: "timing",
          reduced: "timing",
          minimal: "none",
        }),
        durationMs: byTier(tier, {
          full: 220,
          standard: 160,
          reduced: 120,
          minimal: 0,
        }),
        haptic: false,
      });
  }
}

export const MOTION_PRESET_IDS: MotionPresetId[] = [
  "task.enter",
  "task.complete",
  "task.dismiss",
  "task.reorder",
  "navigation.push",
  "navigation.tab",
  "navigation.modal",
  "surface.press",
  "surface.release",
  "orb.idle",
  "orb.listen",
  "orb.think",
  "orb.success",
  "orb.error",
  "capture.enter",
  "capture.commit",
  "sheet.present",
  "sheet.dismiss",
];
