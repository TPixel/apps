# WiiM-bro

Lille lokal server til Mac'en, der gør to ting:

1. Serverer apps-mappen (bl.a. `vinyl.html`) på hjemmenetværket.
2. Taler med WiiM Ultra's lokale API på vegne af browseren, som ikke selv kan (selvsigneret certifikat, ingen CORS).

Så får Vinyl-appen "spiller nu" direkte fra WiiM'en med cover, position og længde, og kan styre afspil/pause, næste/forrige og lydstyrke.

## Opsætning (én gang, på Mac'en)

```bash
cd ~/Documents/apps/wiim-bro      # hvor apps-repoet ligger
chmod +x install.sh
./install.sh 192.168.1.50         # WiiM'ens IP: WiiM Home → enheden → indstillinger
```

Den kører derefter automatisk ved login (launchd, genstarter selv). Log: `~/Library/Logs/wiim-bro.log`.

Åbn på iPad'en (samme wifi): `http://<mac-navn>.local:8787/vinyl.html` og læg den på hjemmeskærmen.
Appen opdager selv broen, når den er hentet derfra. Ellers kan bro-adressen skrives under ⚙️.

Giv WiiM'en fast IP i routeren (DHCP-reservation), så adressen ikke skifter.

## Køre manuelt

```bash
node wiim-bro.js --wiim 192.168.1.50 --port 8787
```

## Endpoints

| Endpoint | Gør |
|---|---|
| `GET /wiim/status` | JSON: `status`, `playing`, `title`, `artist`, `album`, `art`, `pos`, `len` (ms), `vol`, `mute`, `source` |
| `GET /wiim/cmd?c=toggle` | `play`, `pause`, `toggle`, `stop`, `next`, `prev`, `vol&v=0-100`, `mute&v=1/0`, `seek&v=sek` |
| `GET /wiim/raw?command=getPlayerStatus` | Rå WiiM-kommando (til fejlsøgning) |
| `GET /wiim/ping` | Er broen oppe |

## Stop / afinstallér

```bash
launchctl bootout gui/$(id -u)/dk.ditzel.wiim-bro
rm ~/Library/LaunchAgents/dk.ditzel.wiim-bro.plist
```
