package com.visionpay.app

import android.app.Application

class VisionPayApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.createChannel(this)
        // A push can start the app with no screen open, so Firebase is set up here from the last known settings.
        AppConfig.load(this)
        AppConfig.initFirebase(this)
    }
}
