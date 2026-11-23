import workshop.airslice.ble.FrameCodec;
public class CodecGolden {
    public static void main(String[] args) {
        byte[] bytes=FrameCodec.encode(3,65535,0xfffffff0L,new float[]{0,0,1,1},123.45,65535);
        if(bytes.length!=20)throw new AssertionError("Frame exceeds default ATT payload");
        StringBuilder hex=new StringBuilder();for(byte value:bytes)hex.append(String.format("%02x",value&255));System.out.println(hex);
        byte[] center=FrameCodec.encodeCenter(65535,0xfffffff0L,new float[]{0,0,1,1});
        if(center.length!=15)throw new AssertionError("Center command exceeds default ATT payload");
        hex=new StringBuilder();for(byte value:center)hex.append(String.format("%02x",value&255));System.out.println(hex);
        for(float[] bad:new float[][]{new float[]{0,0,0,0},new float[]{Float.NaN,0,0,1},new float[]{1,2}}){
            try{FrameCodec.encode(3,1,1,bad,0,1);throw new AssertionError("Invalid quaternion accepted");}catch(IllegalArgumentException expected){}
            try{FrameCodec.encodeCenter(1,1,bad);throw new AssertionError("Invalid center quaternion accepted");}catch(IllegalArgumentException expected){}
        }
        try{FrameCodec.encode(3,1,1,new float[]{0,0,0,1},Double.NaN,1);throw new AssertionError("Invalid speed accepted");}catch(IllegalArgumentException expected){}
    }
}
