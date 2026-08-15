package expo.modules.aethermotion

import android.os.Build
import android.os.PowerManager

object ThermalMapper {
  fun fromAndroidStatus(status: Int?, apiLevel: Int): String {
    if (apiLevel < Build.VERSION_CODES.Q || status == null) {
      return "unknown"
    }
    return when (status) {
      PowerManager.THERMAL_STATUS_NONE -> "nominal"
      PowerManager.THERMAL_STATUS_LIGHT -> "light"
      PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
      PowerManager.THERMAL_STATUS_SEVERE -> "severe"
      PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
      PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
      PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
      else -> "unknown"
    }
  }
}
