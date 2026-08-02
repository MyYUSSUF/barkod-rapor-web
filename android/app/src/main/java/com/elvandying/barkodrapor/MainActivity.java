package com.elvandying.barkodrapor;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.enableEdgeToEdge(getWindow());

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.hide(WindowInsetsCompat.Type.statusBars());
        insetsController.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        WebView webView = bridge.getWebView();
        webView.setBackgroundColor(android.graphics.Color.WHITE);
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets navigationInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.navigationBars()
            );
            Insets statusBarInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars()
            );
            Insets cutoutInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.displayCutout()
            );

            view.setPadding(
                Math.max(navigationInsets.left, cutoutInsets.left),
                Math.max(statusBarInsets.top, cutoutInsets.top),
                Math.max(navigationInsets.right, cutoutInsets.right),
                Math.max(navigationInsets.bottom, cutoutInsets.bottom)
            );
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
