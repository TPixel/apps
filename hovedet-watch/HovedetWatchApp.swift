import SwiftUI

// Hovedet på håndleddet: hurtig-knapper der vælger destinationen,
// diktering via systemets tekst-input, POST direkte til hoved-API'et.

let apiBase = "https://lightcrew-api.thomas-5c5.workers.dev"

struct Destination: Identifiable {
    let id: String        // også kilde-suffix
    let emoji: String
    let navn: String
    let tag: String       // hashtag der sættes på teksten
    let aiSorter: Bool    // false = hashtag afgør alt, spring AI over
    let tilOpgaveliste: Bool // true = stemples på nyeste opgaveliste
}

let destinationer: [Destination] = [
    .init(id: "indkoeb", emoji: "🛒", navn: "Indkøb", tag: " #indkøb", aiSorter: false, tilOpgaveliste: false),
    .init(id: "opgave", emoji: "📋", navn: "Opgave", tag: " #opgave", aiSorter: false, tilOpgaveliste: true),
    .init(id: "ide", emoji: "💡", navn: "Idé", tag: " #idé", aiSorter: false, tilOpgaveliste: false),
    .init(id: "husmoede", emoji: "🤝", navn: "Husmøde", tag: " #husmøde", aiSorter: false, tilOpgaveliste: false),
    .init(id: "husk", emoji: "⏰", navn: "Husk", tag: "", aiSorter: true, tilOpgaveliste: false),
]

@main
struct HovedetWatchApp: App {
    var body: some Scene {
        WindowGroup { NavigationStack { ContentView() } }
    }
}

struct ContentView: View {
    @State private var status: String?
    @State private var sender = false

    var body: some View {
        List {
            if let s = status {
                Text(s)
                    .font(.footnote.bold())
                    .foregroundStyle(s.hasPrefix("✓") ? .green : .red)
                    .listRowBackground(Color.clear)
            }
            ForEach(destinationer) { d in
                TextFieldLink(prompt: Text(d.navn)) {
                    HStack(spacing: 8) {
                        Text(d.emoji).font(.title3)
                        Text(d.navn).font(.body)
                    }
                } onSubmit: { tekst in
                    Task { await send(tekst, til: d) }
                }
                .disabled(sender)
            }
        }
        .navigationTitle("Hovedet")
    }

    func send(_ raaTekst: String, til d: Destination) async {
        let tekst = raaTekst.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tekst.isEmpty else { return }
        sender = true
        defer { sender = false }
        do {
            let svar = try await post("\(apiBase)/api/hoved",
                                      ["tekst": tekst + d.tag, "kilde": "watch", "sorter": d.aiSorter])
            if d.tilOpgaveliste, let id = svar["id"] as? Int {
                // stempl punktet på den nyeste opgaveliste
                var hent = URLRequest(url: URL(string: "\(apiBase)/api/boglister?type=opgaver")!)
                hent.setValue("Bearer " + apiNoegle, forHTTPHeaderField: "Authorization")
                let (data, _) = try await URLSession.shared.data(for: hent)
                if let lister = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                   let nyeste = lister.first?["id"] as? Int {
                    _ = try await post("\(apiBase)/api/hoved/\(id)",
                                       ["bogliste": String(nyeste), "behandlet": 1,
                                        "resultat": "📋 punkt på listen (fra uret)"])
                }
            }
            status = "✓ Gemt: \(d.navn)"
        } catch {
            status = "✗ Fejl — prøv igen"
        }
        try? await Task.sleep(for: .seconds(2.5))
        status = nil
    }

    @discardableResult
    func post(_ url: String, _ body: [String: Any]) async throws -> [String: Any] {
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + apiNoegle, forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }
}
