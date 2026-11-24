import workshop.airslice.ble.FrameCodec;
import workshop.airslice.ble.ProfileTransfer;
import workshop.airslice.ble.BleControlQueue;
import java.nio.charset.StandardCharsets;
public class CodecGolden {
    public static void main(String[] args) {
        checkMotionScheduling();
        byte[] bytes=FrameCodec.encode(3,65535,0xfffffff0L,new float[]{0,0,1,1},123.45,65535);
        if(bytes.length!=20)throw new AssertionError("Frame exceeds default ATT payload");
        StringBuilder hex=new StringBuilder();for(byte value:bytes)hex.append(String.format("%02x",value&255));System.out.println(hex);
        byte[] center=FrameCodec.encodeCenter(65535,0xfffffff0L,new float[]{0,0,1,1});
        if(center.length!=15)throw new AssertionError("Center command exceeds default ATT payload");
        hex=new StringBuilder();for(byte value:center)hex.append(String.format("%02x",value&255));System.out.println(hex);
        byte[] buttons=FrameCodec.encodeButtons(24,65535,42);
        hex=new StringBuilder();for(byte value:buttons)hex.append(String.format("%02x",value&255));System.out.println(hex);
        if(args.length>0){
            ProfileTransfer transfer=new ProfileTransfer();ProfileTransfer.Result result=null;
            for(String packet:args){byte[] data=new byte[packet.length()/2];for(int i=0;i<data.length;i++)data[i]=(byte)Integer.parseInt(packet.substring(i*2,i*2+2),16);ProfileTransfer.Result received=transfer.accept(data);if(received!=null)result=received;}
            if(result==null)throw new AssertionError("Profile transfer did not complete");
            hex=new StringBuilder();for(byte value:result.json.getBytes(StandardCharsets.UTF_8))hex.append(String.format("%02x",value&255));System.out.println(hex);
            try{transfer.accept(new byte[]{0x40,1,0,(byte)255,(byte)255,0,0,0,0});throw new AssertionError("Oversized profile accepted");}catch(IllegalArgumentException expected){}
            try{transfer.accept(new byte[]{0x41,1,0,0,0,1});throw new AssertionError("Chunk accepted without a transfer");}catch(IllegalArgumentException expected){}
        }
        for(float[] bad:new float[][]{new float[]{0,0,0,0},new float[]{Float.NaN,0,0,1},new float[]{1,2}}){
            try{FrameCodec.encode(3,1,1,bad,0,1);throw new AssertionError("Invalid quaternion accepted");}catch(IllegalArgumentException expected){}
            try{FrameCodec.encodeCenter(1,1,bad);throw new AssertionError("Invalid center quaternion accepted");}catch(IllegalArgumentException expected){}
        }
        try{FrameCodec.encode(3,1,1,new float[]{0,0,0,1},Double.NaN,1);throw new AssertionError("Invalid speed accepted");}catch(IllegalArgumentException expected){}
    }
    static void checkMotionScheduling(){
        BleControlQueue queue=new BleControlQueue();
        byte[] press=FrameCodec.encodeButtons(16,1,2),release=FrameCodec.encodeButtons(0,2,2);
        queue.offer(press);queue.offer(release);queue.offer(new byte[]{1});
        if(queue.poll(true)!=press)throw new AssertionError("Button press lost");
        if(queue.poll(true)!=null)throw new AssertionError("Control queue starved a fresh motion frame");
        if(queue.poll(true)!=release)throw new AssertionError("Quick release lost or reordered");
        if(queue.poll(true)!=null)throw new AssertionError("Motion starved by a release");
        if(queue.poll(false)[0]!=1)throw new AssertionError("Start command lost");
        byte[] center=FrameCodec.encodeCenter(2,1000,new float[]{0,0,0,1}),ack=new byte[]{0x43,0,0,0,2,0};
        queue.offer(release);queue.offer(center);queue.offer(ack);
        if(queue.poll(true)!=center||queue.poll(true)!=ack)throw new AssertionError("Motion/heartbeat overtook calibration or profile readiness");
        if(queue.poll(true)!=null||queue.poll(true)!=release)throw new AssertionError("Motion/button fairness failed after calibration");
        for(int i=0;i<64;i++)if(!queue.offer(new byte[]{(byte)i}))throw new AssertionError("Bound rejected normal controls");
        if(queue.offer(new byte[]{0}))throw new AssertionError("Queue is unbounded");
        queue.clear();if(queue.poll(true)!=null)throw new AssertionError("Reconnect replayed an old command");
        queue.offer(press);if(!queue.hasButtons(16)||queue.hasButtons(0))throw new AssertionError("Heartbeat detection incorrect");
    }
}
