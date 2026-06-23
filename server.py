"""
SportFun lokale ontwikkelserver

Statische webserver met no-cache headers, zodat browsers nooit
oude versies van JS/CSS-bestanden vasthouden tijdens ontwikkeling.

Gebruik: python server.py   (of dubbelklik start.bat)
Open dan: http://localhost:8181
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8181

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
    print('  (Druk Ctrl+C om te stoppen)\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server gestopt.')
