# python3 labo/resa-whatsapp/e2e-reserver-secours.py
# reserver.html : secours WhatsApp quand le serveur est injoignable (chantier t17tqls4y0).
# Aucun appel ne part vers le vrai backend : script.google.com est intercepté, sendBeacon neutralisé.
import http.server, threading, functools, os, json, urllib.parse, datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

DEPOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=DEPOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/reserver.html' % srv.server_address[1]

ok = ko = 0
def vrai(c, m):
    global ok, ko
    if c: ok += 1
    else: ko += 1; print('ÉCHEC :', m)

def prochain(jour_semaine, apres=1):
    d = datetime.datetime.now(ZoneInfo('Europe/Madrid')).date() + datetime.timedelta(days=apres)
    while d.weekday() != jour_semaine: d += datetime.timedelta(days=1)
    return d.isoformat()
JEUDI = prochain(3)       # weekday 3 = jeudi
MERCREDI = prochain(2)    # weekday 2 = mercredi

with sync_playwright() as p:
    b = p.chromium.launch()
    mode = {'v': 'panne'}
    appels = []
    def route(r):
        appels.append(r.request.post_data or '')
        if mode['v'] == 'panne': r.abort()
        elif mode['v'] == 'refus': r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': False, 'error': 'Complet ce soir-là'}))
        else: r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'message': 'Réservation notée'}))
    for nom, opts in [('telephone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)),
                      ('ordinateur', dict(viewport={'width': 1200, 'height': 900}))]:
        ctx = b.new_context(**opts)
        ctx.add_init_script('navigator.sendBeacon = function(){ return true; };')
        ctx.route('**/script.google.com/**', route)
        ctx.route('**/script.googleusercontent.com/**', route)
        pg = ctx.new_page()
        err = []
        pg.on('pageerror', lambda e: err.append(str(e)))
        pg.goto(URL)
        vrai(pg.evaluate('typeof ResaWA') == 'object', nom + ' : module resa-wa chargé')
        vrai(not pg.is_visible('#wa'), nom + ' : pas de bouton WhatsApp au départ')

        def attente(js, ms=5000):
            import time
            fin = time.time() + ms / 1000
            while time.time() < fin:
                if pg.evaluate(js): return True
                time.sleep(0.05)
            return False

        def remplir(date, nomc='Martine Dupont', heure='20:30', service='soir', plus=2):
            pg.fill('#date', date)
            pg.click('#service [data-s=%s]' % service)
            pg.select_option('#heure', heure)
            pg.fill('#nom', nomc)
            pg.fill('#note', 'Terrasse si possible')
            for _ in range(plus): pg.click('#plus')

        # 1. serveur injoignable -> bouton WhatsApp avec la demande complète
        mode['v'] = 'panne'
        remplir(JEUDI)
        pg.click('#send')
        pg.wait_for_selector('#wa:not(.hidden)', timeout=5000)
        vrai(pg.is_visible('#wa'), nom + ' : panne -> bouton WhatsApp visible')
        href = pg.get_attribute('#wa', 'href')
        vrai(href.startswith('https://wa.me/34744622975?text='), nom + ' : lien wa.me du restaurant')
        txt = urllib.parse.unquote(href.split('text=', 1)[1])
        y, m, d = JEUDI.split('-')
        vrai('Brasserie Phoenix' in txt, nom + ' : nom du restaurant')
        vrai('%s/%s/%s' % (d, m, y) in txt, nom + ' : date dans le message')
        vrai('20:30' in txt, nom + ' : heure dans le message')
        vrai('Personnes : 4' in txt, nom + ' : 4 personnes dans le message')
        vrai('Martine Dupont' in txt, nom + ' : nom du client')
        vrai('Terrasse si possible' in txt, nom + ' : remarque')
        vrai('WhatsApp' in pg.inner_text('#msg'), nom + ' : message d\'erreur propose WhatsApp')
        vrai(not pg.is_disabled('#send'), nom + ' : bouton Réserver de nouveau utilisable')

        # 2. le lien est recalculé à l'appui (nom corrigé après l'échec)
        pg.fill('#nom', 'Jan Peeters')
        pg.evaluate("document.getElementById('wa').addEventListener('click', function(e){ window.__href = this.href; e.preventDefault(); })")
        pg.click('#wa')
        h2 = urllib.parse.unquote(pg.evaluate('window.__href') or '')
        vrai('Jan Peeters' in h2 and 'Martine Dupont' not in h2, nom + ' : lien recalculé avec le nom corrigé')

        # 3. langue ES
        pg.click('.langs [data-l=es]')
        vrai(pg.inner_text('#wa') == 'Enviar mi solicitud por WhatsApp', nom + ' : bouton traduit ES')
        pg.click('#send')
        pg.wait_for_selector('#wa:not(.hidden)', timeout=5000)
        txt = urllib.parse.unquote(pg.get_attribute('#wa', 'href').split('text=', 1)[1])
        vrai('Hola, quisiera reservar' in txt, nom + ' : message WhatsApp en espagnol')
        pg.click('.langs [data-l=fr]')

        # 4. mercredi -> jamais de WhatsApp
        pg.fill('#date', MERCREDI)
        pg.click('#send')
        attente("document.getElementById('send').disabled === false && document.getElementById('msg').textContent.indexOf('…') < 0")
        vrai(not pg.is_visible('#wa'), nom + ' : mercredi -> pas de bouton WhatsApp')

        # 5. le serveur refuse (complet) -> sa réponse, pas de WhatsApp
        pg.fill('#date', JEUDI)
        mode['v'] = 'refus'
        pg.click('#send')
        vrai(attente("document.getElementById('msg').textContent.indexOf('Complet') >= 0"), nom + ' : refus du serveur affiché')
        vrai(not pg.is_visible('#wa'), nom + ' : refus du serveur -> pas de bouton WhatsApp')

        # 6. envoi réussi -> écran merci, pas de bouton
        mode['v'] = 'ok'
        pg.click('#send')
        pg.wait_for_selector('#done:not(.hidden)', timeout=5000)
        vrai(pg.is_visible('#done'), nom + ' : succès -> écran merci')
        vrai(not pg.is_visible('#wa'), nom + ' : succès -> pas de bouton WhatsApp')
        vrai(err == [], nom + ' : aucune erreur JS ' + repr(err))
        ctx.close()
    b.close()
print('%d vérifications secours WhatsApp passées.' % ok if not ko else '%d ÉCHEC(S), %d OK' % (ko, ok))
raise SystemExit(1 if ko else 0)
