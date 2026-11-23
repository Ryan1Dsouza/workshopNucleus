package workshop.airslice.ble;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.*;
import android.os.*;
import android.provider.MediaStore;
import android.view.*;
import android.widget.*;
import java.util.*;

// The activity is just UI. The started service owns all Bluetooth and sensors.
public class MainActivity extends Activity {
    MotionService service;
    boolean bound=false,resumed=false,startRequested=false,requesting=false,waitingBluetooth=false,supported=true;
    TextView state,metrics,notificationHint;Button start,center,play,record;Switch haptics;
    final MotionService.Listener listener=this::render;
    final ServiceConnection connection=new ServiceConnection(){
        @Override public void onServiceConnected(ComponentName name,IBinder binder){service=((MotionService.LocalBinder)binder).service();service.attach(listener);}
        @Override public void onServiceDisconnected(ComponentName name){service=null;state.setText("Controller service stopped. Reopen the app and Start Bluetooth.");buttons(false,false);}
    };
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        SensorManager sensors=(SensorManager)getSystemService(SENSOR_SERVICE);
        supported=sensors.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)!=null&&sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE)!=null;
        LinearLayout column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setBackgroundColor(Color.rgb(23,25,22));
        column.setOnApplyWindowInsetsListener((v,insets)->{int padding=(int)(24*getResources().getDisplayMetrics().density);v.setPadding(padding,padding+insets.getSystemWindowInsetTop(),padding,padding+insets.getSystemWindowInsetBottom());return insets;});
        column.addView(text("AIR / SLICE\nBluetooth blade",30,Color.rgb(245,182,66)));
        column.addView(text("1. Start Bluetooth and pair from the laptop.\n2. Hold the phone horizontally and Center blade.\n3. Record video or switch apps: motion keeps running.\nUse the notification to center, start or stop.",16,Color.LTGRAY));
        state=text("Tap Start Bluetooth. Then pair from the laptop game.",18,Color.WHITE);column.addView(state);
        start=button("Start Bluetooth",column,()->{
            if(service!=null&&service.running()){startRequested=false;startService(new Intent(this,MotionService.class).setAction(MotionService.STOP));}
            else{startRequested=true;ensureReady();}
        });
        center=button("Center blade",column,()->{if(service!=null)service.centerBlade();});
        play=button("Start / restart game",column,()->{if(service!=null)service.playGame();});
        record=button("Record video · keep controller running",column,this::recordVideo);
        haptics=new Switch(this);haptics.setText("Vibration feedback");haptics.setTextColor(Color.LTGRAY);haptics.setChecked(true);column.addView(haptics);
        haptics.setOnCheckedChangeListener((view,checked)->{if(service!=null&&checked!=service.haptics())service.setHaptics(checked);});
        column.addView(text("Record video opens your camera app and disables vibration so hits do not shake the footage. Stop Bluetooth when finished.",13,Color.LTGRAY));
        notificationHint=text("",13,Color.rgb(245,182,66));column.addView(notificationHint);
        metrics=text("Native sensors → Bluetooth LE → laptop",13,Color.LTGRAY);column.addView(metrics);
        ScrollView scroll=new ScrollView(this);scroll.addView(column);setContentView(scroll);
        buttons(false,false);
        if(!supported)state.setText("This phone needs a gyroscope and a game rotation-vector sensor.");
    }
    TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setPadding(0,16,0,16);return v;}
    Button button(String label,LinearLayout parent,Runnable action){Button b=new Button(this);b.setText(label);b.setOnClickListener(v->action.run());parent.addView(b);return b;}
    void buttons(boolean running,boolean connected){start.setEnabled(supported&&service!=null);start.setText(running?"Stop Bluetooth":"Start Bluetooth");center.setEnabled(connected);play.setEnabled(connected);record.setEnabled(connected);haptics.setEnabled(running);}
    void render(MotionService value){state.setText(supported?value.status():"This phone needs a gyroscope and a game rotation-vector sensor.");metrics.setText(value.metrics());buttons(value.running(),value.connected());haptics.setChecked(value.haptics());}
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
        }catch(SecurityException e){error("Allow Nearby devices in app settings, then Start Bluetooth.");}
        catch(RuntimeException e){error("Could not start background control. Keep this app visible and try again.");}
    }
    void error(String message){startRequested=false;state.setText(message);}
    void recordVideo(){
        if(service==null||!service.running()||!service.connected())return;
        boolean old=service.haptics();service.setHaptics(false);
        try{startActivity(new Intent(MediaStore.INTENT_ACTION_VIDEO_CAMERA));}
        catch(RuntimeException e){service.setHaptics(old);state.setText("Could not open video mode. Open your camera manually; Bluetooth keeps running.");}
    }
    @Override protected void onStart(){super.onStart();bound=bindService(new Intent(this,MotionService.class),connection,BIND_AUTO_CREATE);if(!bound)state.setText("Could not connect to the controller service. Reopen the app.");}
    @Override protected void onStop(){if(service!=null)service.detach(listener);if(bound){unbindService(connection);bound=false;}service=null;super.onStop();}
    @Override protected void onResume(){super.onResume();resumed=true;
        notificationHint.setText(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED?"Allow notifications in app settings for background Center / Stop controls. Motion can still run without the notification drawer shortcut.":"");
        if(startRequested)ensureReady();
    }
    @Override protected void onPause(){resumed=false;super.onPause();}
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] results){super.onRequestPermissionsResult(code,names,results);if(code==1){requesting=false;if(bluetoothPermissions())ensureReady();else error("Nearby devices permission is needed. Allow it in app settings, then Start Bluetooth.");}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==2){waitingBluetooth=false;if(result==RESULT_OK)ensureReady();else error("Bluetooth is off. Enable it and start again.");}}
}
