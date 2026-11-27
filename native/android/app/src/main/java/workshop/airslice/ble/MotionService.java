package workshop.airslice.ble;

import android.Manifest;
import android.app.*;
import android.content.pm.ServiceInfo;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.hardware.display.DisplayManager;
import android.graphics.Point;
import android.view.Display;
import android.os.*;
import java.nio.*;
import java.util.*;
import org.json.*;

// User-started foreground service: BLE and sensors outlive the camera/activity.
public class MotionService extends Service implements SensorEventListener {
    static final UUID SERVICE=UUID.fromString("4d1a0001-9cf1-4ee3-a71b-9438ef5d3400");
    static final UUID MOTION=UUID.fromString("4d1a0002-9cf1-4ee3-a71b-9438ef5d3400");
    static final UUID CONTROL=UUID.fromString("4d1a0003-9cf1-4ee3-a71b-9438ef5d3400");
    static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    final Handler handler=new Handler(Looper.getMainLooper());
    final float[] q={0,0,0,1}, androidQ=new float[4];
    final Point displaySize=new Point();
    DisplayManager displays;
    int lastWheelRotation=-1;
    boolean inFlightMotion, inFlightRotation;
    boolean wheelProfile=false;
    final DisplayManager.DisplayListener displayListener=new DisplayManager.DisplayListener(){
        public void onDisplayAdded(int id){}
        public void onDisplayRemoved(int id){}
        public void onDisplayChanged(int id){if(id==Display.DEFAULT_DISPLAY)sendWheelRotation();}
    };
    void sendWheelRotation(){
        if(!wheelProfile||profile==null||!controlEnabled||central==null)return;
        Display display=displays.getDisplay(Display.DEFAULT_DISPLAY);
        if(display==null)return;
        display.getRealSize(displaySize);
        int rotation=display.getRotation();
        if(displaySize.x<=displaySize.y || lastWheelRotation==rotation)return;
        lastWheelRotation=rotation;
        enqueue(new byte[]{0x44,(byte)rotation,(byte)profileEpoch,(byte)(profileEpoch>>8)});
    }
    final BleControlQueue controls=new BleControlQueue();
    final ProfileTransfer profileTransfer=new ProfileTransfer();
    JSONObject profile;int buttonMask=0,buttonSequence=0,profileEpoch=0;long buttonsSentAt=0;
    boolean gyroWanted=true;
    SensorManager sensors;Sensor rotation,gyro;
    BluetoothAdapter adapter;BluetoothLeAdvertiser advertiser;BluetoothGattServer gatt;
    BluetoothGattCharacteristic motion,control;BluetoothDevice central;
    String metricText="Native sensors → Bluetooth LE → laptop";
    Listener listener; boolean foreground=false,hapticsEnabled=true;
    PowerManager.WakeLock cpuLock; long lockRenewedAt=0;
    boolean wanted=false,sensing=false,advertising=false,motionEnabled=false,controlEnabled=false,controlIndications=false,busy=false,stoppedFrame=false,noName=false;
    long poseAt=0,gyroAt=0,lastSentPose=0,lastMotionAt=0,inFlightAt=0,mark=0,sensorsStartedAt=0;int epoch=1,sequence=0,poseCount=0,gyroCount=0,sentCount=0,drops=0;
    double speed=0;byte[] controlValue={0};String message="Tap Start Bluetooth. Then pair from the laptop game.";

