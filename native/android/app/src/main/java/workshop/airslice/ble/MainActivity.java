package workshop.airslice.ble;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import org.json.*;
import java.util.ArrayList;

/** The offline shared UI sends commands; the foreground service owns BLE/sensors. */
public class MainActivity extends Activity {
    MotionService service;
    WebView web;
    boolean bound=false,resumed=false,startRequested=false,requesting=false,waitingBluetooth=false,pageReady=false;
    final Handler main=new Handler(Looper.getMainLooper());
    final MotionService.Listener listener=this::render;
    final ServiceConnection connection=new ServiceConnection(){
        @Override public void onServiceConnected(ComponentName name,IBinder binder){service=((MotionService.LocalBinder)binder).service();service.attach(listener);}
        @Override public void onServiceDisconnected(ComponentName name){service=null;render(null);}
    };
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(238,241,246));getWindow().setNavigationBarColor(Color.rgb(238,241,246));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web=new WebView(this);web.setBackgroundColor(Color.rgb(238,241,246));web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(false);
        web.getSettings().setAllowContentAccess(false);web.getSettings().setAllowFileAccess(true);
        web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        web.addJavascriptInterface(new Bridge(),"AndroidController");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().equals("file:///android_asset/controller.html");}
            @Override public void onPageFinished(WebView view,String url){pageReady=true;render(service);}
        });
        setContentView(web);web.loadUrl("file:///android_asset/controller.html");
    }
    public final class Bridge {
        @JavascriptInterface public void post(String body){
            if(body==null||body.length()>512)return;
            main.post(()->{
                try{
                    JSONObject data=new JSONObject(body);
                    switch(data.optString("type")){
                        case "ready":pageReady=true;render(service);break;
                        case "start":startRequested=true;ensureReady();break;
                        case "stop":startRequested=false;startService(new Intent(MainActivity.this,MotionService.class).setAction(MotionService.STOP));break;
                        case "buttons":if(service!=null)service.setButtons(data.optInt("mask",0));break;
                        case "center":if(service!=null)service.centerBlade();break;
                        case "motion":if(service!=null)service.setMotion(data.optBoolean("enabled"));break;
                        case "haptics":if(service!=null)service.setHaptics(data.optBoolean("enabled"));break;
                        case "camera":recordVideo();break;
                        default:break;
                    }
                }catch(JSONException ignored){}
            });
        }
    }
    void render(MotionService value){
        if(web==null||!pageReady)return;
        try{
            JSONObject data=new JSONObject().put("running",value!=null&&value.running()).put("connected",value!=null&&value.connected())
                .put("motionAvailable",value==null||value.motionAvailable()).put("sensing",value!=null&&value.sensing())
                .put("haptics",value==null||value.haptics()).put("camera",true)
                .put("status",value==null?"Start Bluetooth, then select this phone on the laptop.":value.status());
            if(value!=null&&value.profile()!=null)data.put("profile",value.profile());
            web.evaluateJavascript("window.onNativeState && window.onNativeState("+data.toString()+");",null);
            int orientation=value!=null&&value.connected()&&value.profile()!=null&&"landscape".equals(value.profile().optString("orientation"))
                ?ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE:ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
            if(getRequestedOrientation()!=orientation)setRequestedOrientation(orientation);
        }catch(JSONException ignored){}
    }
    void status(String text){if(web!=null)web.evaluateJavascript("window.onNativeState && window.onNativeState({status:"+JSONObject.quote(text)+"});",null);}
    boolean bluetoothPermissions(){return Build.VERSION.SDK_INT<31||checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;}
    void ensureReady(){
        if(!startRequested||!resumed||requesting||waitingBluetooth)return;
        ArrayList<String> permissions=new ArrayList<>();
        if(Build.VERSION.SDK_INT>=31){for(String name:new String[]{Manifest.permission.BLUETOOTH_ADVERTISE,Manifest.permission.BLUETOOTH_CONNECT})if(checkSelfPermission(name)!=PackageManager.PERMISSION_GRANTED)permissions.add(name);}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!getPreferences(MODE_PRIVATE).getBoolean("notificationsAsked",false)){
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);getPreferences(MODE_PRIVATE).edit().putBoolean("notificationsAsked",true).apply();
        }
        if(!permissions.isEmpty()){requesting=true;requestPermissions(permissions.toArray(new String[0]),1);return;}
        try{
            BluetoothAdapter adapter=((BluetoothManager)getSystemService(BLUETOOTH_SERVICE)).getAdapter();
            if(adapter==null){error("This phone has no Bluetooth adapter.");return;}
            if(!adapter.isEnabled()){waitingBluetooth=true;startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE),2);return;}
            if(adapter.getBluetoothLeAdvertiser()==null){error("This phone cannot advertise Bluetooth LE. Try another Android phone.");return;}
            startForegroundService(new Intent(this,MotionService.class).setAction(MotionService.START));startRequested=false;
        }catch(SecurityException e){error("Allow Nearby devices in app settings, then start Bluetooth.");}
        catch(RuntimeException e){error("Could not start Bluetooth. Keep this app visible and try again.");}
    }
    void error(String text){startRequested=false;status(text);}
    void recordVideo(){
        if(service==null||!service.running()||!service.connected())return;
        boolean old=service.haptics();service.setButtons(0);service.setHaptics(false);
        try{startActivity(new Intent(MediaStore.INTENT_ACTION_VIDEO_CAMERA));}
        catch(RuntimeException e){service.setHaptics(old);status("Open your camera manually. The Bluetooth service keeps running.");}
    }
    @Override protected void onStart(){super.onStart();bound=bindService(new Intent(this,MotionService.class),connection,BIND_AUTO_CREATE);}
    @Override protected void onStop(){if(service!=null)service.detach(listener);if(bound){unbindService(connection);bound=false;}service=null;super.onStop();}
    @Override protected void onResume(){super.onResume();resumed=true;if(web!=null)web.onResume();if(startRequested)ensureReady();}
    @Override protected void onPause(){resumed=false;if(service!=null)service.setButtons(0);if(web!=null)web.onPause();super.onPause();}
    @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("AndroidController");web.destroy();}super.onDestroy();}
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] results){super.onRequestPermissionsResult(code,names,results);if(code==1){requesting=false;if(bluetoothPermissions())ensureReady();else error("Nearby devices permission is needed for Bluetooth.");}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==2){waitingBluetooth=false;if(result==RESULT_OK)ensureReady();else error("Bluetooth is off. Enable it and start again.");}}
}
