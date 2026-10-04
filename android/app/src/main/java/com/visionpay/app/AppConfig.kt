package com.visionpay.app

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

const val TAG = "VisionPay"

data class FirebaseConfig(val apiKey: String, val projectId: String, val appId: String, val senderId: String)
data class ServerConfig(val googleClientId: String?, val firebase: FirebaseConfig?)

/**
 * The server's settings for the app (GET /api/app/config): the Google sign-in client and the
 * Firebase project for push. Kept on the phone so push works even before the first page loads.
 */
object AppConfig {
    private const val PREFS = "app_config"

    @Volatile
    var current: ServerConfig? = null
        private set

    fun load(ctx: Context) {
        if (current == null) current = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("json", null)?.let { parse(it) }
    }

    suspend fun refresh(ctx: Context): ServerConfig? = withContext(Dispatchers.IO) {
        val json = Http.getJson("${BuildConfig.BASE_URL}/api/app/config")
        val cfg = json?.let { parse(it.toString()) }
        if (cfg != null) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("json", json.toString()).apply()
            current = cfg
        }
        current
    }

    private fun parse(s: String): ServerConfig? = try {
        val o = JSONObject(s)
        val f = o.optJSONObject("firebase")
        ServerConfig(
            googleClientId = o.optString("googleClientId").takeIf { it.isNotBlank() && it != "null" },
            firebase = f?.let { FirebaseConfig(it.getString("apiKey"), it.getString("projectId"), it.getString("appId"), it.getString("senderId")) },
        )
    } catch (e: Exception) {
        null
    }

    /** Starts Firebase for push once its settings are known. True when it's running. */
    fun initFirebase(ctx: Context): Boolean {
        if (FirebaseApp.getApps(ctx).isNotEmpty()) return true
        val f = current?.firebase ?: return false
        return try {
            FirebaseApp.initializeApp(
                ctx,
                FirebaseOptions.Builder().setApiKey(f.apiKey).setProjectId(f.projectId).setApplicationId(f.appId).setGcmSenderId(f.senderId).build(),
            )
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            true
        } catch (e: Exception) {
            Log.w(TAG, "Firebase setup failed: ${e.message}")
            false
        }
    }
}

object Http {
    /** GET a JSON object, or null on any problem. Call off the main thread. */
    fun getJson(url: String, timeoutMs: Int = 15_000): JSONObject? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = timeoutMs
        c.readTimeout = timeoutMs
        c.setRequestProperty("Accept", "application/json")
        c.setRequestProperty("User-Agent", "VisionPayApp/${BuildConfig.VERSION_NAME}")
        try {
            if (c.responseCode !in 200..299) null else JSONObject(c.inputStream.bufferedReader().use { it.readText() })
        } finally {
            c.disconnect()
        }
    } catch (e: Exception) {
        null
    }
}
