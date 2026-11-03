package kr.briansong.airsignal;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

// 배포된 웹앱을 안전한 웹뷰로 표시하고 안드로이드 탐색 동작을 연결합니다.
public final class MainActivity extends Activity {
    private static final String HOME = "https://python113.vercel.app/";
    private WebView webView;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private boolean mainFrameFailed;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(243, 244, 238));
        setContentView(root);
        // 화면 잘림을 방지하고 상태 표시줄과 하단 제스처 영역을 확보합니다.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(243, 244, 238));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP);
        root.addView(progress, progressLayout);
        createErrorPanel(root);

        // 웹앱과 차트에 필요한 자바스크립트만 허용하고 로컬 파일 접근은 차단합니다.
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value < 100 && !mainFrameFailed ? View.VISIBLE : View.GONE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "python113.vercel.app".equals(uri.getHost())) return false;
                // 출처 링크 등 다른 HTTPS 사이트는 기본 브라우저로 엽니다.
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException error) { Toast.makeText(MainActivity.this, "링크를 열 수 있는 브라우저가 없습니다.", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                mainFrameFailed = false;
                errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!mainFrameFailed) webView.setVisibility(View.VISIBLE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnectionError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showConnectionError();
            }
        });
        // 재실행 시 탐색 기록을 복원하되 첫 실행은 앱의 시작 주소를 엽니다.
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(HOME);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::navigateBack);
        }
    }

    // 인터넷이 끊겨도 흰 화면 대신 한국어 재시도 화면을 보여줍니다.
    private void createErrorPanel(FrameLayout root) {
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(28), dp(28), dp(28));
        errorPanel.setBackgroundColor(Color.rgb(243, 244, 238));
        TextView title = new TextView(this);
        title.setText("공기정보에 연결하지 못했어요");
        title.setTextSize(22);
        title.setTextColor(Color.rgb(24, 40, 31));
        title.setGravity(Gravity.CENTER);
        TextView description = new TextView(this);
        description.setText("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
        description.setTextSize(15);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, dp(16), 0, dp(24));
        Button retry = new Button(this);
        retry.setText("다시 불러오기");
        retry.setOnClickListener(view -> {
            errorPanel.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(HOME);
        });
        errorPanel.addView(title);
        errorPanel.addView(description);
        errorPanel.addView(retry);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
    }

    private void showConnectionError() {
        mainFrameFailed = true;
        progress.setVisibility(View.GONE);
        webView.setVisibility(View.INVISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void navigateBack() { if (webView.canGoBack()) webView.goBack(); else finish(); }
    @Override public void onBackPressed() { navigateBack(); }
    @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onDestroy() { webView.destroy(); super.onDestroy(); }
}
