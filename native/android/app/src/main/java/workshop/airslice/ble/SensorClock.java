package workshop.airslice.ble;

/** SensorEvent and elapsedRealtimeNanos use Android's boot-time clock. */
public final class SensorClock {
    private SensorClock() {}
    public static boolean fresh(long timestamp, long now, long maxAge) {
        return timestamp > 0 && timestamp <= now && now - timestamp <= maxAge;
    }
    public static long capture(long timestamp, long now, long started, long previous) {
        // Allow up to 2 ms of vendor clock skew without dating a pose in the future.
        if (timestamp < started || timestamp - now > 2_000_000L) return 0;
        long captured = Math.min(timestamp, now);
        return captured > previous && fresh(captured, now, 100_000_000L) ? captured : 0;
    }
}
