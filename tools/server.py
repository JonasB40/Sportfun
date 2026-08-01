"""
SportFun lokale ontwikkelserver

Statische webserver met no-cache headers, zodat browsers nooit
oude versies van JS/CSS-bestanden vasthouden tijdens ontwikkeling.

Gebruik: dubbelklik tools/start.bat, of vanaf de projectmap:
    python tools/server.py
Open dan: http://localhost:8181
"""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8181

# Serveer altijd de projectmap, ongeacht vanwaar het script gestart wordt.
#
# SimpleHTTPRequestHandler serveert de map waarin het proces draait. Toen
# dit bestand naar tools/ verhuisde, bleef start.bat naar zijn eigen map
# springen — de server toonde dan de inhoud van tools/ in plaats van de
# site, en localhost:8181 leek stuk. Door hier expliciet naar de map
# boven dit script te gaan, werkt elke manier van starten.
PROJECTMAP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECTMAP)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Forceer dat de browser NIETS uit cache haalt
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Houd de console rustig; negeer afgebroken verbindingen
        pass

if __name__ == '__main__':
    # ThreadingHTTPServer: elke verbinding krijgt een eigen thread, zodat één
    # hangende of afgebroken verbinding de server niet blokkeert voor anderen.
    server = ThreadingHTTPServer(('localhost', PORT), NoCacheHandler)
    server.daemon_threads = True
    print(f'\n  SportFun Portaal draait op:  http://localhost:{PORT}')
    print(f'  Serveert map: {PROJECTMAP}')
    print('  (Druk Ctrl+C om te stoppen)\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server gestopt.')
