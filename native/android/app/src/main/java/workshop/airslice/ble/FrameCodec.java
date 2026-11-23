package workshop.airslice.ble;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
public final class FrameCodec {
    private FrameCodec() {}
    public static byte[] encode(int flags, int sequence, long captureMillis, float[] q, double speedDegrees, int epoch) {
        if(q==null||q.length!=4||!Double.isFinite(speedDegrees))throw new IllegalArgumentException("Invalid sensor data");
        ByteBuffer b=ByteBuffer.allocate(20).order(ByteOrder.LITTLE_ENDIAN);
        b.put((byte)1).put((byte)flags).putShort((short)sequence).putInt((int)captureMillis);
        putQuaternion(b,q);
        b.putShort((short)Math.round(Math.max(0,Math.min(655.35,speedDegrees))*100)).putShort((short)epoch);
        return b.array();
    }
    public static byte[] encodeCenter(int epoch,long captureMillis,float[] q){
        ByteBuffer b=ByteBuffer.allocate(15).order(ByteOrder.LITTLE_ENDIAN);
        b.put((byte)2).putShort((short)epoch).putInt((int)captureMillis);
        putQuaternion(b,q);
        return b.array();
    }
    private static void putQuaternion(ByteBuffer b,float[] q){
        if(q==null||q.length!=4)throw new IllegalArgumentException("Invalid quaternion");
        double norm=Math.sqrt((double)q[0]*q[0]+(double)q[1]*q[1]+(double)q[2]*q[2]+(double)q[3]*q[3]);
        if(!Double.isFinite(norm)||norm<0.1)throw new IllegalArgumentException("Invalid quaternion");
        for(int i=0;i<4;i++)b.putShort((short)Math.round(Math.max(-1,Math.min(1,q[i]/norm))*32767));
    }
}
