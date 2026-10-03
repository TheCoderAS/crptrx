package com.visionpay.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import kotlin.math.max

/**
 * The whole app: our website in a full-screen WebView, plus the native pieces a WebView
 * can't do itself (Google sign-in, notifications, camera, downloads, wallet-app links).
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_LINK = "link"

        /** Path of the page on screen while the app is in front (push skips alerts for it). */
        @Volatile
        var visiblePath: String? = null

        private val BASE: Uri = Uri.parse(BuildConfig.BASE_URL)
        private const val START_PATH = "/dashboard"
        private const val SPLASH_MAX_MS = 8_000L
        private const val UPDATE_SNOOZE_MS = 24 * 3600_000L
    }

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: LinearProgressIndicator
    private lateinit var offline: View
    private lateinit var offlineBody: TextView
    private lateinit var retry: Button

    private var keepSplash = true
    private var pageShown = false
    private var mainFrameFailed = false
    private var updateChecked = false

    @Volatile
    var canRefresh = true

    private val handler = Handler(Looper.getMainLooper())

    // ---- Activity ----

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { keepSplash }
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)
        offlineBody = findViewById(R.id.offline_body)
        retry = findViewById(R.id.retry)

        setUpWindow()
        setUpWebView()
        setUpBack()
        cleanOldPhotos()

        refresh.setColorSchemeColors(getColor(R.color.brand))
        refresh.setOnRefreshListener { web.reload() }
        // Pull-to-refresh only when the page is at the top and nothing inside it is scrolled.
        refresh.setOnChildScrollUpCallback { _, _ -> !canRefresh || web.scrollY > 0 }
        retry.setOnClickListener {
            offline.isVisible = false
            mainFrameFailed = false
            if (web.url.isNullOrEmpty() || web.url == "about:blank") web.loadUrl(startUrl(intent)) else web.reload()
        }

        // A slow first load (a sleeping server can take ~40 s): leave the splash and say we're still connecting.
        handler.postDelayed({
            if (!pageShown) {
                keepSplash = false
                showMessage(getString(R.string.server_waking), withRetry = false)
            }
        }, SPLASH_MAX_MS)

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) {
            keepSplash = false
        } else {
            web.loadUrl(startUrl(intent))
        }

        lifecycleScope.launch {
            AppConfig.refresh(this@MainActivity)
            AppConfig.initFirebase(this@MainActivity)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        linkFrom(intent)?.let { web.loadUrl(it) }
    }

    // Back online while the "You're offline" screen is up: try again by itself.
    private val network = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(net: Network) {
            runOnUiThread { if (offline.isVisible && retry.isVisible) retry.performClick() }
        }
    }

    override fun onStart() {
        super.onStart()
        try {
            getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(network)
        } catch (e: Exception) {
            Log.w(TAG, "network callback: ${e.message}")
        }
    }

    override fun onStop() {
        try {
            getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(network)
        } catch (e: Exception) {
            // wasn't registered
        }
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        visiblePath = web.url?.let { Uri.parse(it).path }
    }

    override fun onPause() {
        visiblePath = null
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    // ---- Where to go ----

    /** A notification's link (/orders/…) or a link to our website, else the start page. */
    private fun linkFrom(intent: Intent?): String? {
        val link = intent?.getStringExtra(EXTRA_LINK)
        if (link != null && link.startsWith("/") && !link.startsWith("//")) return BuildConfig.BASE_URL + link
        val data = intent?.data
        if (data != null && data.scheme == "https" && data.host.equals(BASE.host, ignoreCase = true)) return data.toString()
        return null
    }

    private fun startUrl(intent: Intent?) = linkFrom(intent) ?: (BuildConfig.BASE_URL + START_PATH)

    // ---- Window ----

    private fun setUpWindow() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = findViewById<View>(R.id.root)
        // Keep the page clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, max(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
    }

    /** Colour the status and navigation bar areas like the page's header, with readable icons. */
    private fun matchBarsToPage() {
        web.evaluateJavascript(PAGE_COLOR_JS) { result ->
            val nums = Regex("""[\d.]+""").findAll(result ?: "").map { it.value.toFloat() }.toList()
            if (nums.size < 3) return@evaluateJavascript
            val color = Color.rgb(nums[0].toInt(), nums[1].toInt(), nums[2].toInt())
            findViewById<View>(R.id.root).setBackgroundColor(color)
            val light = (0.299 * nums[0] + 0.587 * nums[1] + 0.114 * nums[2]) > 160
            WindowInsetsControllerCompat(window, window.decorView).apply {
                isAppearanceLightStatusBars = light
                isAppearanceLightNavigationBars = light
            }
        }
    }

    // ---- WebView ----

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun setUpWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.CHANNEL == "test")
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString VisionPayApp/${BuildConfig.VERSION_NAME} (${BuildConfig.CHANNEL})"
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.addJavascriptInterface(WebBridge(this), "VisionPayApp")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, userAgent, disposition, mime, _ -> download(url, userAgent, disposition, mime) }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleUrl(request.url, request.isForMainFrame)

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            mainFrameFailed = false
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            pageShown = true
            keepSplash = false
            if (!mainFrameFailed) offline.isVisible = false
        }

        override fun onPageFinished(view: WebView, url: String) {
            refresh.isRefreshing = false
            if (mainFrameFailed) {
                Log.i(TAG, "page-failed url=$url")
                return
            }
            Log.i(TAG, "page-finished url=$url title=${view.title}")
            pageShown = true
            keepSplash = false
            offline.isVisible = false
            visiblePath = Uri.parse(url).path
            view.evaluateJavascript(TOUCH_JS, null)
            matchBarsToPage()
            if (!updateChecked) {
                updateChecked = true
                checkForUpdate()
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            Log.w(TAG, "page error ${error.errorCode} ${error.description} ${request.url}")
            mainFrameFailed = true
            keepSplash = false
            refresh.isRefreshing = false
            showMessage(getString(R.string.offline_body), withRetry = true)
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            mainFrameFailed = true
            keepSplash = false
            showMessage(getString(R.string.offline_body), withRetry = true)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's engine crashed or was stopped to free memory: start over cleanly.
            recreate()
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.setProgressCompat(newProgress, true)
            progress.isVisible = newProgress in 1..99 && !keepSplash
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            return openFileChooser(callback, params)
        }
    }

    private fun showMessage(text: String, withRetry: Boolean) {
        offlineBody.text = text
        retry.isVisible = withRetry
        offline.isVisible = true
    }

    /** Our website stays in the app; other websites open in the browser; wallet and other app links open those apps. */
    private fun handleUrl(uri: Uri, mainFrame: Boolean): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "http" || scheme == "https") {
            if (!mainFrame) return false
            if (uri.host.equals(BASE.host, ignoreCase = true)) return false
            openOutside(Intent(Intent.ACTION_VIEW, uri))
            return true
        }
        if (scheme in setOf("about", "data", "blob", "javascript", "file")) return false
        if (scheme == "intent") {
            try {
                val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
                try {
                    startActivity(intent)
                } catch (e: ActivityNotFoundException) {
                    val fallback = intent.getStringExtra("browser_fallback_url")
                    when {
                        fallback != null -> openOutside(Intent(Intent.ACTION_VIEW, Uri.parse(fallback)))
                        intent.`package` != null -> openOutside(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${intent.`package`}")))
                        else -> toast(getString(R.string.no_app_for_link))
                    }
                }
            } catch (e: Exception) {
                toast(getString(R.string.no_app_for_link))
            }
            return true
        }
        // tronlink://, wc:, trust://, upi://, tel:, mailto: …
        openOutside(Intent(Intent.ACTION_VIEW, uri))
        return true
    }

    private fun openOutside(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.no_app_for_link))
        }
    }

    // ---- Back button ----

    private fun setUpBack() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (offline.isVisible && retry.isVisible && !web.canGoBack()) {
                    moveTaskToBack(true)
                    return
                }
                // First close whatever is open on the page (chat, image, dialog), like the web's Escape key.
                web.evaluateJavascript(CLOSE_DIALOG_JS) { r ->
                    val open = r?.trim('"')?.toIntOrNull() ?: 0
                    if (open == 0) return@evaluateJavascript goBackOrLeave()
                    handler.postDelayed({
                        web.evaluateJavascript(COUNT_DIALOGS_JS) { r2 ->
                            if ((r2?.trim('"')?.toIntOrNull() ?: 0) >= open) goBackOrLeave()
                        }
                    }, 200)
                }
            }
        })
    }

    private fun goBackOrLeave() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    // ---- Files: uploads (gallery, files, camera) ----

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraFile: File? = null
    private var cameraUri: Uri? = null

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val data = res.data
        val picked: Array<Uri>? = when {
            res.resultCode != RESULT_OK -> null
            data?.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data?.data != null -> arrayOf(data.data!!)
            cameraUri != null && (cameraFile?.length() ?: 0L) > 0L -> arrayOf(cameraUri!!)
            else -> null
        }
        cb.onReceiveValue(picked)
    }

    private fun openFileChooser(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        val mimes = params.acceptTypes
            .flatMap { it.split(",") }
            .map { it.trim().lowercase() }
            .mapNotNull { t ->
                when {
                    t.isEmpty() -> null
                    t.startsWith(".") -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.drop(1))
                    else -> t
                }
            }
            .distinct()
        val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimes.singleOrNull() ?: "*/*"
            if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        cameraFile = null
        cameraUri = null
        val extra = if (mimes.isEmpty() || mimes.any { it.startsWith("image/") }) listOfNotNull(cameraIntent()) else emptyList()
        val chooser = Intent.createChooser(pick, getString(R.string.choose_file)).putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toTypedArray())
        return try {
            fileChooser.launch(chooser)
            true
        } catch (e: ActivityNotFoundException) {
            fileCallback = null
            callback.onReceiveValue(null)
            true
        }
    }

    private fun cameraIntent(): Intent? {
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (intent.resolveActivity(packageManager) == null) return null
        return try {
            val dir = File(cacheDir, "camera").apply { mkdirs() }
            val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            cameraFile = file
            cameraUri = uri
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .apply { clipData = ClipData.newRawUri("", uri) }
        } catch (e: Exception) {
            null
        }
    }

    private fun cleanOldPhotos() {
        lifecycleScope.launch(Dispatchers.IO) {
            val cutoff = System.currentTimeMillis() - 24 * 3600_000L
            File(cacheDir, "camera").listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
        }
    }

    // ---- Files: downloads (receipts) ----

    private var pendingDownload: (() -> Unit)? = null

    private val storagePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val run = pendingDownload
        pendingDownload = null
        if (granted) run?.invoke() else toast(getString(R.string.download_failed))
    }

    private fun download(url: String, userAgent: String, disposition: String?, mime: String?) {
        if (!url.startsWith("http")) return toast(getString(R.string.download_failed))
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = { download(url, userAgent, disposition, mime) }
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            return
        }
        try {
            val name = URLUtil.guessFileName(url, disposition, mime)
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mime)
                .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                .addRequestHeader("User-Agent", userAgent)
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            getSystemService(DownloadManager::class.java).enqueue(request)
            toast(getString(R.string.downloading, name))
        } catch (e: Exception) {
            Log.w(TAG, "download failed", e)
            toast(getString(R.string.download_failed))
        }
    }

    // ---- Bridge: Google sign-in and push ----

    fun pushPermissionState(): String {
        val enabled = NotificationManagerCompat.from(this).areNotificationsEnabled()
        if (enabled) return "granted"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !getSharedPreferences("push", MODE_PRIVATE).getBoolean("asked", false)) return "default"
        return "denied"
    }

    fun onBridgeCall(method: String, id: Int, @Suppress("UNUSED_PARAMETER") args: String) {
        // Only our own website may use the bridge.
        if (!Uri.parse(web.url ?: "").host.equals(BASE.host, ignoreCase = true)) return
        when (method) {
            "googleSignIn" -> lifecycleScope.launch {
                val clientId = (AppConfig.current ?: AppConfig.refresh(this@MainActivity))?.googleClientId
                    ?: AppConfig.refresh(this@MainActivity)?.googleClientId
                if (clientId == null) {
                    resolve(id, JSONObject().put("error", "Google sign-in isn't set up in the app yet. Please use another way to sign in."))
                    return@launch
                }
                when (val r = GoogleAuth.signIn(this@MainActivity, clientId)) {
                    is GoogleAuth.Result.Ok -> resolve(id, JSONObject().put("idToken", r.idToken))
                    is GoogleAuth.Result.Failed -> resolve(id, JSONObject().put("error", r.reason))
                }
            }
            "pushToken" -> lifecycleScope.launch {
                if (!AppConfig.initFirebase(this@MainActivity)) {
                    AppConfig.refresh(this@MainActivity)
                    if (!AppConfig.initFirebase(this@MainActivity)) {
                        resolve(id, JSONObject().put("error", "unavailable"))
                        return@launch
                    }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    pendingPushId = id
                    getSharedPreferences("push", MODE_PRIVATE).edit().putBoolean("asked", true).apply()
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else if (!NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()) {
                    resolve(id, JSONObject().put("error", "denied"))
                } else {
                    sendPushToken(id)
                }
            }
            else -> resolve(id, JSONObject().put("error", "unknown"))
        }
    }

    private var pendingPushId: Int? = null

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val id = pendingPushId ?: return@registerForActivityResult
        pendingPushId = null
        if (granted) sendPushToken(id) else resolve(id, JSONObject().put("error", "denied"))
    }

    private fun sendPushToken(id: Int) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
            val token = if (t.isSuccessful) t.result else null
            if (token.isNullOrEmpty()) {
                Log.w(TAG, "push token failed: ${t.exception?.message}")
                resolve(id, JSONObject().put("error", "unavailable"))
            } else {
                resolve(id, JSONObject().put("token", token))
            }
        }
    }

    private fun resolve(id: Int, result: JSONObject) {
        runOnUiThread { web.evaluateJavascript("window.__vpResolve && window.__vpResolve($id, $result)", null) }
    }

    // ---- Updates ----

    /** A newer app file on the server: offer it (the page download keeps working meanwhile). */
    private fun checkForUpdate() {
        lifecycleScope.launch {
            val latest = withContext(Dispatchers.IO) { Http.getJson("${BuildConfig.BASE_URL}/api/app/latest") } ?: return@launch
            val code = latest.optInt("versionCode", 0)
            val url = latest.optString("url").takeIf { it.startsWith("https://") } ?: return@launch
            val name = latest.optString("versionName")
            if (code <= BuildConfig.VERSION_CODE) return@launch
            val prefs = getSharedPreferences("update", MODE_PRIVATE)
            if (prefs.getInt("snoozedCode", 0) == code && System.currentTimeMillis() - prefs.getLong("snoozedAt", 0) < UPDATE_SNOOZE_MS) return@launch
            if (isFinishing) return@launch
            MaterialAlertDialogBuilder(this@MainActivity)
                .setTitle(R.string.update_title)
                .setMessage(getString(R.string.update_body, name))
                .setPositiveButton(R.string.update_now) { _, _ -> openOutside(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                .setNegativeButton(R.string.later) { _, _ -> prefs.edit().putInt("snoozedCode", code).putLong("snoozedAt", System.currentTimeMillis()).apply() }
                .show()
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}

/** Closes the open dialog with an Escape key (our pages close dialogs on Escape); returns how many were open. */
private const val CLOSE_DIALOG_JS = """(function(){var n=document.querySelectorAll('[role=dialog],[role=alertdialog]').length;if(!n)return 0;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return n;})()"""

private const val COUNT_DIALOGS_JS = """(function(){return document.querySelectorAll('[role=dialog],[role=alertdialog]').length;})()"""

/** Background colour of the page's header (or body), for the status bar. */
private const val PAGE_COLOR_JS = """(function(){function bg(e){if(!e)return null;var c=getComputedStyle(e).backgroundColor;return c&&c!=='transparent'&&!/,\s*0\)$/.test(c)?c:null}return bg(document.querySelector('header'))||bg(document.body)||bg(document.documentElement)||'rgb(248,250,252)';})()"""

/** Tells the app whether a pull-down should reload: not inside dialogs or scrolled lists. */
private const val TOUCH_JS = """(function(){if(window.__vpTouch)return;window.__vpTouch=1;document.addEventListener('touchstart',function(e){var ok=(window.scrollY||0)<=0,n=e.target;while(ok&&n&&n.nodeType===1&&n!==document.body){if(n.getAttribute('role')==='dialog'||n.scrollTop>0)ok=false;n=n.parentElement;}try{VisionPayApp.setCanRefresh(ok)}catch(_){}} ,{passive:true,capture:true});})()"""
