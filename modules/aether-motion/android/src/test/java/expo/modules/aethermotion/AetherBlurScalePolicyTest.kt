package expo.modules.aethermotion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AetherBlurScalePolicyTest {
  @Test
  fun onlyTheDiagnosticScaleFactorsAreAccepted() {
    assertEquals(1f, AetherBlurScalePolicy.resolve(1f))
    assertEquals(2f, AetherBlurScalePolicy.resolve(2f))
    assertEquals(4f, AetherBlurScalePolicy.resolve(4f))
    assertEquals(4f, AetherBlurScalePolicy.resolve(3f))
  }

  @Test
  fun noiseRemainsDisabledForEveryVariant() {
    for (scaleFactor in listOf(1f, 2f, 4f)) {
      assertEquals(scaleFactor, AetherBlurScalePolicy.resolve(scaleFactor))
      assertFalse(AetherBlurScalePolicy.APPLY_NOISE)
    }
  }
}
