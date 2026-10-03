# The website calls these through window.VisionPayApp.
-keepclassmembers class com.visionpay.app.WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# Credential Manager (Google sign-in) finds its Play Services provider by reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}
