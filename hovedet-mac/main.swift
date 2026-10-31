import Cocoa
import WebKit

// Hovedet — et lille vindue om hoved-bogen.
// Bogen er maks 480 bred + ca. 62px fane-kant i højre side → 542 x 720.

let bogURL = URL(string: "https://tpixel.github.io/apps/hoved-bog.html")!
let bogBaggrund = NSColor(srgbRed: 0x0C / 255.0, green: 0x0C / 255.0, blue: 0x12 / 255.0, alpha: 1.0)

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var vindue: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
        let opsaetning = WKWebViewConfiguration()
        opsaetning.websiteDataStore = .default() // localStorage m.m. persisterer

        webView = WKWebView(frame: .zero, configuration: opsaetning)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        webView.underPageBackgroundColor = bogBaggrund
        webView.setValue(false, forKey: "drawsBackground") // vinduets mørke farve bag siden

        vindue = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 542, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        vindue.title = "Hovedet"
        vindue.appearance = NSAppearance(named: .darkAqua)
        vindue.backgroundColor = bogBaggrund
        vindue.titlebarAppearsTransparent = true
        vindue.minSize = NSSize(width: 360, height: 480)
        vindue.contentView = webView
        vindue.isReleasedWhenClosed = false
        vindue.center()
        vindue.setFrameAutosaveName("HovedetVindue") // husker position/størrelse
        vindue.makeKeyAndOrderFront(nil)

        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: bogURL))
    }

    // Luk appen når vinduet lukkes
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Klik på Dock-ikonet mens vinduet er lukket → vis det igen
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { vindue.makeKeyAndOrderFront(nil) }
        return true
    }

    // Links der peger ud af bogen åbnes i standardbrowseren
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url,
           url.host != bogURL.host {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // target="_blank" → standardbrowseren
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // JS alert/confirm (bogen bruger confirm ved sletning)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let boks = NSAlert()
        boks.messageText = message
        boks.addButton(withTitle: "OK")
        boks.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let boks = NSAlert()
        boks.messageText = message
        boks.addButton(withTitle: "OK")
        boks.addButton(withTitle: "Annuller")
        completionHandler(boks.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let boks = NSAlert()
        boks.messageText = prompt
        boks.addButton(withTitle: "OK")
        boks.addButton(withTitle: "Annuller")
        let felt = NSTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        felt.stringValue = defaultText ?? ""
        boks.accessoryView = felt
        completionHandler(boks.runModal() == .alertFirstButtonReturn ? felt.stringValue : nil)
    }

    @objc func genindlaes(_ sender: Any?) { webView.reload() }
}

// Menulinje — nødvendig for Cmd+Q, Cmd+C/V/X, Cmd+W og Cmd+R
func bygMenu(delegate: AppDelegate) {
    let hovedmenu = NSMenu()

    let appPunkt = NSMenuItem()
    hovedmenu.addItem(appPunkt)
    let appMenu = NSMenu()
    appPunkt.submenu = appMenu
    appMenu.addItem(withTitle: "Skjul Hovedet", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Slut Hovedet", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let redigerPunkt = NSMenuItem()
    hovedmenu.addItem(redigerPunkt)
    let redigerMenu = NSMenu(title: "Rediger")
    redigerPunkt.submenu = redigerMenu
    redigerMenu.addItem(withTitle: "Fortryd", action: Selector(("undo:")), keyEquivalent: "z")
    redigerMenu.addItem(withTitle: "Gentag", action: Selector(("redo:")), keyEquivalent: "Z")
    redigerMenu.addItem(NSMenuItem.separator())
    redigerMenu.addItem(withTitle: "Klip", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    redigerMenu.addItem(withTitle: "Kopier", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    redigerMenu.addItem(withTitle: "Sæt ind", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    redigerMenu.addItem(withTitle: "Vælg alt", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

    let visPunkt = NSMenuItem()
    hovedmenu.addItem(visPunkt)
    let visMenu = NSMenu(title: "Vis")
    visPunkt.submenu = visMenu
    let genindlaes = NSMenuItem(title: "Genindlæs bogen", action: #selector(AppDelegate.genindlaes(_:)), keyEquivalent: "r")
    genindlaes.target = delegate
    visMenu.addItem(genindlaes)

    let vinduePunkt = NSMenuItem()
    hovedmenu.addItem(vinduePunkt)
    let vindueMenu = NSMenu(title: "Vindue")
    vinduePunkt.submenu = vindueMenu
    vindueMenu.addItem(withTitle: "Luk", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    vindueMenu.addItem(withTitle: "Minimer", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")

    NSApp.mainMenu = hovedmenu
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
bygMenu(delegate: delegate)
app.run()
