package com.visionpay.app

import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * window.VisionPayApp for the website (src/lib/nativeApp.ts). Called on a WebView thread,
 * so anything touching the screen is handed to the main thread.
 */
class WebBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun info(): String = JSONObject()
        .put("version", BuildConfig.VERSION_NAME)
        .put("versionCode", BuildConfig.VERSION_CODE)
        .put("channel", BuildConfig.CHANNEL)
        .put("push", activity.pushPermissionState())
        .put("pushReady", AppConfig.current?.firebase != null)
        .toString()

    @JavascriptInterface
    fun call(method: String, id: Int, args: String) {
        activity.runOnUiThread { activity.onBridgeCall(method, id, args) }
    }

    /** The page reports whether a pull-down right now should reload it (not when an inner list is scrolled). */
    @JavascriptInterface
    fun setCanRefresh(ok: Boolean) {
        activity.canRefresh = ok
    }
}
