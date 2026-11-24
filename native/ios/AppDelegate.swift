import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var controller: ControllerViewController?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let view = ControllerViewController(); controller = view
        let window = UIWindow(frame: UIScreen.main.bounds); window.rootViewController = view; window.makeKeyAndVisible(); self.window = window
        application.isIdleTimerDisabled = true; return true
    }
    func applicationWillResignActive(_ application: UIApplication) { controller?.controller.setForeground(false) }
    func applicationDidBecomeActive(_ application: UIApplication) { controller?.controller.setForeground(true) }
}
