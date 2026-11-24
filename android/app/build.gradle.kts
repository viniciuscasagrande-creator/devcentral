plugins {
    id("com.android.application")
}

android {
    namespace = "com.devcentral.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.devcentral.mobile"
        minSdk = 24
        targetSdk = 36
        versionCode = 301
        versionName = "3.0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}
