import Foundation
import CoreBluetooth
import CoreMotion
import UIKit

final class ControllerPeripheral: NSObject, CBPeripheralManagerDelegate {
    static let serviceID = CBUUID(string: "4d1a0001-9cf1-4ee3-a71b-9438ef5d3400")
    static let motionID = CBUUID(string: "4d1a0002-9cf1-4ee3-a71b-9438ef5d3400")
    static let controlID = CBUUID(string: "4d1a0003-9cf1-4ee3-a71b-9438ef5d3400")
    var onState: (([String: Any]) -> Void)?
    private var manager: CBPeripheralManager!
    private let sensors = CMMotionManager(), transfer = ProfileTransfer()
    private var motion: CBMutableCharacteristic?, control: CBMutableCharacteristic?, central: CBCentral?
    private var wanted = false, serviceAdded = false, foreground = true, gyroWanted = true
    private var motionSubscribed = false, controlSubscribed = false, stoppedFrame = false
    private var queue = [Data](), pendingMotion: Data?, timer: Timer?
    private var quaternion = [0.0, 0.0, 0.0, 1.0], speed = 0.0, poseTime = 0.0, lastPoseSent = 0.0
    private var epoch: UInt16 = 1, sequence: UInt16 = 0, buttonSequence: UInt16 = 0, buttonMask: UInt16 = 0, profileEpoch: UInt16 = 0
    private var profile: [String: Any]?, message = "Start Bluetooth, then choose this iPhone on the laptop."
    private var hapticsWanted = true
    private var lastHeartbeat = 0.0, lastState = 0.0, sensorGeneration = 0

