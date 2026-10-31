import UIKit
import WebKit

// Hovedet — iOS-udgaven: fuld skærm om hoved-bogen.
// Siden bruger selv viewport-fit=cover og env(safe-area-inset-*),
// så webviewet fylder HELE skærmen og siden håndterer safe-area.

let bogURL = URL(string: "https://tpixel.github.io/apps/hoved-bog.html")!
let bogBaggrund = UIColor(red: 0x0C / 255.0, green: 0x0C / 255.0, blue: 0x12 / 255.0, alpha: 1.0)

final class BogController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    var webView: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = bogBaggrund

        let opsaetning = WKWebViewConfiguration()
        opsaetning.websiteDataStore = .default() // localStorage m.m. persisterer
        opsaetning.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: opsaetning)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = bogBaggrund
        webView.scrollView.backgroundColor = bogBaggrund
        // Siden håndterer selv safe-area via env() — ingen automatisk indrykning
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Træk ned for at genindlæse bogen
        let genindlaeser = UIRefreshControl()
        genindlaeser.tintColor = .white
        genindlaeser.addTarget(self, action: #selector(genindlaes(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = genindlaeser

        view.addSubview(webView)
        webView.load(URLRequest(url: bogURL))
    }

    @objc func genindlaes(_ sender: UIRefreshControl) {
        webView.reload()
        sender.endRefreshing()
    }

    // Hvis siden fejler (fx ingen net ved opstart) → prøv igen efter 2 sek.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            webView.load(URLRequest(url: bogURL))
        }
    }

    // Links der peger ud af bogen åbnes i Safari
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url,
           url.host != bogURL.host {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // target="_blank" → Safari
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // JS alert/confirm/prompt (bogen bruger confirm ved sletning)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let boks = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        boks.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(boks, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let boks = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        boks.addAction(UIAlertAction(title: "Annuller", style: .cancel) { _ in completionHandler(false) })
        boks.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(boks, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let boks = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        boks.addTextField { $0.text = defaultText }
        boks.addAction(UIAlertAction(title: "Annuller", style: .cancel) { _ in completionHandler(nil) })
        boks.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(boks.textFields?.first?.text)
        })
        present(boks, animated: true)
    }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let vindue = UIWindow(frame: UIScreen.main.bounds)
        vindue.backgroundColor = bogBaggrund
        vindue.overrideUserInterfaceStyle = .dark
        vindue.rootViewController = BogController()
        vindue.makeKeyAndVisible()
        window = vindue
        return true
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
