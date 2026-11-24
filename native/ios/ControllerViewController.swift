import UIKit
import WebKit

final class ControllerViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    let controller = ControllerPeripheral()
    private var web: WKWebView!
    private var pageReady = false, landscape = false
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = UIColor(red: 0.933, green: 0.945, blue: 0.965, alpha: 1)
        let content = WKUserContentController(); content.add(self, name: "controller")
        let configuration = WKWebViewConfiguration(); configuration.userContentController = content
        web = WKWebView(frame: .zero, configuration: configuration); web.navigationDelegate = self
        web.isOpaque = false; web.backgroundColor = view.backgroundColor; web.scrollView.bounces = false
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
          web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
        controller.onState = { [weak self] state in self?.render(state) }
        if let file = Bundle.main.url(forResource: "controller", withExtension: "html") { web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent()) }
        else { web.loadHTMLString("<h1>Controller UI missing</h1><p>Run node scripts/native/sync-ui.mjs before building.</p>", baseURL: nil) }
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { landscape ? .landscape : .portrait }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pageReady = true; render(controller.state()) }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, text.utf8.count <= 512, let bytes = text.data(using: .utf8),
          let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], let type = value["type"] as? String else { return }
        switch type {
        case "ready": pageReady = true; render(controller.state())
        case "start": controller.start()
        case "stop": controller.stop()
        case "buttons": if let mask = value["mask"] as? Int { controller.setButtons(mask) }
        case "center": controller.center()
        case "motion": controller.setMotion(value["enabled"] as? Bool ?? false)
        case "haptics": controller.setHaptics(value["enabled"] as? Bool ?? false)
        default: break
        }
    }
    private func render(_ state: [String: Any]) {
        guard pageReady, let bytes = try? JSONSerialization.data(withJSONObject: state), let json = String(data: bytes, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.onNativeState && window.onNativeState(\(json));", completionHandler: nil)
        let desired = state["connected"] as? Bool == true && (state["profile"] as? [String: Any])?["orientation"] as? String == "landscape"
        if desired != landscape { landscape = desired; setNeedsUpdateOfSupportedInterfaceOrientations(); view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: landscape ? .landscape : .portrait)) }
    }
}
