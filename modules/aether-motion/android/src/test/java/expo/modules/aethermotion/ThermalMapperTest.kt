package expo.modules.aethermotion

import android.os.Build
import android.os.PowerManager
import org.junit.Assert.assertEquals
import org.junit.Test

class ThermalMapperTest {
  @Test
  fun unsupportedApiReturnsUnknown() {
    assertEquals("unknown", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_NONE, 28))
    assertEquals("unknown", ThermalMapper.fromAndroidStatus(null, 33))
  }

  @Test
  fun mapsEveryAndroidThermalStatus() {
    assertEquals("nominal", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_NONE, 29))
    assertEquals("light", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_LIGHT, 29))
    assertEquals("moderate", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_MODERATE, 29))
    assertEquals("severe", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_SEVERE, 29))
    assertEquals("critical", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_CRITICAL, 29))
    assertEquals("emergency", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_EMERGENCY, 29))
    assertEquals("shutdown", ThermalMapper.fromAndroidStatus(PowerManager.THERMAL_STATUS_SHUTDOWN, 29))
    assertEquals("unknown", ThermalMapper.fromAndroidStatus(99, Build.VERSION_CODES.Q))
  }
}
