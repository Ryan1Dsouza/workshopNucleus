import Foundation

enum FrameCodec {
    static func append16(_ value: UInt16, to data: inout Data) {
        data.append(UInt8(truncatingIfNeeded: value)); data.append(UInt8(truncatingIfNeeded: value >> 8))
    }
    static func append32(_ value: UInt32, to data: inout Data) {
        for shift in stride(from: 0, to: 32, by: 8) { data.append(UInt8(truncatingIfNeeded: value >> shift)) }
    }
    static func quaternion(_ values: [Double], to data: inout Data) -> Bool {
        guard values.count == 4, values.allSatisfy({ $0.isFinite }) else { return false }
        let norm = sqrt(values.reduce(0) { $0 + $1 * $1 }); guard norm > 0.1 else { return false }
        for value in values {
            let scaled = floor(max(-1, min(1, value / norm)) * 32767 + 0.5)
            append16(UInt16(bitPattern: Int16(scaled)), to: &data)
        }
        return true
    }
    static func motion(flags: UInt8, sequence: UInt16, milliseconds: UInt32, quaternion values: [Double], speed: Double, epoch: UInt16) -> Data? {
        guard speed.isFinite else { return nil }
        var data = Data([1, flags]); append16(sequence, to: &data); append32(milliseconds, to: &data)
        guard quaternion(values, to: &data) else { return nil }
        append16(UInt16(floor(max(0, min(655.35, speed)) * 100 + 0.5)), to: &data); append16(epoch, to: &data)
        return data
    }
    static func center(epoch: UInt16, milliseconds: UInt32, quaternion values: [Double]) -> Data? {
        var data = Data([2]); append16(epoch, to: &data); append32(milliseconds, to: &data)
        return quaternion(values, to: &data) ? data : nil
    }
    static func buttons(mask: UInt16, sequence: UInt16, profileEpoch: UInt16) -> Data {
        var data = Data([4]); append16(mask & 2047, to: &data); append16(sequence, to: &data); append16(profileEpoch, to: &data); return data
    }
    static func crc32(_ bytes: Data) -> UInt32 {
        var crc: UInt32 = 0xffffffff
        for byte in bytes { crc ^= UInt32(byte); for _ in 0..<8 { crc = (crc >> 1) ^ ((crc & 1) == 1 ? 0xedb88320 : 0) } }
        return crc ^ 0xffffffff
    }
}

final class ProfileTransfer {
    struct Result { let id: UInt16; let bytes: Data }
    private var expected = 0, buffer = Data(), id: UInt16 = 0, checksum: UInt32 = 0
    func reset() { expected = 0; buffer.removeAll() }
    private func invalid() -> Error { reset(); return NSError(domain: "ControllerKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid controller profile transfer"]) }
    private func read16(_ data: Data, _ offset: Int) -> UInt16 { UInt16(data[offset]) | UInt16(data[offset+1]) << 8 }
    private func read32(_ data: Data, _ offset: Int) -> UInt32 { (0..<4).reduce(0) { $0 | UInt32(data[offset+$1]) << ($1*8) } }
    func accept(_ data: Data) throws -> Result? {
        guard data.count >= 3, data.count <= 20 else { throw invalid() }
        let transferId = read16(data, 1)
        if data[0] == 0x40 {
            guard data.count == 9 else { throw invalid() }
            let length = Int(read16(data, 3)); guard length >= 2, length <= 4096 else { throw invalid() }
            expected = length; id = transferId; checksum = read32(data, 5); buffer.removeAll(); return nil
        }
        guard expected > 0, transferId == id else { throw invalid() }
        if data[0] == 0x41 {
            guard data.count >= 6, Int(read16(data, 3)) == buffer.count, buffer.count+data.count-5 <= expected else { throw invalid() }
            buffer.append(data.dropFirst(5)); return nil
        }
        guard data[0] == 0x42, data.count == 3, buffer.count == expected, FrameCodec.crc32(buffer) == checksum else { throw invalid() }
        let result = Result(id: id, bytes: buffer); reset(); return result
    }
}
