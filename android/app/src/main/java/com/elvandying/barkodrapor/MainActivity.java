package com.elvandying.barkodrapor;

import android.os.Bundle;
import android.os.Build;
import android.webkit.WebView;
import android.graphics.Color;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidSystemInsetsPlugin.class);
        registerPlugin(AndroidUpdateRecoveryPlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.enableEdgeToEdge(getWindow());
        configureSystemBars();

        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(android.graphics.Color.WHITE);
        webView.setPadding(0, 0, 0, 0);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            configureSystemBars();
        }
    }

    private void configureSystemBars() {
        getWindow().getDecorView().setBackgroundColor(Color.WHITE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        boolean lightNavigationIconsSupported =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O;
        getWindow().setNavigationBarColor(
            lightNavigationIconsSupported ? Color.TRANSPARENT : Color.BLACK
        );

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.show(WindowInsetsCompat.Type.systemBars());
        insetsController.setAppearanceLightStatusBars(true);
        insetsController.setAppearanceLightNavigationBars(
            lightNavigationIconsSupported
        );
        insetsController.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
        );
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
    }
}
