package com.visionpay.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Push messages while the app is open (when it's closed Android shows them itself, and tapping
 * one opens the app with the message's "link"). Only "something happened" text arrives here,
 * never message contents.
 */
class PushService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: message.notification?.title ?: return
        val body = d["body"] ?: message.notification?.body ?: ""
        val link = d["link"]
        // Already looking at that order: the page updates by itself.
        if (link != null && MainActivity.visiblePath == link) return
        Notifications.show(this, title, body, link, d["tag"])
    }

    override fun onNewToken(token: String) {
        // The website signs the new token up the next time it syncs (once a day, or on "Turn on").
        getSharedPreferences("push", MODE_PRIVATE).edit().putString("token", token).apply()
    }
}
