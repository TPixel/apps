# Pladejagt — worker-endpoint der mangler

`plader.html` prøver først at genkende covers via Ditzel-workeren
(`https://lightcrew-api.thomas-5c5.workers.dev`). Endpointet findes ikke endnu.
Indtil det er lagt ind, kan appen bruge en Claude API-nøgle gemt lokalt på telefonen (⚙️).

## `POST /api/plader/scan`

Request (JSON):

```json
{ "foto": "<base64 JPEG uden data:-prefix, maks ca. 1024 px på den lange led>" }
```

Response (JSON) — samme mønster som `/api/fryser/scan`:

```json
{
  "felter": {
    "kunstner": "Pink Floyd",
    "album": "The Dark Side of the Moon",
    "aar": "1973",
    "label": "Harvest",
    "genre": "Progressive rock",
    "sikkerhed": 0.95,
    "note": ""
  }
}
```

Alle felter er strenge undtagen `sikkerhed` (0–1). Tomme strenge når noget ikke kan ses.
Appen viser "Usikkert bud" når `sikkerhed < 0.6`.

## Forslag til implementering i workeren

Kald Claude Messages API med billedet og structured output — samme system-prompt og JSON-schema
som ligger i `plader.html` (`identifyViaClaude` / `SCHEMA`), så telefonen og workeren giver samme svar:

```js
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'claude-opus-5',
    max_tokens: 1024,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: 'Du identificerer musikalbums ud fra et foto af et pladecover ...',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } },
      { type: 'text', text: 'Hvilket album er dette? Udfyld felterne.' }
    ]}]
  })
});
const j = await r.json();
if (j.stop_reason === 'refusal') return json({ felter: {} });
const felter = JSON.parse(j.content.filter(c => c.type === 'text').map(c => c.text).join(''));
return json({ felter });
```

Husk CORS-headers som på de øvrige `/api/*`-ruter (appen kører fra en anden origin).
