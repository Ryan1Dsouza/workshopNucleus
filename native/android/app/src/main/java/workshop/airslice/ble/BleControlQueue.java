package workshop.airslice.ble;

import java.util.ArrayDeque;

/** Bounded control edges; a fresh motion frame gets a turn between controls. */
public final class BleControlQueue {
    private final ArrayDeque<byte[]> pending = new ArrayDeque<>();
    private boolean lastWasControl;
    public boolean offer(byte[] frame) {
        if(pending.size()>=64)return false;
        pending.addLast(frame);return true;
    }
    public byte[] poll(boolean motionDue) {
        // Calibration and profile readiness must precede new-epoch motion.
        // Button edges still keep their order and share turns with motion.
        var iterator=pending.iterator();
        while(iterator.hasNext()){
            byte[] frame=iterator.next();
            if(frame.length>0&&(frame[0]==2||(frame[0]&255)==0x43||(frame[0]&255)==0x44)){iterator.remove();lastWasControl=true;return frame;}
        }
        if(motionDue&&lastWasControl){lastWasControl=false;return null;}
        byte[] frame=pending.pollFirst();lastWasControl=frame!=null;return frame;
    }
    public boolean hasButtons(int mask) {
        for(byte[] frame:pending)if(frame.length==7&&frame[0]==4&&((frame[1]&255)|((frame[2]&255)<<8))==mask)return true;
        return false;
    }
    public void clear(){pending.clear();lastWasControl=false;}
}
