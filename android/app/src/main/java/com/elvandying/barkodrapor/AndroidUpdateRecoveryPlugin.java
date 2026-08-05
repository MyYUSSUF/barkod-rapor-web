package com.elvandying.barkodrapor;

import static android.app.Activity.RESULT_CANCELED;
import static android.app.Activity.RESULT_OK;
import static com.google.android.play.core.install.model.ActivityResult.RESULT_IN_APP_UPDATE_FAILED;

import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "AndroidUpdateRecovery")
public class AndroidUpdateRecoveryPlugin extends Plugin {
    private static final int UPDATE_OK = 0;
    private static final int UPDATE_CANCELED = 1;
    private static final int UPDATE_FAILED = 2;
    private static final int UPDATE_NOT_AVAILABLE = 3;
    private static final int UPDATE_NOT_ALLOWED = 4;

    private AppUpdateManager appUpdateManager;
    private ActivityResultLauncher<IntentSenderRequest> updateLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        appUpdateManager = AppUpdateManagerFactory.create(getContext());
        updateLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::handleUpdateResult
        );
    }

    @PluginMethod
    public void getBuildInfo(PluginCall call) {
        boolean debug =
            (getContext().getApplicationInfo().flags &
                ApplicationInfo.FLAG_DEBUGGABLE) !=
            0;
        JSObject result = new JSObject();
        result.put("debug", debug);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(
                    Settings.EXTRA_APP_PACKAGE,
                    getContext().getPackageName()
                );
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(
                    Uri.parse("package:" + getContext().getPackageName())
                );
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void resumeImmediateUpdate(PluginCall call) {
        if (pendingCall != null) {
            call.reject("An immediate update flow is already active.");
            return;
        }

        appUpdateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(info -> startImmediateUpdate(call, info))
            .addOnFailureListener(error -> call.reject(error.getMessage()));
    }

    private void startImmediateUpdate(PluginCall call, AppUpdateInfo info) {
        int availability = info.updateAvailability();
        boolean canStart =
            availability == UpdateAvailability.UPDATE_AVAILABLE ||
            availability ==
            UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;

        if (!canStart) {
            call.resolve(makeResult(UPDATE_NOT_AVAILABLE));
            return;
        }

        if (
            availability == UpdateAvailability.UPDATE_AVAILABLE &&
            !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
        ) {
            call.resolve(makeResult(UPDATE_NOT_ALLOWED));
            return;
        }

        try {
            pendingCall = call;
            AppUpdateOptions options = AppUpdateOptions
                .newBuilder(AppUpdateType.IMMEDIATE)
                .build();
            boolean flowStarted = appUpdateManager.startUpdateFlowForResult(
                info,
                updateLauncher,
                options
            );

            if (!flowStarted) {
                pendingCall = null;
                call.resolve(makeResult(UPDATE_FAILED));
            }
        } catch (Exception error) {
            pendingCall = null;
            call.reject(error.getMessage());
        }
    }

    private void handleUpdateResult(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;

        if (call == null) {
            return;
        }

        int resultCode = result.getResultCode();

        if (resultCode == RESULT_OK) {
            call.resolve(makeResult(UPDATE_OK));
        } else if (resultCode == RESULT_CANCELED) {
            call.resolve(makeResult(UPDATE_CANCELED));
        } else if (resultCode == RESULT_IN_APP_UPDATE_FAILED) {
            call.resolve(makeResult(UPDATE_FAILED));
        } else {
            call.resolve(makeResult(UPDATE_FAILED));
        }
    }

    private JSObject makeResult(int code) {
        JSObject result = new JSObject();
        result.put("code", code);
        return result;
    }
}
