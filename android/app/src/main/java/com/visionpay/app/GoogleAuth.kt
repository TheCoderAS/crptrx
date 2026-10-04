package com.visionpay.app

import android.app.Activity
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** Google sign-in with the phone's own account picker. Returns a Google ID token for our server. */
object GoogleAuth {
    sealed class Result {
        data class Ok(val idToken: String) : Result()
        data class Failed(val reason: String) : Result()
    }

    suspend fun signIn(activity: Activity, webClientId: String): Result = try {
        val option = GetSignInWithGoogleOption.Builder(webClientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            Result.Ok(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            Result.Failed("Sign-in failed. Please try again.")
        }
    } catch (e: GetCredentialCancellationException) {
        Result.Failed("cancelled")
    } catch (e: NoCredentialException) {
        Result.Failed("No Google account on this phone. Add one in Settings, then try again.")
    } catch (e: GetCredentialException) {
        Log.w(TAG, "Google sign-in failed: ${e.type} ${e.message}")
        // "Developer console is not set up correctly": this app's SHA-1 isn't registered in Firebase yet.
        if (e.message?.contains("28444") == true || e.message?.contains("developer console", ignoreCase = true) == true) {
            Result.Failed("Google sign-in isn't set up for this app yet. Please use another way to sign in.")
        } else {
            Result.Failed("Google sign-in failed. Please try again.")
        }
    } catch (e: Exception) {
        Log.w(TAG, "Google sign-in failed", e)
        Result.Failed("Google sign-in failed. Please try again.")
    }
}
