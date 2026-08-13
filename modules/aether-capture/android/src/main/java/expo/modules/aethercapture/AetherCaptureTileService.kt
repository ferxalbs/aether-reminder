package expo.modules.aethercapture

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService

class AetherCaptureTileService : TileService() {
  override fun onClick() {
    super.onClick()
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("aether://capture?ingress=android_quick_settings")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: return
    if (Build.VERSION.SDK_INT >= 34) {
      val pending = PendingIntent.getActivity(
        this,
        5001,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launchIntent)
    }
  }
}
