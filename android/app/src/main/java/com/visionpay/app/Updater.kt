package com.visionpay.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * App updates are required: when the server has a newer app file, a dialog that can't be
 * closed asks the user to update. The app downloads the file itself, checks it is our app
 * and a newer version, and opens Android's install screen. (Android itself refuses an update
 * signed with a different key.) If the download keeps failing, the browser is offered too.
 *
 * Checked when the first page loads and again whenever the app comes back to the screen
 * (at most every CHECK_EVERY_MS).
 */
class Updater(private val activity: AppCompatActivity) {

    private data class Release(val name: String, val code: Int, val url: String)

    private var release: Release? = null
    private var apk: File? = null
    private var dialog: AlertDialog? = null
    private var lastCheck = 0L
    private var checking = false
    private var downloading = false

    private lateinit var message: TextView
    private lateinit var progress: LinearProgressIndicator

    /** Asks the server for the newest version; shows the update dialog if there is one. */
    fun check(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (checking || downloading || (!force && now - lastCheck < CHECK_EVERY_MS)) return
        checking = true
        activity.lifecycleScope.launch {
            try {
                val latest = withContext(Dispatchers.IO) { Http.getJson("${BuildConfig.BASE_URL}/api/app/latest") } ?: return@launch
                lastCheck = now // only an answer counts: a failed check (offline, server waking) is retried
                val code = latest.optInt("versionCode", 0)
                val url = latest.optString("url").takeIf { it.startsWith("https://") } ?: return@launch
                if (code <= BuildConfig.VERSION_CODE) return@launch
                val r = Release(latest.optString("versionName").ifBlank { "$code" }, code, url)
                if (release?.code != r.code) apk = null
                release = r
                show(r)
            } finally {
                checking = false
            }
        }
    }

    /** Back from the "install unknown apps" setting or from the install screen. */
    fun onResume() {
        val file = apk
        if (dialog?.isShowing == true && file != null && canInstall()) {
            setStatus(activity.getString(R.string.update_ready), showProgress = false)
            positive(R.string.update_install)
        }
        check()
    }

    private fun show(r: Release) {
        if (activity.isFinishing || activity.isDestroyed) return
        if (dialog?.isShowing == true) return
        val pad = dp(24)
        message = TextView(activity).apply {
            text = activity.getString(R.string.update_body, r.name)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }
        progress = LinearProgressIndicator(activity).apply {
            isIndeterminate = true
            visibility = View.GONE
            setPadding(0, dp(16), 0, 0)
        }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, dp(8), pad, 0)
            addView(message)
            addView(progress)
        }
        dialog = MaterialAlertDialogBuilder(activity)
            .setTitle(R.string.update_title)
            .setView(box)
            .setCancelable(false)
            .setPositiveButton(if (apk != null) R.string.update_install else R.string.update_now, null)
            .setNeutralButton(R.string.update_browser, null)
            .create()
            .also { d ->
                d.setCanceledOnTouchOutside(false)
                d.setOnShowListener {
                    // Our own click handlers, so the buttons don't close the dialog.
                    d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { onUpdate() }
                    d.getButton(AlertDialog.BUTTON_NEUTRAL).apply {
                        isVisible = false
                        setOnClickListener { openInBrowser() }
                    }
                }
                d.show()
            }
    }

    private fun onUpdate() {
        val file = apk
        if (file != null && file.exists()) install(file) else download()
    }

    private fun download() {
        val r = release ?: return
        if (downloading) return
        downloading = true
        enable(false)
        setStatus(activity.getString(R.string.update_downloading), showProgress = true)
        activity.lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) { fetch(r) { pct -> activity.runOnUiThread { showPercent(pct) } } }
            downloading = false
            enable(true)
            if (file == null) {
                setStatus(activity.getString(R.string.update_failed), showProgress = false)
                positive(R.string.retry)
                dialog?.getButton(AlertDialog.BUTTON_NEUTRAL)?.isVisible = true
                return@launch
            }
            apk = file
            install(file)
        }
    }

    /** Downloads to the app's private cache, then checks it's our app and the right version. */
    private fun fetch(r: Release, onProgress: (Int) -> Unit): File? {
        val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // an older, half-finished or used file
        val part = File(dir, "update.part")
        val out = File(dir, "VisionPay-${r.code}.apk")
        return try {
            val c = URL(r.url).openConnection() as HttpURLConnection
            c.connectTimeout = 20_000
            c.readTimeout = 30_000
            c.instanceFollowRedirects = true
            c.setRequestProperty("User-Agent", "VisionPayApp/${BuildConfig.VERSION_NAME}")
            try {
                if (c.responseCode !in 200..299) return null
                val total = c.contentLengthLong
                var done = 0L
                var lastPct = -1
                c.inputStream.use { input ->
                    part.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            output.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) { lastPct = pct; onProgress(pct) }
                            }
                        }
                    }
                }
                if (total > 0 && done != total) return null
            } finally {
                c.disconnect()
            }
            if (!part.renameTo(out)) return null
            if (!isOurNewerApp(out, r.code)) {
                Log.w(TAG, "update file rejected")
                out.delete()
                return null
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "update download: ${e.message}")
            part.delete()
            null
        }
    }

    private fun isOurNewerApp(file: File, code: Int): Boolean {
        val info = activity.packageManager.getPackageArchiveInfo(file.path, 0) ?: return false
        @Suppress("DEPRECATION")
        val v = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        return info.packageName == activity.packageName && v >= code && v > BuildConfig.VERSION_CODE
    }

    private fun canInstall() = Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()

    private fun install(file: File) {
        if (!canInstall()) {
            // Android asks once: allow this app to install updates. We come back via onResume.
            setStatus(activity.getString(R.string.update_allow), showProgress = false)
            positive(R.string.update_install)
            try {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            } catch (e: ActivityNotFoundException) {
                dialog?.getButton(AlertDialog.BUTTON_NEUTRAL)?.isVisible = true
            }
            return
        }
        setStatus(activity.getString(R.string.update_ready), showProgress = false)
        positive(R.string.update_install)
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            dialog?.getButton(AlertDialog.BUTTON_NEUTRAL)?.isVisible = true
        }
    }

    private fun openInBrowser() {
        val r = release ?: return
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(r.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            setStatus(activity.getString(R.string.no_app_for_link), showProgress = false)
        }
    }

    private fun showPercent(pct: Int) {
        if (!::progress.isInitialized) return
        progress.isIndeterminate = false
        progress.setProgressCompat(pct, true)
        message.text = activity.getString(R.string.update_downloading_pct, pct)
    }

    private fun setStatus(text: String, showProgress: Boolean) {
        if (!::message.isInitialized) return
        message.text = text
        if (showProgress) progress.isIndeterminate = true
        progress.isVisible = showProgress
    }

    private fun positive(label: Int) {
        dialog?.getButton(AlertDialog.BUTTON_POSITIVE)?.setText(label)
    }

    private fun enable(on: Boolean) {
        dialog?.getButton(AlertDialog.BUTTON_POSITIVE)?.isEnabled = on
    }

    private fun dp(v: Int) = (v * activity.resources.displayMetrics.density).toInt()

    companion object {
        private const val TAG = "VisionPayUpdate"
        /** Also check when the app comes back to the screen, at most this often. */
        private const val CHECK_EVERY_MS = 30 * 60_000L
    }
}
