# Hovedet — iOS-appen

En tynd native wrapper (Swift/WKWebView) om bogen på
https://tpixel.github.io/apps/hoved-bog.html — samme opskrift som Mac-udgaven
i `~/apps/hovedet-mac/`. Ingen Xcode-projekt: bare `main.swift`, `Info.plist`
og `byg.sh`.

- Mørk baggrund `#0C0C12` bag webviewet, fuld skærm (siden håndterer selv
  safe-area via `viewport-fit=cover` + `env(safe-area-inset-*)`).
- localStorage persisterer (`WKWebsiteDataStore.default`) — så `kontaktNoegle`
  sættes én gang i appen og bliver husket.
- Træk ned i toppen af bogen = genindlæs siden.
- Eksterne links åbnes i Safari.

## Byg og kør i simulatoren

```
./byg.sh
xcrun simctl boot "iPhone 17 Pro"        # hvis ingen simulator kører
xcrun simctl install booted Hovedet.app
xcrun simctl launch booted dk.ditzel.hovedet
```

## Sideload til din fysiske iPhone

Appen skal signeres med et Apple-ID for at køre på en rigtig iPhone. Det
nemmeste værktøj uden fuldt Xcode-projekt er **ios-deploy via Xcode** — men i
praksis er den letteste vej at lade Xcode klare signeringen:

### Vej A — gratis Apple-ID (7-dages signering)

Med et gratis Apple-ID udløber signaturen efter 7 dage, og appen skal
geninstalleres (indholdet ligger trygt på GitHub Pages + localStorage
overlever geninstallation IKKE — men bogen henter alt fra API'et, så kun
`kontaktNoegle` skal sættes igen).

1. Åbn Xcode → Settings → Accounts → log ind med dit Apple-ID.
2. Lav ét minimalt Xcode-projekt én gang (kun til signering):
   - File → New → Project → iOS App, navn **Hovedet**,
     bundle-id **dk.ditzel.hovedet**, sprog Swift, interface Storyboard.
   - Slet `ViewController.swift` + storyboard-referencerne, og erstat
     indholdet af projektets `AppDelegate.swift` med koden fra `main.swift`
     her i mappen (fjern den sidste `UIApplicationMain(...)`-linje og sæt
     `@main` foran `AppDelegate`-klassen; fjern også
     `UIMainStoryboardFile`/Scene-manifest i projektets Info-fane).
   - Signing & Capabilities → Team = dit (Personal Team) → Xcode laver selv
     en gratis provisioning-profil.
   - Træk `hoved-ikon-512.png` (skaleret til 1024×1024) ind i Assets →
     AppIcon.
3. Sæt din iPhone i med kabel (eller samme wifi), vælg den som destination,
   tryk ⌘R.
4. På telefonen: Indstillinger → Generelt → VPN og enhedsadm. →
   godkend udviklercertifikatet første gang.
5. Efter 7 dage: tryk ⌘R igen (projektet ligger der jo) — det er hele
   fornyelsen.

### Vej B — betalt Developer-konto (99 USD/år, 1 års signering)

Samme fremgangsmåde som Vej A, men:

- Vælg dit betalte team under Signing & Capabilities.
- Signaturen holder 1 år, og appen kan også distribueres via **TestFlight**
  (Product → Archive → Distribute → TestFlight), så den kan installeres
  uden kabel og fornys ved blot at bygge en ny version ca. én gang om året.

### Alternativ uden Xcode-projekt: AltStore/SideStore

Hvis du hellere vil undgå Xcode-projektet helt:

1. Byg en usigneret enheds-IPA:
   ```
   ./byg.sh enhed
   mkdir -p Payload && cp -R Hovedet.app Payload/ && zip -r Hovedet.ipa Payload && rm -rf Payload
   ```
2. Installér [AltStore](https://altstore.io) (gratis Apple-ID, 7 dage) eller
   SideStore på telefonen, og åbn `Hovedet.ipa` derfra — de signerer og
   fornyer automatisk, så længe AltServer kører på Mac'en af og til.

## Husk: nøglen til adressebogen

Adressebogen i bogen kræver nøglen i localStorage (`kontaktNoegle`).
Den sættes manuelt i appen første gang (samme procedure som i browseren) —
den er bevidst IKKE bygget ind i appen.
