#!/usr/bin/env python3
# Genererer alle app-ikoner og web-mærket fra paperhead-logo.png.
# Logoet er FORELØBIGT: når der kommer et nyt, så erstat paperhead-logo.png
# og kør dette script igen — filnavnene/stierne er de samme overalt.
#   python3 lav-ikoner.py
# Forventer: kvadratisk-ish logo med ensfarvet (creme/hvid) baggrund,
# motiv øverst og wordmark nederst. Justér SPLIT_Y hvis layoutet ændrer sig.
from PIL import Image
import pathlib, collections

HER = pathlib.Path(__file__).parent
KILDE = HER / 'paperhead-logo.png'
SPLIT_Y = 876          # y-linje mellem motiv og "Paperhead"-wordmark (til dette logo)
CREME = (245, 241, 238)  # ikon-baggrund = logoets egen kortfarve

img = Image.open(KILDE).convert('RGBA')
W, H = img.size
px = img.load()

def moerk(p):
    return p[3] > 200 and p[0] < 120 and p[1] < 120 and p[2] < 140

def farvet(p):
    mx, mn = max(p[:3]), min(p[:3])
    return p[3] > 200 and mx - mn > 60 and mx > 140

# indholds-bbox = mørke + farvede pixels (motiv, faneblade, wordmark)
def bbox(y0, y1):
    L, R, T, B = W, 0, H, 0
    for y in range(y0, y1, 2):
        for x in range(0, W, 2):
            p = px[x, y]
            if moerk(p) or farvet(p):
                if x < L: L = x
                if x > R: R = x
                if y < T: T = y
                if y > B: B = y
    return (L, T, R + 2, B + 2)

alt_boks = bbox(0, H)        # motiv + wordmark
motiv_boks = bbox(0, SPLIT_Y)  # kun motivet (hoved + papir)

def ikon(sti, side, boks, fyld=0.78):
    ud = Image.new('RGB', (side, side), CREME)
    udsnit = img.crop(boks).convert('RGB')
    w, h = udsnit.size
    skala = fyld * side / max(w, h)
    udsnit = udsnit.resize((max(1, round(w * skala)), max(1, round(h * skala))), Image.LANCZOS)
    ud.paste(udsnit, ((side - udsnit.width) // 2, (side - udsnit.height) // 2))
    ud.save(HER / sti, optimize=True)
    print(f'{sti}: {side}x{side} fra {boks}')

ikon('hoved-ikon-512.png', 512, alt_boks)
ikon('hoved-ikon-192.png', 192, alt_boks)
ikon('hoved-ikon-180.png', 180, alt_boks)
ikon('hoved-ikon-32.png', 32, motiv_boks, fyld=0.92)  # wordmark kan ikke læses i 32px

# paperhead-maerke.png: motivet alene med GENNEMSIGTIG baggrund (header + omslag).
# Baggrunden fjernes med flood-fill fra kanten, så papirets hvide indre ikke rammes.
tol = 26
def baggrundsagtig(p):
    return abs(p[0] - CREME[0]) < tol and abs(p[1] - CREME[1]) < tol and abs(p[2] - CREME[2]) < tol

bg = bytearray(W * H)
koe = collections.deque()
for x in range(W):
    for y in (0, H - 1):
        if baggrundsagtig(px[x, y]) and not bg[y * W + x]:
            bg[y * W + x] = 1; koe.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if baggrundsagtig(px[x, y]) and not bg[y * W + x]:
            bg[y * W + x] = 1; koe.append((x, y))
while koe:
    x, y = koe.popleft()
    for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
        if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx] and baggrundsagtig(px[nx, ny]):
            bg[ny * W + nx] = 1; koe.append((nx, ny))

gennemsigtig = img.copy()
gp = gennemsigtig.load()
for y in range(H):
    for x in range(W):
        if bg[y * W + x]:
            p = gp[x, y]
            gp[x, y] = (p[0], p[1], p[2], 0)
maerke = gennemsigtig.crop((motiv_boks[0], motiv_boks[1], motiv_boks[2], min(SPLIT_Y, motiv_boks[3])))
a = maerke.getbbox()
if a: maerke = maerke.crop(a)
skala = 480 / max(maerke.size)
maerke = maerke.resize((round(maerke.width * skala), round(maerke.height * skala)), Image.LANCZOS)
maerke.save(HER / 'paperhead-maerke.png', optimize=True)
print(f'paperhead-maerke.png: {maerke.width}x{maerke.height} (gennemsigtig)')
