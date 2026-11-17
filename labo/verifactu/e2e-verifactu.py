# python3 labo/verifactu/e2e-verifactu.py  (depuis la racine du dépôt)
import http.server, threading, functools, os, sys, re, time
import cv2, numpy as np
from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SORTIE', ICI)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ICI))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
ok = ko = 0
def vrai(c, m):
    global ok, ko
    if c: ok += 1
    else: ko += 1; print('ÉCHEC :', m)

def decode(png):
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    txt, pts, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return txt

with sync_playwright() as p:
    b = p.chromium.launch()
    for nom, opts in [('telephone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)),
                      ('sombre', dict(viewport={'width': 390, 'height': 844}, color_scheme='dark'))]:
        pg = b.new_page(**opts)
        erreurs = []
        pg.on('pageerror', lambda e: erreurs.append(str(e)))
        pg.on('console', lambda m: erreurs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL)
        t0 = time.time()
        for i in range(3):
            pg.click('#encaisser'); pg.wait_for_function('document.getElementById("nb").textContent == "%d"' % (i + 1))
        vrai(time.time() - t0 < 5, nom + ' : 3 tickets en moins de 5 s')
        vrai('Chaîne intacte (3' in pg.inner_text('#etat'), nom + ' : chaîne intacte')
        vrai(re.fullmatch(r'[0-9A-F]{64}', pg.inner_text('#huella')) is not None, nom + ' : empreinte 64 hex')
        vrai('LABO-000003' in pg.inner_text('#ticket'), nom + ' : numéro LABO-000003')
        txt = decode(pg.locator('.qr svg').screenshot())
        vrai(txt.startswith('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=LABO-000003&fecha='), nom + ' : QR lisible et bonne adresse (' + txt + ')')
        larg = pg.evaluate('document.documentElement.scrollWidth')
        vrai(larg <= 390, nom + ' : pas de défilement horizontal (%d)' % larg)
        h = pg.evaluate('document.getElementById("encaisser").getBoundingClientRect().height')
        vrai(h >= 48, nom + ' : bouton assez grand pour un doigt (%d px)' % h)
        if nom == 'telephone': pg.screenshot(path=os.path.join(OUT, 'capture-verifactu.png'), full_page=True)
        pg.click('#falsifier'); pg.wait_for_timeout(300)
        vrai('Chaîne cassée' in pg.inner_text('#etat'), nom + ' : modification détectée')
        # page ouverte en http sur une adresse du réseau : message clair, pas de bouton muet
        pg.evaluate('Object.defineProperty(window.crypto, "subtle", {value: undefined})')
        pg.click('#encaisser'); pg.wait_for_timeout(300)
        vrai('https' in pg.inner_text('#etat'), nom + ' : sans WebCrypto, message clair (' + pg.inner_text('#etat') + ')')
        vrai(not pg.is_disabled('#encaisser'), nom + ' : bouton réutilisable après erreur')
        vrai(not erreurs, nom + ' : aucune erreur JS ' + str(erreurs))
        pg.close()
    b.close()
srv.shutdown()
print('%d vérifications page Verifactu passées%s.' % (ok, (', %d ÉCHECS' % ko) if ko else ''))
sys.exit(1 if ko else 0)
