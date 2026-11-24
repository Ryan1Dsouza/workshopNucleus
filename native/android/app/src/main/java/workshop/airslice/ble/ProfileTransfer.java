package workshop.airslice.ble;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.util.zip.CRC32;

/** Ordered, bounded, checksummed configuration transfer using default ATT packets. */
public final class ProfileTransfer {
    public static final int LIMIT=4096;
    private byte[] buffer;
    private int transferId,position;
    private long checksum;
    public static final class Result {
        public final int id;
        public final String json;
        Result(int id,String json){this.id=id;this.json=json;}
    }
    public void reset(){buffer=null;position=0;}
    public Result accept(byte[] value){
        if(value==null||value.length<3||value.length>20)throw invalid();
        ByteBuffer b=ByteBuffer.wrap(value).order(ByteOrder.LITTLE_ENDIAN);
        int code=b.get()&255,id=b.getShort()&65535;
        if(code==0x40){
            if(value.length!=9)throw invalid();
            int length=b.getShort()&65535;
            if(length<2||length>LIMIT)throw invalid();
            checksum=b.getInt()&0xffffffffL;buffer=new byte[length];position=0;transferId=id;
            return null;
        }
        if(buffer==null||id!=transferId)throw invalid();
        if(code==0x41){
            if(value.length<6)throw invalid();
            int offset=b.getShort()&65535,length=value.length-5;
            if(offset!=position||position+length>buffer.length)throw invalid();
            b.get(buffer,position,length);position+=length;return null;
        }
        if(code!=0x42||value.length!=3||position!=buffer.length)throw invalid();
        CRC32 crc=new CRC32();crc.update(buffer);
        if(crc.getValue()!=checksum)throw invalid();
        try{
            String json=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(buffer)).toString();
            Result result=new Result(transferId,json);reset();return result;
        }catch(java.nio.charset.CharacterCodingException e){throw invalid();}
    }
    private IllegalArgumentException invalid(){reset();return new IllegalArgumentException("Invalid controller profile transfer");}
}
