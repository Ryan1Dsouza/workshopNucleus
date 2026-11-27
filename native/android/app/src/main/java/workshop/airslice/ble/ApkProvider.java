package workshop.airslice.ble;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Read-only FileProvider-style content provider restricted strictly to the downloaded update APK. */
public class ApkProvider extends ContentProvider {
    private static final String UPDATE_PATH = "/update.apk";
    private static final String APK_MIME = "application/vnd.android.package-archive";

    static Uri uriForUpdate(Context context) {
        return Uri.parse("content://" + context.getPackageName() + ".provider" + UPDATE_PATH);
    }

    static File updateFile(Context context) {
        return new File(new File(context.getFilesDir(), "updates"), "air-slice-ble.apk");
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return uri != null && UPDATE_PATH.equals(uri.getPath()) ? APK_MIME : null;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Context context = getContext();
        if (context == null || uri == null || !UPDATE_PATH.equals(uri.getPath())) return null;
        File file = updateFile(context);
        String[] cols = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor cursor = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = file.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = file.exists() ? file.length() : 0L;
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Context context = getContext();
        if (context == null || uri == null || !UPDATE_PATH.equals(uri.getPath())) {
            throw new FileNotFoundException("Unknown APK URI");
        }
        if (mode == null || !mode.equals("r")) {
            throw new FileNotFoundException("Read-only provider");
        }
        File file = updateFile(context);
        if (!file.isFile()) {
            throw new FileNotFoundException("Downloaded APK is missing");
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
