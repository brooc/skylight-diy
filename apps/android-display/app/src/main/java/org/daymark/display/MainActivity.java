package org.daymark.display;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String PREFERENCES = "daymark-display";
    private static final String SERVER_URL = "server-url";
    private static final int SETTINGS_BACK_PRESSES = 5;
    private static final long SETTINGS_BACK_WINDOW_MS = 5_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences preferences;
    private WebView webView;
    private FrameLayout browserFrame;
    private LinearLayout connectionNotice;
    private TextView connectionMessage;
    private String serverUrl;
    private boolean mainFrameFailed;
    private int backPressCount;
    private long firstBackPressAt;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private TextToSpeech textToSpeech;
    private boolean textToSpeechReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        serverUrl = preferences.getString(SERVER_URL, null);
        enterImmersiveMode();
        initializeTextToSpeech();
        watchNetwork();
        if (serverUrl == null) {
            showConnectionSetup();
        } else {
            showDaymark(serverUrl);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('daymark-display-resume'));",
                null
            );
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // The callback was already removed by Android.
            }
        }
        if (webView != null) webView.destroy();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - firstBackPressAt > SETTINGS_BACK_WINDOW_MS) {
            firstBackPressAt = now;
            backPressCount = 0;
        }
        backPressCount += 1;
        int remaining = SETTINGS_BACK_PRESSES - backPressCount;
        if (remaining <= 0) {
            backPressCount = 0;
            showConnectionSetup();
            return;
        }
        Toast.makeText(
            this,
            "Press Back " + remaining + " more time" + (remaining == 1 ? "" : "s") + " for display settings",
            Toast.LENGTH_SHORT
        ).show();
    }

    private void showConnectionSetup() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        enterImmersiveMode();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(247, 247, 245));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(40), dp(32), dp(40), dp(32));
        scroll.addView(content, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView mark = text("D", 42, Color.rgb(15, 118, 110));
        mark.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(mark);

        TextView title = text("Daymark Display", 28, Color.rgb(15, 23, 42));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(title, margins(dp(520), ViewGroup.LayoutParams.WRAP_CONTENT, 0, dp(4), 0, dp(8)));

        TextView introduction = text(
            "Connect this tablet to the Daymark server on your home network.",
            16,
            Color.rgb(71, 85, 105)
        );
        introduction.setGravity(Gravity.CENTER);
        content.addView(introduction, margins(dp(520), ViewGroup.LayoutParams.WRAP_CONTENT, 0, 0, 0, dp(22)));

        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setText(serverUrl == null ? DaymarkAddress.DEFAULT_URL : serverUrl);
        address.setSelectAllOnFocus(true);
        address.setTextSize(17);
        address.setHint("http://daymark.local:8080");
        address.setContentDescription("Daymark server address");
        content.addView(address, margins(dp(520), dp(58), 0, 0, 0, dp(14)));

        TextView error = text("", 14, Color.rgb(185, 28, 28));
        error.setVisibility(View.GONE);
        content.addView(error, margins(dp(520), ViewGroup.LayoutParams.WRAP_CONTENT, 0, 0, 0, dp(8)));

        Button connect = button("Connect to Daymark");
        connect.setOnClickListener(view -> {
            try {
                String normalized = DaymarkAddress.normalize(address.getText().toString());
                preferences.edit().putString(SERVER_URL, normalized).apply();
                serverUrl = normalized;
                showDaymark(normalized);
            } catch (IllegalArgumentException invalidAddress) {
                error.setText(invalidAddress.getMessage());
                error.setVisibility(View.VISIBLE);
            }
        });
        content.addView(connect, margins(dp(520), dp(56), 0, 0, 0, dp(14)));

        Button home = button("Make Daymark the home screen");
        home.setOnClickListener(view -> requestHomeRole());
        content.addView(home, margins(dp(520), dp(52), 0, 0, 0, dp(10)));

        TextView homeHelp = text(
            "Optional: selecting Daymark as the Home app makes it return automatically after startup and whenever Home is pressed.",
            13,
            Color.rgb(100, 116, 139)
        );
        homeHelp.setGravity(Gravity.CENTER);
        content.addView(homeHelp, margins(dp(520), ViewGroup.LayoutParams.WRAP_CONTENT, 0, 0, 0, 0));

        setContentView(scroll);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showDaymark(String url) {
        enterImmersiveMode();
        browserFrame = new FrameLayout(this);
        browserFrame.setBackgroundColor(Color.rgb(247, 247, 245));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " DaymarkDisplay/1.0");
        webView.addJavascriptInterface(new DaymarkDisplayBridge(), "DaymarkDisplay");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.rgb(247, 247, 245));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                if (progress >= 80) showBrowserIfDaymark(view.getUrl());
            }
        });
        webView.setWebViewClient(new DaymarkWebViewClient());
        browserFrame.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        connectionNotice = new LinearLayout(this);
        connectionNotice.setOrientation(LinearLayout.VERTICAL);
        connectionNotice.setGravity(Gravity.CENTER);
        connectionNotice.setPadding(dp(32), dp(28), dp(32), dp(28));
        connectionNotice.setBackgroundColor(Color.rgb(247, 247, 245));
        connectionNotice.setVisibility(View.GONE);
        ProgressBar progress = new ProgressBar(this);
        connectionNotice.addView(progress, new LinearLayout.LayoutParams(dp(52), dp(52)));
        connectionMessage = text("Connecting to Daymark…", 18, Color.rgb(51, 65, 85));
        connectionMessage.setGravity(Gravity.CENTER);
        connectionNotice.addView(connectionMessage, margins(dp(520), ViewGroup.LayoutParams.WRAP_CONTENT, 0, dp(18), 0, dp(12)));
        Button retry = button("Try again");
        retry.setOnClickListener(view -> reloadDaymark());
        connectionNotice.addView(retry, margins(dp(280), dp(52), 0, 0, 0, dp(8)));
        Button change = button("Change server address");
        change.setOnClickListener(view -> showConnectionSetup());
        connectionNotice.addView(change, margins(dp(280), dp(52), 0, 0, 0, 0));
        FrameLayout.LayoutParams noticeLayout = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        browserFrame.addView(connectionNotice, noticeLayout);

        setContentView(browserFrame);
        showConnecting("Connecting to Daymark…");
        webView.loadUrl(url);
        WebView loadingWebView = webView;
        handler.postDelayed(() -> {
            if (webView == loadingWebView && !mainFrameFailed) {
                showBrowserIfDaymark(loadingWebView.getUrl());
            }
        }, 2_500L);
    }

    private void initializeTextToSpeech() {
        textToSpeech = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || textToSpeech == null) return;
            int result = textToSpeech.setLanguage(Locale.getDefault());
            textToSpeechReady = result != TextToSpeech.LANG_MISSING_DATA
                && result != TextToSpeech.LANG_NOT_SUPPORTED;
        });
    }

    private final class DaymarkDisplayBridge {
        @JavascriptInterface
        public void speak(String message) {
            if (message == null || message.isBlank()) return;
            String safeMessage = message.length() > 500
                ? message.substring(0, 500)
                : message;
            handler.post(() -> {
                if (!textToSpeechReady || textToSpeech == null) return;
                textToSpeech.speak(
                    safeMessage,
                    TextToSpeech.QUEUE_FLUSH,
                    null,
                    "daymark-calendar-reminder"
                );
            });
        }
    }

    private void reloadDaymark() {
        if (webView == null) {
            showDaymark(serverUrl);
            return;
        }
        mainFrameFailed = false;
        showConnecting("Reconnecting to Daymark…");
        webView.loadUrl(serverUrl);
    }

    private void showConnecting(String message) {
        if (connectionNotice == null) return;
        connectionMessage.setText(message);
        connectionNotice.setVisibility(View.VISIBLE);
        connectionNotice.bringToFront();
    }

    private void showBrowser() {
        mainFrameFailed = false;
        if (connectionNotice != null) connectionNotice.setVisibility(View.GONE);
    }

    private void showBrowserIfDaymark(String url) {
        if (!mainFrameFailed && DaymarkAddress.isSameOrigin(serverUrl, url)) {
            showBrowser();
        }
    }

    private void watchNetwork() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                handler.post(() -> {
                    if (mainFrameFailed && webView != null) reloadDaymark();
                });
            }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    private void requestHomeRole() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roles = (RoleManager) getSystemService(ROLE_SERVICE);
            if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME)) {
                if (roles.isRoleHeld(RoleManager.ROLE_HOME)) {
                    Toast.makeText(this, "Daymark is already the Home app", Toast.LENGTH_SHORT).show();
                } else {
                    startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), 100);
                }
                return;
            }
        }
        startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
    }

    private boolean openOutsideDaymark(String value) {
        try {
            Intent intent;
            if (value.startsWith("intent:")) {
                intent = Intent.parseUri(value, Intent.URI_INTENT_SCHEME);
                if (intent.resolveActivity(getPackageManager()) == null) {
                    intent.setPackage(null);
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value));
            }
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | java.net.URISyntaxException error) {
            Toast.makeText(this, "Install or enable Chrome to continue", Toast.LENGTH_LONG).show();
            return true;
        }
    }

    private void enterImmersiveMode() {
        View decorView = getWindow().getDecorView();
        decorView.post(() -> applyImmersiveMode(decorView));
    }

    private void applyImmersiveMode(View decorView) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decorView.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private TextView text(String value, float size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(15);
        button.setAllCaps(false);
        return button;
    }

    private LinearLayout.LayoutParams margins(
        int width,
        int height,
        int left,
        int top,
        int right,
        int bottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.setMargins(left, top, right, bottom);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class DaymarkWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String value = request.getUrl().toString();
            if (value.startsWith("intent:")) return openOutsideDaymark(value);
            if ((value.startsWith("http://") || value.startsWith("https://"))
                && !DaymarkAddress.isSameOrigin(serverUrl, value)) {
                return openOutsideDaymark(value);
            }
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            showBrowserIfDaymark(url);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            showBrowserIfDaymark(url);
        }

        @Override
        public void onReceivedError(
            WebView view,
            WebResourceRequest request,
            WebResourceError error
        ) {
            if (request.isForMainFrame()) {
                mainFrameFailed = true;
                showConnecting("Daymark is not reachable yet. Check Wi-Fi or try again.");
            }
        }
    }
}
