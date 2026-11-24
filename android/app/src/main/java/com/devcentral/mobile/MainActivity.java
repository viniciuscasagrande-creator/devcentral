package com.devcentral.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

public class MainActivity extends Activity {

    private static final String LIVE_URL = "https://devcentral-190fe.web.app/";
    private static final String FALLBACK_LOCAL_ASSET = "file:///android_asset/www/index.html";

    private WebView webView;
    private ProgressBar progressBar;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#070A14"));
            window.setNavigationBarColor(Color.parseColor("#080C17"));

            // Support display cutout (notch/camera punch-hole) cleanly
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode =
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            // Ensure light status/navigation bar icons on dark #070A14 background
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.setSystemBarsAppearance(
                            0,
                            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    );
                }
            }
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#070A14"));

        // Handle Android 15+ (SDK 35/36) mandatory edge-to-edge system bar, cutout & IME insets
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    int left = 0;
                    int top = 0;
                    int right = 0;
                    int bottom = 0;

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Insets sysBars = insets.getInsets(
                                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                        );
                        Insets ime = insets.getInsets(WindowInsets.Type.ime());
                        left = sysBars.left;
                        top = sysBars.top;
                        right = sysBars.right;
                        bottom = Math.max(sysBars.bottom, ime.bottom);
                    } else {
                        left = insets.getSystemWindowInsetLeft();
                        top = insets.getSystemWindowInsetTop();
                        right = insets.getSystemWindowInsetRight();
                        bottom = insets.getSystemWindowInsetBottom();
                    }

                    v.setPadding(left, top, right, bottom);
                    return insets;
                }
            });
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#070A14"));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                6,
                Gravity.TOP
        );

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(progressBar, pbParams);
        setContentView(root);

        configureWebView();

        String initialUrl = resolveInitialUrl(getIntent());
        webView.loadUrl(initialUrl);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            String target = resolveInitialUrl(intent);
            webView.loadUrl(target);
        }
    }

    private String resolveInitialUrl(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String dataUrl = intent.getDataString();
            if (dataUrl != null && dataUrl.startsWith("http")) {
                return dataUrl;
            }
        }
        if (intent != null && intent.hasExtra("shortcut_path")) {
            String path = intent.getStringExtra("shortcut_path");
            if (path != null && !path.isEmpty()) {
                return LIVE_URL.replaceAll("/$", "") + path;
            }
        }
        return LIVE_URL;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Clean User-Agent (removes "; wv") so Google OAuth and Firebase Auth work seamlessly on mobile
        String defaultUa = settings.getUserAgentString();
        if (defaultUa != null) {
            String cleanUa = defaultUa.replace("; wv", "").replace("Version/4.0 ", "");
            settings.setUserAgentString(cleanUa + " DevCentralMobile/3.0");
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progressBar == null) return;
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (progressBar != null) {
                    progressBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (progressBar != null) {
                    progressBar.setVisibility(View.GONE);
                }
                CookieManager.getInstance().flush();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return handleUri(view, uri);
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUri(view, Uri.parse(url));
            }

            private boolean handleUri(WebView view, Uri uri) {
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                if ("file".equals(scheme)) {
                    String path = uri.getPath() != null ? uri.getPath() : "";
                    if (path.equals("/operacoes") || path.equals("/assistente") || path.equals("/relatorios") || path.equals("/telemetria")) {
                        view.loadUrl("file:///android_asset/www" + path + "/index.html");
                        return true;
                    }
                    if (path.equals("/")) {
                        view.loadUrl(FALLBACK_LOCAL_ASSET);
                        return true;
                    }
                    return false;
                }

                // Keep DevCentral & Google/Firebase Auth flows inside the app WebView
                if (host.contains("devcentral-190fe.web.app")
                        || host.contains("devcentral-190fe.firebaseapp.com")
                        || host.contains("accounts.google.com")
                        || host.contains("googleapis.com")
                        || host.contains("gstatic.com")
                        || host.equals("localhost")
                        || host.equals("10.0.2.2")) {
                    return false;
                }

                // Open external links (GitHub, GitLab, deployed Vercel sites, etc.) in external browser
                try {
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(browserIntent);
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    String failingUrl = request.getUrl() != null ? request.getUrl().toString() : "";
                    if (failingUrl.startsWith("http")) {
                        view.loadUrl(FALLBACK_LOCAL_ASSET);
                    }
                }
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
