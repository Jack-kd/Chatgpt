const generateBtn = document.getElementById('generateBtn');
const statusText = document.getElementById('status');

const requireValue = (id, message) => {
  const el = document.getElementById(id);
  const value = el.value.trim();
  if (!value) throw new Error(message);
  return value;
};

const validatePackageName = (pkg) => {
  const ok = /^[a-zA-Z]+(\.[a-zA-Z0-9_]+)+$/.test(pkg);
  if (!ok) {
    throw new Error('包名格式不合法，请使用例如 com.example.app 的格式');
  }
};

const ensureHttps = (url) => {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error('网址不合法，请输入 http/https 开头的完整网址');
  }
};

const toPackagePath = (pkg) => pkg.split('.').join('/');

const readImageAsBase64 = async (file) => {
  if (!file) return null;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1];
};

const createMainActivity = (pkg, url) => `package ${pkg}

import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private val prefs by lazy { getSharedPreferences("web_state", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        swipeRefresh = findViewById(R.id.swipeRefresh)

        setupWebView()
        setupBackNavigation()

        val lastUrl = prefs.getString("last_url", null)
        val target = lastUrl ?: "${url}"
        webView.loadUrl(target)
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadsImagesAutomatically = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.setSupportZoom(false)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
                if (!url.isNullOrEmpty()) prefs.edit().putString("last_url", url).apply()
                super.onPageStarted(view, url, favicon)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    Toast.makeText(this@MainActivity, "页面加载失败，请检查网络或 VPN", Toast.LENGTH_SHORT).show()
                }
                super.onReceivedError(view, request, error)
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler, error: SslError?) {
                handler.cancel()
                Toast.makeText(this@MainActivity, "SSL 证书异常，已阻止访问", Toast.LENGTH_SHORT).show()
            }
        }

        swipeRefresh.setOnRefreshListener {
            webView.reload()
            swipeRefresh.isRefreshing = false
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onPause() {
        super.onPause()
        prefs.edit().putString("last_url", webView.url ?: "${url}").apply()
    }
}
`;

const createManifest = (pkg, appName) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${appName}"
        android:networkSecurityConfig="@xml/network_security_config"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.WebWrap">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

const createGradleProject = (pkg) => ({
  settings: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "WebWrap"
include(":app")
`,
  rootBuild: `plugins {
    id("com.android.application") version "8.3.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.23" apply false
}
`,
  appBuild: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "${pkg}"
    compileSdk = 34

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}
`,
});

const createLayout = () => `<?xml version="1.0" encoding="utf-8"?>
<androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/swipeRefresh"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent">

        <WebView
            android:id="@+id/webView"
            android:layout_width="match_parent"
            android:layout_height="match_parent" />

        <ProgressBar
            android:id="@+id/progressBar"
            style="@android:style/Widget.DeviceDefault.Light.ProgressBar.Horizontal"
            android:layout_width="match_parent"
            android:layout_height="4dp"
            android:max="100"
            android:progress="0" />
    </FrameLayout>
</androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
`;

const createThemeFiles = () => ({
  themes: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.WebWrap" parent="Theme.Material3.DayNight.NoActionBar" />
</resources>
`,
  strings: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">WebWrap</string>
</resources>
`,
  network: `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`,
});

const addIcon = (zip, base64Icon) => {
  if (!base64Icon) return;
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  densities.forEach((d) => {
    zip.file(`app/src/main/res/mipmap-${d}/ic_launcher.png`, base64Icon, { base64: true });
  });
};

generateBtn.addEventListener('click', async () => {
  try {
    statusText.textContent = '正在生成中，请稍候...';
    const appName = requireValue('appName', '请填写应用名称');
    const webUrl = ensureHttps(requireValue('webUrl', '请填写网址'));
    const packageName = requireValue('packageName', '请填写包名');
    validatePackageName(packageName);
    const packagePath = toPackagePath(packageName);

    const iconFile = document.getElementById('iconFile').files[0];
    const iconBase64 = await readImageAsBase64(iconFile);

    const zip = new JSZip();
    const gradle = createGradleProject(packageName);
    const themeFiles = createThemeFiles();

    zip.file('settings.gradle.kts', gradle.settings);
    zip.file('build.gradle.kts', gradle.rootBuild);
    zip.file('app/build.gradle.kts', gradle.appBuild);
    zip.file('app/proguard-rules.pro', '# no-op');
    zip.file('gradle.properties', 'org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\n');

    zip.file(`app/src/main/java/${packagePath}/MainActivity.kt`, createMainActivity(packageName, webUrl));
    zip.file('app/src/main/AndroidManifest.xml', createManifest(packageName, appName));
    zip.file('app/src/main/res/layout/activity_main.xml', createLayout());
    zip.file('app/src/main/res/values/themes.xml', themeFiles.themes);
    zip.file('app/src/main/res/values/strings.xml', themeFiles.strings.replace('WebWrap', appName));
    zip.file('app/src/main/res/xml/network_security_config.xml', themeFiles.network);

    addIcon(zip, iconBase64);

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${appName.replace(/\s+/g, '_')}_AndroidProject.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    statusText.textContent = '生成成功！已开始下载 ZIP，导入 Android Studio 后即可打包 APK。';
  } catch (error) {
    statusText.textContent = `生成失败：${error.message}`;
  }
});
