export const MotionSprings = {
  pressSpring: {
    damping: 28,
    stiffness: 380,
    mass: 0.5,
  },
  toggleSpring: {
    damping: 30,
    stiffness: 240,
    mass: 0.8,
    overshootClamping: true,
  },
  cardSpring: {
    damping: 32,
    stiffness: 300,
    mass: 0.8,
  },
  sheetSpring: {
    damping: 28,
    stiffness: 300,
    mass: 0.7,
  },
  buttonPressScale: 0.97,
  cardPressScale: 0.98,
  iconPressScale: 0.94,
  pressScale: 0.96,
  reducedMotionDuration: 120,
  screenSpring: {
    damping: 26,
    stiffness: 220,
    mass: 0.8,
  },
} as const;
