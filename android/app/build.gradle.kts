import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Everything that differs per build comes in as -P properties (see .github/workflows/android-build.yml):
//   vpVersionName / vpVersionCode   app version (matches the GitHub release)
//   vpLiveUrl / vpTestUrl           the website each app opens (change these when the domain changes)
// Signing: VP_KEYSTORE_FILE, VP_KEYSTORE_PASSWORD, VP_KEY_ALIAS, VP_KEY_PASSWORD environment variables,
// or android/keystore.properties with the same names for a local build. Without them release builds use
// the debug key (fine for trying out, not for sharing).
fun prop(name: String): String? = (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() } ?: keystoreProps.getProperty(name)

fun host(url: String) = url.removePrefix("https://").removePrefix("http://").substringBefore("/").substringBefore(":")

val liveUrl = (prop("vpLiveUrl") ?: "https://crptrxapp.onrender.com").trimEnd('/')
val testUrl = (prop("vpTestUrl") ?: "https://crptrx-stage.onrender.com").trimEnd('/')

android {
    namespace = "com.visionpay.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.visionpay.live.app"
        minSdk = 24
        targetSdk = 35
        versionCode = prop("vpVersionCode")?.toInt() ?: 1
        versionName = prop("vpVersionName") ?: "0.0.0-dev"
    }

    signingConfigs {
        val store = secret("VP_KEYSTORE_FILE")
        if (store != null) {
            create("release") {
                storeFile = file(store)
                storePassword = secret("VP_KEYSTORE_PASSWORD")
                keyAlias = secret("VP_KEY_ALIAS")
                keyPassword = secret("VP_KEY_PASSWORD") ?: secret("VP_KEYSTORE_PASSWORD")
            }
        }
    }

    flavorDimensions += "env"
    productFlavors {
        create("live") {
            dimension = "env"
            resValue("string", "app_name", "VisionPay")
            buildConfigField("String", "BASE_URL", "\"$liveUrl\"")
            buildConfigField("String", "CHANNEL", "\"live\"")
            manifestPlaceholders["appHost"] = host(liveUrl)
        }
        // The test app (built from staging) installs next to the live one.
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".test"
            resValue("string", "app_name", "VisionPay Test")
            buildConfigField("String", "BASE_URL", "\"$testUrl\"")
            buildConfigField("String", "CHANNEL", "\"test\"")
            manifestPlaceholders["appHost"] = host(testUrl)
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf("META-INF/*.version", "META-INF/LICENSE*", "META-INF/NOTICE*", "kotlin/**", "DebugProbesKt.bin")
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Google sign-in with the phone's own account picker (Google's web sign-in is blocked inside apps).
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Push notifications. Set up at run time from the server's /api/app/config, so no google-services.json.
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