    override init() { super.init(); manager = CBPeripheralManager(delegate: self, queue: .main, options: [CBPeripheralManagerOptionShowPowerAlertKey: true]) }
    deinit { timer?.invalidate(); sensors.stopDeviceMotionUpdates() }
    func state() -> [String: Any] {
        var value: [String: Any] = ["running": wanted && manager.state == .poweredOn, "connected": wanted && central != nil,
          "motionAvailable": sensors.isDeviceMotionAvailable, "sensing": sensors.isDeviceMotionActive,
          "haptics": hapticsWanted, "camera": false, "status": message]
        if let profile = profile { value["profile"] = profile }; return value
    }
    func emit() { onState?(state()) }
    func start() {
        wanted = true; message = "Preparing Bluetooth…"; configure()
        if timer == nil { timer = Timer.scheduledTimer(withTimeInterval: 1.0/60, repeats: true) { [weak self] _ in self?.tick() } }
        emit()
    }
    func stop() {
        setButtons(0); enqueue(Data([5])); wanted = false; stopSensors(); manager.stopAdvertising()
        timer?.invalidate(); timer = nil; message = "Bluetooth stopped. Start again when you are ready."; emit()
        if central == nil { manager.removeAllServices(); serviceAdded = false; motion = nil; control = nil }
    }
    func setButtons(_ mask: Int) {
        guard mask >= 0, mask <= 2047 else { return }
        buttonMask = wanted && central != nil ? UInt16(mask) : 0; sendButtons()
    }
    private func sendButtons() {
        guard central != nil else { return }; lastHeartbeat = ProcessInfo.processInfo.systemUptime
        enqueue(FrameCodec.buttons(mask: buttonMask, sequence: buttonSequence, profileEpoch: profileEpoch)); buttonSequence &+= 1
    }
    func center() {
        guard wanted, central != nil else { return }; epoch &+= 1
        if poseTime > 0, ProcessInfo.processInfo.systemUptime - poseTime < 0.15,
          let data = FrameCodec.center(epoch: epoch, milliseconds: UInt32(truncatingIfNeeded: Int64(poseTime * 1000)), quaternion: quaternion) { enqueue(data) }
        else { var data = Data([2]); FrameCodec.append16(epoch, to: &data); enqueue(data) }
        message = "Centered in your current grip."; emit()
    }
    func setMotion(_ enabled: Bool) { gyroWanted = enabled; if enabled { startSensors() } else { stopSensors() }; emit() }
    func setHaptics(_ enabled: Bool) { hapticsWanted = enabled; emit() }
    func setForeground(_ enabled: Bool) {
        foreground = enabled; setButtons(0); if enabled && gyroWanted { startSensors() } else { stopSensors() }; emit()
    }
    private func startSensors() {
        guard wanted, foreground, gyroWanted, sensors.isDeviceMotionAvailable, !sensors.isDeviceMotionActive else { return }
        if CMMotionActivityManager.authorizationStatus() == .denied || CMMotionActivityManager.authorizationStatus() == .restricted {
            message = "Motion permission is unavailable. Buttons remain usable."; return
        }
        epoch &+= 1; poseTime = 0; lastPoseSent = 0; stoppedFrame = false; sensorGeneration += 1
        let generation = sensorGeneration; sensors.deviceMotionUpdateInterval = 1.0/60
        sensors.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, error in
            guard let self = self, self.sensorGeneration == generation, self.gyroWanted, self.foreground else { return }
            if let error = error { self.message = "Motion unavailable: " + error.localizedDescription; self.emit(); return }
            guard let data = data else { return }; let q = data.attitude.quaternion
            let values = [q.x,q.y,q.z,q.w]; guard values.allSatisfy({ $0.isFinite }) else { return }
            self.quaternion = values; self.poseTime = data.timestamp
            let rate = data.rotationRate; self.speed = sqrt(rate.x*rate.x+rate.y*rate.y+rate.z*rate.z)*180/Double.pi
        }
    }
    private func stopSensors() { sensorGeneration += 1; sensors.stopDeviceMotionUpdates(); poseTime = 0; speed = 0; stoppedFrame = false; enqueue(Data([3])) }
    private func configure() {
        guard wanted, manager.state == .poweredOn else { emit(); return }
        if serviceAdded { advertise(); return }
        guard motion == nil else { return }
        let motionValue = CBMutableCharacteristic(type: Self.motionID, properties: [.notify], value: nil, permissions: [.readable])
        let controlValue = CBMutableCharacteristic(type: Self.controlID, properties: [.read,.write,.notify,.indicate], value: nil, permissions: [.readable,.writeable])
        let service = CBMutableService(type: Self.serviceID, primary: true); service.characteristics = [motionValue, controlValue]
        motion = motionValue; control = controlValue; manager.add(service)
    }
    private func advertise() {
        guard wanted, central == nil, manager.state == .poweredOn else { return }
        manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [Self.serviceID], CBAdvertisementDataLocalNameKey: "ControllerKit iPhone"])
        message = "Bluetooth ready. Select ControllerKit iPhone on the laptop."; emit()
    }
    private func enqueue(_ data: Data) {
        guard central != nil else { return }
        if queue.count >= 64 { queue.removeAll(); buttonMask = 0; queue.append(FrameCodec.buttons(mask: 0, sequence: buttonSequence, profileEpoch: profileEpoch)); buttonSequence &+= 1 }
        else { queue.append(data) }; flush()
    }
    private func flush() {
        guard manager.state == .poweredOn, let central = central else { return }
        if controlSubscribed, let control = control {
            // Send one control edge, then give the latest motion a turn.
            let index=queue.firstIndex(where:{$0.first==2||$0.first==0x43}) ?? 0
            if !queue.isEmpty { if !manager.updateValue(queue[index], for: control, onSubscribedCentrals: [central]) { return }; queue.remove(at:index) }
        }
        if motionSubscribed, let motion = motion, let data = pendingMotion,
          manager.updateValue(data, for: motion, onSubscribedCentrals: [central]) { pendingMotion = nil }
    }
    private func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        if wanted, central != nil {
            if buttonMask != 0 && now-lastHeartbeat >= 0.4 { sendButtons() }
            let active = sensors.isDeviceMotionActive && poseTime > 0 && now-poseTime < 0.1
            if active && poseTime != lastPoseSent || !active && !stoppedFrame {
                pendingMotion = FrameCodec.motion(flags: active ? 3 : 0, sequence: sequence,
                  milliseconds: UInt32(truncatingIfNeeded: Int64((active ? poseTime : now)*1000)), quaternion: quaternion, speed: active ? speed : 0, epoch: epoch)
                sequence &+= 1; lastPoseSent = poseTime; stoppedFrame = !active
            }; flush()
        }
        if now-lastState > 1 { lastState = now; emit() }
    }
    private func apply(_ result: ProfileTransfer.Result) throws {
        guard let value = try JSONSerialization.jsonObject(with: result.bytes) as? [String: Any],
          let id = value["id"] as? String, id.range(of: "^[a-z][a-z0-9-]{0,31}$", options: .regularExpression) != nil,
          let title = value["title"] as? String, !title.isEmpty, title.count <= 48,
          let orientation = value["orientation"] as? String, ["portrait","landscape"].contains(orientation),
          let mode = value["motion"] as? String, ["none","aim","steer"].contains(mode),
          let player = value["player"] as? Int, (1...8).contains(player),
          let revision = value["profileEpoch"] as? Int, revision >= 0, revision <= 65535,
          let controls = value["controls"] as? [[String: Any]], controls.count <= 11 else { throw NSError(domain: "ControllerKit", code: 2) }
        let supported = ["up","right","down","left","a","b","one","two","plus","minus","home"]; var used = Set<String>()
        for button in controls {
            guard let id = button["id"] as? String, supported.contains(id), used.insert(id).inserted,
              let label = button["label"] as? String, !label.isEmpty, label.count <= 20,
              let action = button["action"] as? String, action.range(of: "^[a-z][a-z0-9.-]{0,39}$", options: .regularExpression) != nil else { throw NSError(domain: "ControllerKit", code: 3) }
        }
        profile = value; profileEpoch = UInt16(revision); buttonMask = 0
        setMotion(mode != "none"); if gyroWanted { center() }
        var ack = Data([0x43]); FrameCodec.append16(result.id, to: &ack); ack.append(0); FrameCodec.append16(profileEpoch, to: &ack); enqueue(ack); sendButtons()
        message = "Player \(player) · \(title). Controls are ready."; emit()
    }
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn { configure() }
        else { central = nil; serviceAdded = false; motion = nil; control = nil; queue.removeAll(); transfer.reset(); message = peripheral.state == .unauthorized ? "Allow Bluetooth in iPhone settings." : "Turn on Bluetooth to connect."; emit() }
    }
    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error = error { message = error.localizedDescription; motion = nil; control = nil; emit(); return }; serviceAdded = true; advertise()
    }
    func peripheralManager(_ peripheral: CBPeripheralManager, didStartAdvertising error: Error?) { if let error = error { message = error.localizedDescription; emit() } }
    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        if let assigned = self.central, assigned.identifier != central.identifier { return }
        self.central = central; manager.stopAdvertising()
        if characteristic.uuid == Self.motionID { motionSubscribed = true }; if characteristic.uuid == Self.controlID { controlSubscribed = true }
        message = "Laptop connected. Waiting for its controls."; sendButtons(); emit()
    }
    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        guard self.central?.identifier == central.identifier else { return }
        if characteristic.uuid == Self.motionID { motionSubscribed = false }; if characteristic.uuid == Self.controlID { controlSubscribed = false }
        if !motionSubscribed && !controlSubscribed { self.central = nil; queue.removeAll(); pendingMotion = nil; transfer.reset(); profile = nil; buttonMask = 0; message = "Laptop disconnected. Reconnect from the host."; advertise(); emit() }
    }
    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) { flush() }
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        guard request.offset == 0 else { peripheral.respond(to: request, withResult: .invalidOffset); return }
        request.value = Data([0]); peripheral.respond(to: request, withResult: .success)
    }
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            guard self.central?.identifier == request.central.identifier, request.characteristic.uuid == Self.controlID,
              request.offset == 0, let data = request.value, !data.isEmpty else { peripheral.respond(to: request, withResult: .requestNotSupported); continue }
            do {
                if data[0] == 0x10 && data.count == 5 { var pong = data; pong[0] = 0x90; enqueue(pong) }
                else if data.count == 1 && (0x11...0x13).contains(data[0]) { if hapticsWanted { UIImpactFeedbackGenerator(style: .light).impactOccurred() } }
                else if (0x40...0x42).contains(data[0]) { if let result = try transfer.accept(data) { try apply(result) } }
                else { peripheral.respond(to: request, withResult: .requestNotSupported); continue }
                peripheral.respond(to: request, withResult: .success)
            } catch { peripheral.respond(to: request, withResult: .unlikelyError) }
        }
    }
}
