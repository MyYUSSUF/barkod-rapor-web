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
    private volatile InsetsSnapshot snapshot = new InsetsSnapshot(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        false,
        false
    );

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
                Insets ime = windowInsets.getInsets(
                    WindowInsetsCompat.Type.ime()
                );
                boolean imeVisible = windowInsets.isVisible(
                    WindowInsetsCompat.Type.ime()
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
                double nextImeTop = toCssPixels(ime.top, density);
                double nextImeRight = toCssPixels(ime.right, density);
                double nextImeBottom = toCssPixels(ime.bottom, density);
                double nextImeLeft = toCssPixels(ime.left, density);

                InsetsSnapshot nextSnapshot = new InsetsSnapshot(
                    nextTop,
                    nextRight,
                    nextBottom,
                    nextLeft,
                    nextImeTop,
                    nextImeRight,
                    nextImeBottom,
                    nextImeLeft,
                    imeVisible,
                    true
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
        getActivity().runOnUiThread(
            () -> {
                android.view.View rootView = getActivity()
                    .getWindow()
                    .getDecorView();
                ViewCompat.requestApplyInsets(rootView);
                rootView.postOnAnimation(
                    () -> call.resolve(makeInsetsResult(snapshot))
                );
            }
        );
    }

    private JSObject makeInsetsResult(InsetsSnapshot values) {
        JSObject result = new JSObject();
        result.put("top", values.top);
        result.put("right", values.right);
        result.put("bottom", values.bottom);
        result.put("left", values.left);
        result.put("imeTop", values.imeTop);
        result.put("imeRight", values.imeRight);
        result.put("imeBottom", values.imeBottom);
        result.put("imeLeft", values.imeLeft);
        result.put("imeVisible", values.imeVisible);
        result.put("ready", values.ready);
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
        private final double imeTop;
        private final double imeRight;
        private final double imeBottom;
        private final double imeLeft;
        private final boolean imeVisible;
        private final boolean ready;

        private InsetsSnapshot(
            double top,
            double right,
            double bottom,
            double left,
            double imeTop,
            double imeRight,
            double imeBottom,
            double imeLeft,
            boolean imeVisible,
            boolean ready
        ) {
            this.top = top;
            this.right = right;
            this.bottom = bottom;
            this.left = left;
            this.imeTop = imeTop;
            this.imeRight = imeRight;
            this.imeBottom = imeBottom;
            this.imeLeft = imeLeft;
            this.imeVisible = imeVisible;
            this.ready = ready;
        }

        private boolean hasSameValues(InsetsSnapshot other) {
            return
                other != null &&
                top == other.top &&
                right == other.right &&
                bottom == other.bottom &&
                left == other.left &&
                imeTop == other.imeTop &&
                imeRight == other.imeRight &&
                imeBottom == other.imeBottom &&
                imeLeft == other.imeLeft &&
                imeVisible == other.imeVisible &&
                ready == other.ready;
        }
    }
}
