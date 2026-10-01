// Vinyl Mini — lille Mac-app der viser mini.html fra wiim-bro i sit eget vindue.
// Byg: ./build.sh   (lægger "Vinyl Mini.app" i ~/Applications)
import Cocoa
import WebKit

let START_URL = URL(string: "http://localhost:8787/mini.html")!

class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var mode = ""
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.userContentController.add(self, name: "mode")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 470, height: 330),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Vinyl Mini"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(red: 0.05, green: 0.05, blue: 0.067, alpha: 1)
        window.minSize = NSSize(width: 200, height: 240)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("VinylMiniWindow")   // husker størrelse og placering
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: START_URL))
        NSApp.activate(ignoringOtherApps: true)
    }

    // Klik på Dock-ikonet når vinduet er lukket → vis det igen
    func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }

    // Links der vil åbne nyt vindue (fx "stor visning") åbnes i standardbrowseren
    func webView(_ webView: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures w: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    // Broen kører ikke endnu (fx lige efter opstart) → prøv igen om lidt
    func webView(_ webView: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        webView.loadHTMLString("<body style='background:#0d0d11;color:#888;font:bold 13px Tahoma;display:flex;align-items:center;justify-content:center;height:90vh'>Venter på WiiM-broen…</body>", baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { webView.load(URLRequest(url: START_URL)) }
    }

    // Siden siger hvilken visning den er i ("full" eller "plate") → hver visning husker sin egen vinduesstørrelse
    func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let newMode = m.body as? String, newMode != mode else { return }
        let d = UserDefaults.standard
        if !mode.isEmpty { d.set(NSStringFromRect(window.frame), forKey: "frame-" + mode) }
        let first = mode.isEmpty
        mode = newMode
        if let saved = d.string(forKey: "frame-" + newMode) {
            window.setFrame(NSRectFromString(saved), display: true, animate: !first)
        } else if !first {
            let size = newMode == "plate" ? NSSize(width: 300, height: 380) : NSSize(width: 470, height: 330)
            var f = window.frame; let top = f.maxY
            f.size = size; f.origin.y = top - size.height
            window.setFrame(f, display: true, animate: true)
        }
    }
    func applicationWillTerminate(_ n: Notification) {
        if !mode.isEmpty { UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: "frame-" + mode) }
    }

    @objc func reload(_ s: Any?) { web.load(URLRequest(url: START_URL)) }
    @objc func openBig(_ s: Any?) { NSWorkspace.shared.open(URL(string: "http://localhost:8787/vinyl.html")!) }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Om Vinyl Mini", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Skjul Vinyl Mini", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Afslut Vinyl Mini", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Rediger")
        edit.addItem(withTitle: "Klip", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Kopiér", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Sæt ind", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Vælg alt", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "Vis")
        view.addItem(withTitle: "Genindlæs", action: #selector(reload(_:)), keyEquivalent: "r")
        view.addItem(withTitle: "Åbn stor visning i browser", action: #selector(openBig(_:)), keyEquivalent: "b")
        viewItem.submenu = view

        let winItem = NSMenuItem(); main.addItem(winItem)
        let win = NSMenu(title: "Vindue")
        win.addItem(withTitle: "Minimér", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Luk", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
