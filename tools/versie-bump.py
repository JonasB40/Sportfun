"""
versie-bump.py — vernieuw de cache-buster achter alle JS-imports

WANNEER GEBRUIKEN
    Telkens nadat je iets in js/*.js hebt gewijzigd, vóór het pushen.

WAAROM
    Alle JS wordt geladen als  ./js/auth.js?v=<versie> . De browser
    bewaart een bestand per URL. Blijft die versie gelijk, dan blijft de
    browser de oude versie gebruiken — ook na Ctrl+F5, want de URL is
    niet veranderd.

    Op 2026-07-28 stond die versie 25 dagen stil. Alle JS-fixes van die
    dag bereikten de gebruiker daardoor niet, wat tot een lange zoektocht
    naar een niet-bestaande bug leidde.

GEBRUIK
    python tools/versie-bump.py
"""
import glob
import io
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

bestanden = sorted(glob.glob('*.html') + glob.glob('js/*.js'))
huidige = set(re.findall(r'\?v=(\d+)', ' '.join(
    io.open(f, encoding='utf-8').read() for f in bestanden
)))

if not huidige:
    print('Geen ?v=-verwijzingen gevonden. Niets te doen.')
    sys.exit(0)

if len(huidige) > 1:
    print('Let op: meerdere versienummers in gebruik:', ', '.join(sorted(huidige)))
    print('Ze worden nu allemaal gelijkgetrokken.')

nieuw = str(int(time.time() * 1000))
totaal = 0

for f in bestanden:
    s = io.open(f, encoding='utf-8').read()
    n = len(re.findall(r'\?v=\d+', s))
    if not n:
        continue
    io.open(f, 'w', encoding='utf-8', newline='\n').write(
        re.sub(r'\?v=\d+', '?v=' + nieuw, s)
    )
    totaal += n
    print(f'  {f}  ({n})')

print()
print(f'Versie {" / ".join(sorted(huidige))} -> {nieuw}')
print(f'{totaal} verwijzingen bijgewerkt in {len(bestanden)} bestanden.')
print()
print('Vergeet niet te committen en te pushen.')