    public static final String START="workshop.airslice.START",STOP="workshop.airslice.STOP",CENTER="workshop.airslice.CENTER",PLAY="workshop.airslice.PLAY";
    static final String CHANNEL="motion-controller";static final int NOTIFICATION=1;
    public interface Listener {void onState(MotionService service);}
    public final class LocalBinder extends Binder {public MotionService service(){return MotionService.this;}}
    final LocalBinder binder=new LocalBinder();boolean receiverRegistered=false;
    @Override public IBinder onBind(Intent intent){return binder;}
    public void attach(Listener value){listener=value;refresh();}
    public void detach(Listener value){if(listener==value)listener=null;}
    public boolean running(){return wanted;}
    public boolean connected(){return central!=null;}
    public String status(){return message;}
    public String metrics(){return metricText;}
    public boolean haptics(){return hapticsEnabled;}
    public boolean sensing(){return sensing;}
    public boolean motionAvailable(){return rotation!=null&&gyro!=null;}
    public JSONObject profile(){return profile;}
    public void setButtons(int mask){if((mask&~2047)!=0)return;buttonMask=central==null?0:mask;sendButtons();}
    void sendButtons(){if(central!=null){buttonsSentAt=SystemClock.elapsedRealtime();enqueue(FrameCodec.encodeButtons(buttonMask,buttonSequence++,profileEpoch));}}
    public void setMotion(boolean enabled){gyroWanted=enabled;if(wanted&&enabled)startSensors();else stopSensors();refresh();}
    public void setHaptics(boolean value){hapticsEnabled=value;refresh();}
    public void centerBlade(){
        if(!wanted)return;
        if(central==null){message="Connect this phone from the laptop first.";refresh();return;}
        epoch=(epoch+1)&65535;
        boolean fresh=SensorClock.fresh(poseAt,SystemClock.elapsedRealtimeNanos(),150000000L);
        enqueue(fresh?FrameCodec.encodeCenter(epoch,poseAt/1000000L,q):new byte[]{2,(byte)epoch,(byte)(epoch>>8)});
        message=fresh?"Centered in your current grip.":"Waiting for a motion reading to center.";
        refresh();
    }
    public void playGame(){if(central!=null)enqueue(new byte[]{1});else{message="Connect this phone from the laptop first.";refresh();}}
    @Override public void onCreate(){
        super.onCreate();
        displays=(DisplayManager)getSystemService(DISPLAY_SERVICE);
        displays.registerDisplayListener(displayListener,handler);
        sensors=(SensorManager)getSystemService(SENSOR_SERVICE);
        rotation=sensors.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);gyro=sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Bluetooth motion controller",NotificationManager.IMPORTANCE_LOW));
        cpuLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"AirSlice:BluetoothMotion");cpuLock.setReferenceCounted(false);
        IntentFilter filter=new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(bluetoothState,filter,Context.RECEIVER_EXPORTED);else registerReceiver(bluetoothState,filter);
        receiverRegistered=true;
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){
        String action=intent==null?null:intent.getAction();
        if(STOP.equals(action)){message="Bluetooth stopped. Tap Start Bluetooth to pair again.";shutdown();stopSelf();}
        else if(CENTER.equals(action)){centerBlade();if(!wanted)stopSelf();}
        else if(PLAY.equals(action)){playGame();if(!wanted)stopSelf();}
        else if(START.equals(action)&&!wanted){
            if(!permissions()){permissionLost();return START_NOT_STICKY;}
            wanted=true;message="Starting background Bluetooth controller…";
            try{
                if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                else startForeground(NOTIFICATION,notification());
                foreground=true;ensureReady();
                if(wanted){poseCount=gyroCount=sentCount=drops=0;mark=SystemClock.elapsedRealtime();handler.post(tick);}
            }catch(RuntimeException e){fail("Could not start background control. Open the app and Start Bluetooth again. "+e.getMessage());}
        }else if(!wanted)stopSelf();
        return START_NOT_STICKY;
    }
    PendingIntent command(String action,int code){return PendingIntent.getService(this,code,new Intent(this,MotionService.class).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    Notification notification(){
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.notification_blade)
            .setContentTitle(central!=null?"ControllerKit · connected":"ControllerKit · ready to pair")
            .setContentText(message.split("\n")[0]).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(new Notification.Action.Builder(null,"Center motion",command(CENTER,1)).build())
            .addAction(new Notification.Action.Builder(null,"Start game",command(PLAY,2)).build())
            .addAction(new Notification.Action.Builder(null,"Stop",command(STOP,3)).build());
        if(Build.VERSION.SDK_INT>=31)builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return builder.build();
    }
    void refresh(){
        if(listener!=null)listener.onState(this);
        if(foreground&&(Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)){
            try{((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION,notification());}catch(SecurityException ignored){}
        }
    }
    void keepAwake(){if(cpuLock!=null){cpuLock.acquire(10*60*1000L);lockRenewedAt=SystemClock.elapsedRealtime();}}
    void releaseCpu(){if(cpuLock!=null&&cpuLock.isHeld())cpuLock.release();}
    final BroadcastReceiver bluetoothState=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){
        int state=intent.getIntExtra(BluetoothAdapter.EXTRA_STATE,-1);
        if(wanted&&(state==BluetoothAdapter.STATE_OFF||state==BluetoothAdapter.STATE_TURNING_OFF))fail("Bluetooth turned off. Open Air Slice and start again.");
    }};
    boolean permissions(){return Build.VERSION.SDK_INT<31 || checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;}
    void ensureReady(){
        if(!wanted)return;
        if(!permissions()){permissionLost();return;}
        try {
        BluetoothManager manager=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);adapter=manager.getAdapter();
        if(adapter==null){fail("This phone has no Bluetooth adapter.");return;}
        if(!adapter.isEnabled()){fail("Bluetooth is off. Open Air Slice, enable Bluetooth, and start again.");return;}
        advertiser=adapter.getBluetoothLeAdvertiser();
        if(advertiser==null){fail("This phone cannot advertise a Bluetooth LE service. Try another Android phone.");return;}
        if(gatt==null){
            gatt=manager.openGattServer(this,callbacks);if(gatt==null){fail("Could not open the Bluetooth service. Toggle Bluetooth and try again.");return;}
            BluetoothGattService service=new BluetoothGattService(SERVICE,BluetoothGattService.SERVICE_TYPE_PRIMARY);
            motion=new BluetoothGattCharacteristic(MOTION,BluetoothGattCharacteristic.PROPERTY_NOTIFY,BluetoothGattCharacteristic.PERMISSION_READ);
            // Prefer the original notification path. Also support indication
            // subscriptions cached by clients of the previous APK.
            control=new BluetoothGattCharacteristic(CONTROL,BluetoothGattCharacteristic.PROPERTY_WRITE|BluetoothGattCharacteristic.PROPERTY_NOTIFY|BluetoothGattCharacteristic.PROPERTY_INDICATE|BluetoothGattCharacteristic.PROPERTY_READ,BluetoothGattCharacteristic.PERMISSION_READ|BluetoothGattCharacteristic.PERMISSION_WRITE);
            for(BluetoothGattCharacteristic c:new BluetoothGattCharacteristic[]{motion,control}){
                c.addDescriptor(new BluetoothGattDescriptor(CCCD,BluetoothGattDescriptor.PERMISSION_READ|BluetoothGattDescriptor.PERMISSION_WRITE));service.addCharacteristic(c);
            }
            if(!gatt.addService(service)){fail("Could not add the Bluetooth service.");return;}
        }else if(central==null)advertise();
        if(gyroWanted)startSensors();
        } catch(SecurityException e){permissionLost();}
    }
    void permissionLost(){fail("Bluetooth permission is unavailable. Allow Nearby devices in app settings and start again.");}
    String phoneName(){try{return adapter.getName();}catch(SecurityException e){return "Android phone";}}
    void stopAdvertising(){try{if(advertiser!=null)advertiser.stopAdvertising(advertiseCallback);}catch(SecurityException ignored){}advertising=false;}
    void cancel(BluetoothDevice device){try{if(gatt!=null)gatt.cancelConnection(device);}catch(SecurityException e){permissionLost();}}
    void respond(BluetoothDevice device,int id,int status,int offset,byte[] bytes){try{if(gatt!=null)gatt.sendResponse(device,id,status,offset,bytes);}catch(SecurityException e){permissionLost();}}
    void startSensors(){if(!gyroWanted||sensing||rotation==null||gyro==null)return;epoch=(epoch+1)&65535;poseAt=gyroAt=lastSentPose=0;sensing=true;stoppedFrame=false;
        sensorsStartedAt=SystemClock.elapsedRealtimeNanos();
        boolean poseRegistered=sensors.registerListener(this,rotation,10000),gyroRegistered=sensors.registerListener(this,gyro,10000);
        if(!poseRegistered||!gyroRegistered)fail("Could not start the motion sensors. Restart the app or try another phone.");}
    void stopSensors(){if(sensing){sensors.unregisterListener(this);sensing=false;enqueue(new byte[]{3});}poseAt=gyroAt=0;speed=0;}
    void advertise(){
        if(!wanted||advertiser==null||advertising||central!=null)return;
        AdvertiseSettings settings=new AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY).setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).setConnectable(true).build();
        AdvertiseData data=new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(SERVICE)).build();
        AdvertiseData scan=new AdvertiseData.Builder().setIncludeDeviceName(!noName).build();
        advertising=true;
        try{advertiser.startAdvertising(settings,data,scan,advertiseCallback);}catch(SecurityException e){advertising=false;permissionLost();}catch(RuntimeException e){advertising=false;fail("Bluetooth advertising failed: "+e.getMessage());}
    }
    final AdvertiseCallback advertiseCallback=new AdvertiseCallback(){
        @Override public void onStartSuccess(AdvertiseSettings s){handler.post(()->{if(!wanted)return;message="Bluetooth ready. Select this phone on the laptop: "+phoneName()+".\nWi-Fi is not used for motion.";refresh();});}
        @Override public void onStartFailure(int code){handler.post(()->{advertising=false;if(code==ADVERTISE_FAILED_DATA_TOO_LARGE&&!noName){noName=true;advertise();}else fail("Bluetooth advertising failed ("+code+"). Toggle Bluetooth and try again.");});}
    };
    boolean same(BluetoothDevice d){return central!=null&&central.equals(d);}
    void enqueue(byte[] bytes){if(!controls.offer(bytes)){controls.clear();buttonMask=0;controls.offer(FrameCodec.encodeButtons(0,buttonSequence++,profileEpoch));}flush();}
    void applyProfile(ProfileTransfer.Result transferred)throws JSONException{
        JSONObject next=new JSONObject(transferred.json);
        if(!next.getString("id").matches("[a-z][a-z0-9-]{0,31}")||next.getString("title").trim().isEmpty()||next.getString("title").length()>48)throw new IllegalArgumentException("Invalid profile");
        String orientation=next.getString("orientation"),mode=next.getString("motion");
        if(!orientation.equals("portrait")&&!orientation.equals("landscape")||!mode.equals("none")&&!mode.equals("aim")&&!mode.equals("steer"))throw new IllegalArgumentException("Invalid profile mode");
        int assigned=next.getInt("player"),revision=next.getInt("profileEpoch");
        if(assigned<1||assigned>2||revision<0||revision>65535)throw new IllegalArgumentException("Invalid player profile");
        JSONArray buttons=next.getJSONArray("controls");if(buttons.length()>11)throw new IllegalArgumentException("Too many controls");
        HashSet<String> ids=new HashSet<>();List<String> supported=Arrays.asList("up","right","down","left","a","b","one","two","plus","minus","home");
        for(int index=0;index<buttons.length();index++){
            JSONObject button=buttons.getJSONObject(index);String id=button.getString("id"),label=button.getString("label"),action=button.getString("action");
            if(!supported.contains(id)||!ids.add(id)||label.trim().isEmpty()||label.length()>20||!action.matches("[a-z][a-z0-9.-]{0,39}"))throw new IllegalArgumentException("Invalid control");
        }
        profile=next;profileEpoch=revision;buttonMask=0;
        wheelProfile=mode.equals("steer")&&orientation.equals("landscape");lastWheelRotation=-1;handler.removeCallbacks(retryRotation);
        byte[] ack=ByteBuffer.allocate(6).order(ByteOrder.LITTLE_ENDIAN).put((byte)0x43).putShort((short)transferred.id).put((byte)0).putShort((short)revision).array();
        setMotion(!mode.equals("none"));
        // If already in landscape, the captured grip belongs to this display.
        // A later portrait-to-landscape rotation establishes a level horizon.
        sendWheelRotation();
        if(gyroWanted)centerBlade();
        enqueue(ack);sendButtons();
        message="Player "+assigned+" · "+next.getString("title")+". Controls are ready.";refresh();
    }
    void flush(){
        if(busy||central==null||gatt==null)return;
        long now=SystemClock.elapsedRealtimeNanos();
        boolean active=sensing && SensorClock.fresh(poseAt,now,100000000L);
        boolean expired=!sensing || !SensorClock.fresh(poseAt,now,wheelProfile?450000000L:150000000L);
        boolean motionDue=motionEnabled && (active ? poseAt!=lastSentPose && now-lastMotionAt>=16000000L : expired && !stoppedFrame);
        byte[] queued=controlEnabled?controls.poll(motionDue):null;
        if(queued!=null){notify(control,queued);return;}
        if(!motionDue)return;
        int flags=active?1:0;
        boolean fresh=active && SensorClock.fresh(gyroAt,now,80000000L) && Math.abs(gyroAt-poseAt)<80000000L;
        if(fresh)flags|=2;
        byte[] bytes=FrameCodec.encode(flags,sequence++,(active?poseAt:now)/1000000L,q,fresh?speed:0,epoch);
        if(notify(motion,bytes)){lastSentPose=poseAt;lastMotionAt=now;stoppedFrame=!active;}
    }
    boolean notify(BluetoothGattCharacteristic characteristic,byte[] bytes){
        if(gatt==null||central==null)return false;
        busy=true;inFlightAt=SystemClock.elapsedRealtime();boolean ok;
        inFlightMotion=characteristic==motion;
        inFlightRotation=characteristic==control && bytes[0]==0x44;
        boolean confirm=characteristic==control&&controlIndications;
        try {if(Build.VERSION.SDK_INT>=33)ok=gatt.notifyCharacteristicChanged(central,characteristic,confirm,bytes)==BluetoothStatusCodes.SUCCESS;
        else{characteristic.setValue(bytes);ok=gatt.notifyCharacteristicChanged(central,characteristic,confirm);}}
        catch(SecurityException e){ok=false;permissionLost();}
        catch(RuntimeException e){ok=false;message="Bluetooth send failed. Stop Bluetooth and start again.";refresh();}
        if(!ok){busy=false;drops++;if(inFlightRotation)retryWheelRotation();}
        else if(characteristic==motion)sentCount++;
        return ok;
    }
    void retryWheelRotation(){
        lastWheelRotation=-1;
        handler.removeCallbacks(retryRotation);
        handler.postDelayed(retryRotation,100);
    }
    final Runnable retryRotation=this::sendWheelRotation;
    final BluetoothGattServerCallback callbacks=new BluetoothGattServerCallback(){
        @Override public void onServiceAdded(int status,BluetoothGattService service){handler.post(()->{if(gatt==null||service.getCharacteristic(MOTION)!=motion)return;if(status==BluetoothGatt.GATT_SUCCESS)advertise();else fail("Bluetooth service setup failed ("+status+").");});}
        @Override public void onConnectionStateChange(BluetoothDevice d,int status,int state){handler.post(()->{
            if(gatt==null)return;
            if(state==BluetoothProfile.STATE_CONNECTED){if(central!=null&&!same(d)){cancel(d);return;}central=d;busy=false;controls.clear();profileTransfer.reset();profile=null;buttonMask=0;buttonSequence=0;profileEpoch=0;motionEnabled=controlEnabled=false;lastSentPose=0;stoppedFrame=false;
                controlIndications=false;stopAdvertising();keepAwake();
                message="Laptop connected. Waiting for motion subscription…";refresh();
            }else if(same(d)){central=null;releaseCpu();busy=false;controls.clear();profileTransfer.reset();profile=null;buttonMask=0;motionEnabled=controlEnabled=false;message="Laptop disconnected. Reconnect from the host.";refresh();advertise();}
        });}
        @Override public void onDescriptorReadRequest(BluetoothDevice d,int id,int offset,BluetoothGattDescriptor descriptor){handler.post(()->{boolean enabled=descriptor.getCharacteristic()==motion?motionEnabled:controlEnabled;respond(d,id,offset==0?BluetoothGatt.GATT_SUCCESS:BluetoothGatt.GATT_INVALID_OFFSET,offset,enabled?(descriptor.getCharacteristic()==motion||!controlIndications?BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE:BluetoothGattDescriptor.ENABLE_INDICATION_VALUE):BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);});}
        @Override public void onDescriptorWriteRequest(BluetoothDevice d,int id,BluetoothGattDescriptor descriptor,boolean prepared,boolean response,int offset,byte[] value){handler.post(()->{
            if(gatt==null)return;int result=BluetoothGatt.GATT_SUCCESS;
            if(!same(d)||prepared||offset!=0||!CCCD.equals(descriptor.getUuid()))result=BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED;
            else if(!Arrays.equals(value,BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)&&!(descriptor.getCharacteristic()==control&&Arrays.equals(value,BluetoothGattDescriptor.ENABLE_INDICATION_VALUE))&&!Arrays.equals(value,BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE))result=BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH;
            else {boolean enabled=!Arrays.equals(value,BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);if(descriptor.getCharacteristic()==motion)motionEnabled=enabled;else {controlEnabled=enabled;controlIndications=enabled&&Arrays.equals(value,BluetoothGattDescriptor.ENABLE_INDICATION_VALUE);}}
            if(response)respond(d,id,result,0,null);
            if(result==BluetoothGatt.GATT_SUCCESS){message=controlEnabled?"Connected. The laptop chooses your controls.":"Laptop connected.";refresh();flush();}
        });}
        @Override public void onCharacteristicReadRequest(BluetoothDevice d,int id,int offset,BluetoothGattCharacteristic c){handler.post(()->{respond(d,id,offset==0?BluetoothGatt.GATT_SUCCESS:BluetoothGatt.GATT_INVALID_OFFSET,offset,controlValue);});}
        @Override public void onCharacteristicWriteRequest(BluetoothDevice d,int id,BluetoothGattCharacteristic c,boolean prepared,boolean response,int offset,byte[] value){handler.post(()->{
            if(gatt==null)return;int result=BluetoothGatt.GATT_SUCCESS;
            if(!same(d)||prepared||offset!=0||c!=control||value.length<1)result=BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED;
            else if(value[0]==0x10&&value.length==5){controlValue=value.clone();controlValue[0]=(byte)0x90;enqueue(controlValue);}
            else if(value.length==1&&value[0]>=0x11&&value[0]<=0x13){Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(hapticsEnabled&&v!=null&&v.hasVibrator())v.vibrate(VibrationEffect.createOneShot(value[0]==0x12?45:12,VibrationEffect.DEFAULT_AMPLITUDE));}
            else if((value[0]&255)>=0x40&&(value[0]&255)<=0x42){
                try{ProfileTransfer.Result transferred=profileTransfer.accept(value);if(transferred!=null)applyProfile(transferred);}
                catch(IllegalArgumentException|JSONException e){result=BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED;message="Controller profile could not be applied.";refresh();}
            }
            else result=BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED;
            if(response)respond(d,id,result,0,null);
        });}
        @Override public void onNotificationSent(BluetoothDevice d,int status){handler.post(()->{if(!same(d))return;busy=false;
            if(status!=BluetoothGatt.GATT_SUCCESS){
                drops++;
                if(inFlightMotion){lastSentPose=0;stoppedFrame=false;}
                if(inFlightRotation)retryWheelRotation();
            }
            flush();});}
    };
    final Runnable tick=new Runnable(){public void run(){
        long now=SystemClock.elapsedRealtime();
        // A short scheduling/indication delay must not cause a reconnect loop.
        if(busy&&central!=null&&gatt!=null&&now-inFlightAt>5000){inFlightAt=now;cancel(central);}
        if(wanted){if(central!=null&&buttonMask!=0&&now-buttonsSentAt>=400&&!controls.hasButtons(buttonMask))sendButtons();flush();if(central!=null&&now-lockRenewedAt>9*60*1000L)keepAwake();}
        if(now-mark>=1000){metricText=getString(R.string.metrics,Math.round(poseCount*1000.0/(now-mark)),Math.round(gyroCount*1000.0/(now-mark)),Math.round(sentCount*1000.0/(now-mark)),drops);poseCount=gyroCount=sentCount=0;mark=now;refresh();}
        if(wanted)handler.postDelayed(this,16);
    }};
    @Override public void onSensorChanged(SensorEvent e){
        if(!sensing||e.values.length<3)return;
        boolean attitude=e.sensor.getType()==Sensor.TYPE_GAME_ROTATION_VECTOR;
        long capture=SensorClock.capture(e.timestamp,SystemClock.elapsedRealtimeNanos(),sensorsStartedAt,attitude?poseAt:gyroAt);
        if(capture==0)return;
        if(attitude){
            SensorManager.getQuaternionFromVector(androidQ,e.values);
            float norm=0;
            for(float v:androidQ)norm+=v*v;
            if(!(norm>=.81f && norm<=1.21f))return;
            q[0]=androidQ[1];q[1]=androidQ[2];q[2]=androidQ[3];q[3]=androidQ[0];
            poseAt=capture;poseCount++;flush();
        }
        else if(e.sensor.getType()==Sensor.TYPE_GYROSCOPE){double measured=Math.sqrt(e.values[0]*e.values[0]+e.values[1]*e.values[1]+e.values[2]*e.values[2])*180/Math.PI;if(!Double.isFinite(measured))return;speed=measured;gyroAt=capture;gyroCount++;}
    }
    @Override public void onAccuracyChanged(Sensor s,int accuracy){}
    void fail(String value){message=value;shutdown();stopSelf();refresh();}
    void shutdown(){wanted=false;handler.removeCallbacks(tick);stopSensors();if(advertising)stopAdvertising();if(gatt!=null){try{gatt.close();}catch(SecurityException ignored){}gatt=null;}central=null;motionEnabled=controlEnabled=busy=false;controls.clear();releaseCpu();if(foreground){stopForeground(STOP_FOREGROUND_REMOVE);foreground=false;}refresh();}
    @Override public void onDestroy(){displays.unregisterDisplayListener(displayListener);shutdown();if(receiverRegistered)unregisterReceiver(bluetoothState);handler.removeCallbacksAndMessages(null);listener=null;super.onDestroy();}
}
