package workshop.airslice.ble;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Manages in-app WebView UI hot-updates and full Android APK self-updates from hosted downloads. */
final class AppUpdater {
    interface Listener {
        void onUpdateStateChanged();
        void onReloadWebView(String url);
    }

    static final int REQ_INSTALL_PERMISSION = 3;
    private static final String ASSET_URL = "file:///android_asset/controller.html";
    private static final String ALLOWED_HOST = "workshopnucleus.vercel.app";
    private static final String ORIGIN = "https://" + ALLOWED_HOST;
    private static final String MANIFEST_PATH = "/downloads/version.json";
    private static final String DEFAULT_UI_PATH = "/downloads/controller.html";
    private static final String DEFAULT_APK_PATH = "/downloads/air-slice-ble.apk";
    private static final String PREFS_NAME = "controllerkit_updates";
    private static final String KEY_UI_VERSION_CODE = "ui_version_code";
    private static final String KEY_UI_SHA256 = "ui_sha256";
    private static final String KEY_UI_FAILED = "ui_failed";
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private static final int MAX_UI_BYTES = 8 * 1024 * 1024;
    private static final int MAX_APK_BYTES = 50 * 1024 * 1024;

    private final Context appContext;
    private final SharedPreferences prefs;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final long installedVersionCode;
    private final String installedVersionName;
    private String bundledUiSha256;

    private boolean checking = false;
    private String downloading = "";
    private boolean uiAvailable = false;
    private boolean apkAvailable = false;
    private String latestVersionName = "";
    private String remoteUiUrl = ORIGIN + DEFAULT_UI_PATH;
    private String remoteUiSha256 = "";
    private String remoteApkUrl = ORIGIN + DEFAULT_APK_PATH;
    private String remoteApkSha256 = "";
    private String updateStatus = "Check for interface or APK updates.";
    private boolean pendingInstallPermission = false;

    AppUpdater(Context context, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.listener = listener;
        this.prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long code = 0;
        String name = "2.0.6";
        try {
            PackageManager pm = appContext.getPackageManager();
            PackageInfo info = pm.getPackageInfo(appContext.getPackageName(), 0);
            code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            if (info.versionName != null) name = info.versionName;
        } catch (PackageManager.NameNotFoundException ignored) {}
        this.installedVersionCode = code;
        this.installedVersionName = name;
        cleanupStaleCachedUi();
    }

    String assetUrl() {
        return ASSET_URL;
    }

    File cachedUiFile() {
        return new File(appContext.getFilesDir(), "controller.html");
    }

    String cachedUiUrl() {
        return cachedUiFile().toURI().toString();
    }

    String initialUrl() {
        return hasValidCachedUi() ? cachedUiUrl() : ASSET_URL;
    }

    boolean isAllowedUrl(String url) {
        return ASSET_URL.equals(url) || cachedUiUrl().equals(url);
    }

    void markCachedUiLoaded() {
        if (hasValidCachedUi() && prefs.getBoolean(KEY_UI_FAILED, false)) {
            prefs.edit().putBoolean(KEY_UI_FAILED, false).apply();
        }
    }

    void markCachedUiFailedAndDelete() {
        prefs.edit().putBoolean(KEY_UI_FAILED, true).apply();
        File file = cachedUiFile();
        if (file.exists()) file.delete();
        updateStatus = "Reverted to built-in controller interface.";
        notifyChanged();
    }

