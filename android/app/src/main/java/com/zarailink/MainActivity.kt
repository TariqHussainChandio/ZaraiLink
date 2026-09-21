package com.zarailink

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ZaraiLink"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Required for React Native's `Linking` module to receive a deep link (e.g.
   * zarailink://reset-password) while the app is already running. MainActivity's launchMode is
   * `singleTask` (see AndroidManifest.xml), so a tapped link delivers here via onNewIntent
   * instead of a fresh onCreate — without this override, Linking.addEventListener('url', ...)
   * never fires and only the cold-start case (Linking.getInitialURL()) would work.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
}
