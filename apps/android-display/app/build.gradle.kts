plugins {
    id("com.android.application")
}

fun environmentValueOrFile(valueName: String, fileName: String): String? {
    val directValue = System.getenv(valueName)
    if (!directValue.isNullOrBlank()) return directValue
    val valueFile = System.getenv(fileName)
    if (valueFile.isNullOrBlank()) return null
    return file(valueFile).readText().trim()
}

val releaseKeystore = System.getenv("DAYMARK_ANDROID_KEYSTORE_FILE")
val releaseStorePassword = environmentValueOrFile(
    "DAYMARK_ANDROID_KEYSTORE_PASSWORD",
    "DAYMARK_ANDROID_KEYSTORE_PASSWORD_FILE",
)
val releaseKeyAlias = System.getenv("DAYMARK_ANDROID_KEY_ALIAS")
val releaseKeyPassword = environmentValueOrFile(
    "DAYMARK_ANDROID_KEY_PASSWORD",
    "DAYMARK_ANDROID_KEY_PASSWORD_FILE",
)
val hasReleaseSigning = listOf(
    releaseKeystore,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "org.daymark.display"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "org.daymark.display"
        minSdk = 26
        targetSdk = 35
        versionCode = System.getenv("DAYMARK_ANDROID_VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("DAYMARK_ANDROID_VERSION_NAME") ?: "0.1.0-dev"

        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystore!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
