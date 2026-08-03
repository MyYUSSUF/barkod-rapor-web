package com.elvandying.barkodrapor;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidSystemInsets")
public class AndroidSystemInsetsPlugin extends Plugin {
    private volatile InsetsSnapshot snapshot = new InsetsSnapshot(0, 0, 0, 0);

    @Override
    public void load() {
        ViewCompat.setOnApplyWindowInsetsListener(
            getActivity().getWindow().getDecorView(),
            (view, windowInsets) -> {
                Insets systemBars = windowInsets.getInsetsIgnoringVisibility(
                    WindowInsetsCompat.Type.systemBars()
                );
                Insets displayCutout = windowInsets.getInsetsIgnoringVisibility(
                    WindowInsetsCompat.Type.displayCutout()
                );
                float density = getContext().getResources().getDisplayMetrics().density;

                double nextTop = toCssPixels(
                    Math.max(systemBars.top, displayCutout.top),
                    density
                );
                double nextRight = toCssPixels(
                    Math.max(systemBars.right, displayCutout.right),
                    density
                );
                double nextBottom = toCssPixels(
                    Math.max(systemBars.bottom, displayCutout.bottom),
                    density
                );
                double nextLeft = toCssPixels(
                    Math.max(systemBars.left, displayCutout.left),
                    density
                );

                InsetsSnapshot nextSnapshot = new InsetsSnapshot(
                    nextTop,
                    nextRight,
                    nextBottom,
                    nextLeft
                );

                if (!nextSnapshot.hasSameValues(snapshot)) {
                    snapshot = nextSnapshot;
                    notifyListeners(
                        "insetsChanged",
                        makeInsetsResult(nextSnapshot)
                    );
                }

                return windowInsets;
            }
        );

        ViewCompat.requestApplyInsets(getActivity().getWindow().getDecorView());
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        call.resolve(makeInsetsResult(snapshot));
    }

    private JSObject makeInsetsResult(InsetsSnapshot values) {
        JSObject result = new JSObject();
        result.put("top", values.top);
        result.put("right", values.right);
        result.put("bottom", values.bottom);
        result.put("left", values.left);
        return result;
    }

    private double toCssPixels(int physicalPixels, float density) {
        if (physicalPixels <= 0 || density <= 0) {
            return 0;
        }

        return Math.round((physicalPixels / density) * 100.0) / 100.0;
    }

    private static final class InsetsSnapshot {
        private final double top;
        private final double right;
        private final double bottom;
        private final double left;

        private InsetsSnapshot(
            double top,
            double right,
            double bottom,
            double left
        ) {
            this.top = top;
            this.right = right;
            this.bottom = bottom;
            this.left = left;
        }

        private boolean hasSameValues(InsetsSnapshot other) {
            return
                other != null &&
                top == other.top &&
                right == other.right &&
                bottom == other.bottom &&
                left == other.left;
        }
    }
}