    JSONObject toJson() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("versionCode", installedVersionCode);
        obj.put("versionName", installedVersionName);
        obj.put("checking", checking);
        if (!downloading.isEmpty()) obj.put("downloading", downloading);
        obj.put("uiAvailable", uiAvailable);
        obj.put("apkAvailable", apkAvailable);
        if (!latestVersionName.isEmpty()) obj.put("latestVersionName", latestVersionName);
        obj.put("status", updateStatus);
        return obj;
    }

    void checkForUpdates(boolean quiet) {
        if (checking || !downloading.isEmpty()) return;
        checking = true;
        if (!quiet) updateStatus = "Checking for updates…";
        notifyChanged();
        executor.execute(() -> {
            try {
                String manifestUrl = ORIGIN + MANIFEST_PATH + "?t=" + System.currentTimeMillis();
                byte[] raw = downloadBytes(manifestUrl, MAX_MANIFEST_BYTES, 15000);
                JSONObject manifest = new JSONObject(new String(raw, StandardCharsets.UTF_8));
                long remoteCode = manifest.optLong("versionCode", 0);
                String remoteName = manifest.optString("versionName", "");
                String uiSha = manifest.optString("uiSha256", "");
                String apkSha = manifest.optString("apkSha256", "");
                String uiUrl = resolveSafeHttpsUrl(manifest.optString("uiUrl", DEFAULT_UI_PATH));
                String apkUrl = resolveSafeHttpsUrl(manifest.optString("apkUrl", DEFAULT_APK_PATH));
                String currentUiSha = activeUiSha256();
                boolean hasNewApk = remoteCode > installedVersionCode && apkUrl != null;
                boolean hasNewUi = !uiSha.isEmpty() && !uiSha.equalsIgnoreCase(currentUiSha) && uiUrl != null;
                main.post(() -> {
                    checking = false;
                    remoteUiSha256 = uiSha;
                    remoteApkSha256 = apkSha;
                    if (uiUrl != null) remoteUiUrl = uiUrl;
                    if (apkUrl != null) remoteApkUrl = apkUrl;
                    latestVersionName = remoteName;
                    apkAvailable = hasNewApk;
                    uiAvailable = hasNewUi;
                    if (apkAvailable && uiAvailable) {
                        updateStatus = "ControllerKit v" + remoteName + " and interface update ready.";
                    } else if (apkAvailable) {
                        updateStatus = "ControllerKit v" + remoteName + " is available to install.";
                    } else if (uiAvailable) {
                        updateStatus = "A newer controller interface is ready.";
                    } else {
                        updateStatus = "You are up to date (v" + installedVersionName + ").";
                    }
                    notifyChanged();
                });
            } catch (Exception e) {
                main.post(() -> {
                    checking = false;
                    if (!quiet) {
                        updateStatus = "Could not check updates. Check your connection and try again.";
                    }
                    notifyChanged();
                });
            }
        });
    }

    void applyUiUpdate() {
        if (checking || !downloading.isEmpty()) return;
        String targetUrl = resolveSafeHttpsUrl(remoteUiUrl);
        if (targetUrl == null) targetUrl = ORIGIN + DEFAULT_UI_PATH;
        final String urlToFetch = targetUrl;
        final String expectedSha = remoteUiSha256;
        downloading = "ui";
        updateStatus = "Downloading latest controller interface…";
        notifyChanged();
        executor.execute(() -> {
            File target = cachedUiFile();
            File temp = new File(appContext.getFilesDir(), "controller.html.tmp");
            try {
                byte[] bytes = downloadBytes(urlToFetch, MAX_UI_BYTES, 25000);
                String text = new String(bytes, StandardCharsets.UTF_8);
                if (!text.contains("<!doctype html") && !text.contains("<!DOCTYPE html")) {
                    throw new IOException("Invalid HTML document");
                }
                if (!text.contains("onNativeState") || !text.contains("AndroidController")) {
                    throw new IOException("Missing native controller bridge");
                }
                String actualSha = sha256Hex(bytes);
                if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(actualSha)) {
                    throw new IOException("Controller interface checksum mismatch");
                }
                try (FileOutputStream out = new FileOutputStream(temp)) {
                    out.write(bytes);
                    out.getFD().sync();
                }
                if (target.exists() && !target.delete()) {
                    throw new IOException("Could not replace previous cached interface");
                }
                if (!temp.renameTo(target)) {
                    throw new IOException("Could not save updated interface");
                }
                prefs.edit()
                    .putLong(KEY_UI_VERSION_CODE, installedVersionCode)
                    .putString(KEY_UI_SHA256, actualSha)
                    .putBoolean(KEY_UI_FAILED, false)
                    .apply();
                main.post(() -> {
                    downloading = "";
                    uiAvailable = false;
                    updateStatus = "Controller interface updated.";
                    notifyChanged();
                    listener.onReloadWebView(cachedUiUrl());
                });
            } catch (Exception e) {
                if (temp.exists()) temp.delete();
                main.post(() -> {
                    downloading = "";
                    updateStatus = "Interface update failed. Built-in interface kept.";
                    notifyChanged();
                });
            }
        });
    }

    void installApkUpdate(Activity activity) {
        if (checking || !downloading.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            pendingInstallPermission = true;
            updateStatus = "Allow app installs from ControllerKit, then return to continue.";
            notifyChanged();
            try {
                Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()));
                activity.startActivityForResult(perm, REQ_INSTALL_PERMISSION);
            } catch (RuntimeException e) {
                pendingInstallPermission = false;
                updateStatus = "Open Android Settings to allow installing app updates.";
                notifyChanged();
            }
            return;
        }
        startApkDownloadAndInstall(activity);
    }

    void onInstallPermissionResult(Activity activity) {
        if (!pendingInstallPermission) return;
        pendingInstallPermission = false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.getPackageManager().canRequestPackageInstalls()) {
            startApkDownloadAndInstall(activity);
        } else {
            updateStatus = "Install permission not granted. Allow unknown app installs to update.";
            notifyChanged();
        }
    }

    void shutdown() {
        executor.shutdownNow();
        main.removeCallbacksAndMessages(null);
    }

    private void startApkDownloadAndInstall(Activity activity) {
        String targetUrl = resolveSafeHttpsUrl(remoteApkUrl);
        if (targetUrl == null) targetUrl = ORIGIN + DEFAULT_APK_PATH;
        final String urlToFetch = targetUrl;
        final String expectedSha = remoteApkSha256;
        final String versionLabel = latestVersionName.isEmpty() ? "latest" : latestVersionName;
        downloading = "apk";
        updateStatus = "Downloading ControllerKit v" + versionLabel + "…";
        notifyChanged();
        executor.execute(() -> {
            File target = ApkProvider.updateFile(appContext);
            File parent = target.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                postDownloadFailure("Could not prepare update folder.");
                return;
            }
            File temp = new File(parent, "air-slice-ble.apk.tmp");
            try {
                String actualSha = downloadToFile(urlToFetch, temp, MAX_APK_BYTES, 60000);
                if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(actualSha)) {
                    throw new IOException("APK checksum mismatch");
                }
                if (target.exists() && !target.delete()) {
                    throw new IOException("Could not replace previous APK file");
                }
                if (!temp.renameTo(target)) {
                    throw new IOException("Could not store downloaded APK");
                }
                Uri apkUri = ApkProvider.uriForUpdate(appContext);
                main.post(() -> {
                    downloading = "";
                    updateStatus = "Opening Android installer for v" + versionLabel + "…";
                    notifyChanged();
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(intent);
                    } catch (RuntimeException e) {
                        updateStatus = "Could not launch Android installer. Try downloading from Chrome.";
                        notifyChanged();
                    }
                });
            } catch (Exception e) {
                if (temp.exists()) temp.delete();
                postDownloadFailure("APK download failed. Check your connection and try again.");
            }
        });
    }

    private void postDownloadFailure(String text) {
        main.post(() -> {
            downloading = "";
            updateStatus = text;
            notifyChanged();
        });
    }

    private void cleanupStaleCachedUi() {
        long uiCode = prefs.getLong(KEY_UI_VERSION_CODE, -1);
        File file = cachedUiFile();
        if (uiCode != installedVersionCode || prefs.getBoolean(KEY_UI_FAILED, false)) {
            if (file.exists()) file.delete();
            prefs.edit().remove(KEY_UI_SHA256).remove(KEY_UI_VERSION_CODE).putBoolean(KEY_UI_FAILED, false).apply();
        }
    }

    private boolean hasValidCachedUi() {
        File file = cachedUiFile();
        return prefs.getLong(KEY_UI_VERSION_CODE, -1) == installedVersionCode
            && !prefs.getBoolean(KEY_UI_FAILED, false)
            && file.isFile()
            && file.length() > 1024;
    }

    private String activeUiSha256() {
        if (hasValidCachedUi()) {
            String stored = prefs.getString(KEY_UI_SHA256, "");
            if (!stored.isEmpty()) return stored;
            try (InputStream in = new FileInputStream(cachedUiFile())) {
                return sha256Hex(in);
            } catch (Exception ignored) {}
        }
        if (bundledUiSha256 != null) return bundledUiSha256;
        try (InputStream in = appContext.getAssets().open("controller.html")) {
            bundledUiSha256 = sha256Hex(in);
            return bundledUiSha256;
        } catch (Exception ignored) {
            return "";
        }
    }

    private void notifyChanged() {
        listener.onUpdateStateChanged();
    }

    private static String resolveSafeHttpsUrl(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String candidate = raw.trim();
        if (candidate.startsWith("/downloads/")) candidate = ORIGIN + candidate;
        try {
            URL parsed = new URL(candidate);
            if (!"https".equalsIgnoreCase(parsed.getProtocol())) return null;
            if (!ALLOWED_HOST.equalsIgnoreCase(parsed.getHost())) return null;
            if (parsed.getPath() == null || !parsed.getPath().startsWith("/downloads/")) return null;
            return parsed.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static HttpURLConnection openDownload(String urlText, int readTimeoutMs) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlText).openConnection();
        conn.setRequestMethod("GET");
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(readTimeoutMs);
        conn.setUseCaches(false);
        conn.setRequestProperty("Cache-Control", "no-cache");
        conn.connect();
        int code = conn.getResponseCode();
        if (code != HttpURLConnection.HTTP_OK) {
            conn.disconnect();
            throw new IOException("HTTP " + code);
        }
        URL finalUrl = conn.getURL();
        if (finalUrl == null || !"https".equalsIgnoreCase(finalUrl.getProtocol()) || !ALLOWED_HOST.equalsIgnoreCase(finalUrl.getHost())) {
            conn.disconnect();
            throw new IOException("Unexpected redirect host");
        }
        return conn;
    }

    private static byte[] downloadBytes(String urlText, int maxBytes, int readTimeoutMs) throws IOException {
        HttpURLConnection conn = openDownload(urlText, readTimeoutMs);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int total = 0;
            int read;
            while ((read = in.read(buf)) != -1) {
                total += read;
                if (total > maxBytes) throw new IOException("Download exceeds limit");
                out.write(buf, 0, read);
            }
            return out.toByteArray();
        } finally {
            conn.disconnect();
        }
    }

    private static String downloadToFile(String urlText, File dest, int maxBytes, int readTimeoutMs)
        throws IOException, NoSuchAlgorithmException {
        HttpURLConnection conn = openDownload(urlText, readTimeoutMs);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int total = 0;
            int read;
            while ((read = in.read(buf)) != -1) {
                total += read;
                if (total > maxBytes) throw new IOException("APK exceeds limit");
                digest.update(buf, 0, read);
                out.write(buf, 0, read);
            }
            out.getFD().sync();
            return hex(digest.digest());
        } finally {
            conn.disconnect();
        }
    }

    private static String sha256Hex(byte[] bytes) throws NoSuchAlgorithmException {
        return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static String sha256Hex(InputStream in) throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[8192];
        int read;
        while ((read = in.read(buf)) != -1) digest.update(buf, 0, read);
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.US, "%02x", b & 0xff));
        return sb.toString();
    }
}
