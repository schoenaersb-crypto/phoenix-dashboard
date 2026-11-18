# python3 labo/avis-qr/e2e-avis-qr.py
import http.server, threading, functools, os, sys, subprocess, tempfile, glob
import cv2, numpy as np
from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SORTIE', ICI)
LIEN = 'https://g.page/r/CaoMOaa9fX0KECA/review'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ICI))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
ok = ko = 0
def vrai(c, m):
    global ok, ko
    if c: ok += 1
    else: ko += 1; print('ÉCHEC :', m)
def decode_img(img):
    d = cv2.QRCodeDetector()
    r = d.detectAndDecodeMulti(img)
    return [t for t in (r[1] if r[0] else []) if t]

ATTENDU = {'fr': 'Votre avis compte', 'es': 'Su opinión cuenta', 'en': 'Your opinion matters', 'nl': 'Uw mening telt'}
with sync_playwright() as p:
    b = p.chromium.launch()
    for nom, opts in [('telephone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)),
                      ('petit', dict(viewport={'width': 320, 'height': 568}, is_mobile=True, has_touch=True)),
                      ('sombre', dict(viewport={'width': 390, 'height': 844}, color_scheme='dark'))]:
        pg = b.new_page(**opts)
        err = []
        pg.on('pageerror', lambda e: err.append(str(e)))
        pg.goto(URL)
        for l in ['fr', 'es', 'en', 'nl']:
            pg.tap('#langs [data-l=%s]' % l) if opts.get('has_touch') else pg.click('#langs [data-l=%s]' % l)
            pg.click('#montrer')
            vrai(pg.is_visible('#client'), nom + ' ' + l + ' : écran client ouvert en 2 appuis')
            vrai(pg.inner_text('#ct1') == ATTENDU[l], nom + ' ' + l + ' : texte dans la langue')
            vrai(pg.evaluate('document.documentElement.lang') == l, nom + ' ' + l + ' : attribut lang')
            png = pg.locator('#cqr svg').screenshot()
            txt = cv2.QRCodeDetector().detectAndDecode(cv2.imdecode(np.frombuffer(png, np.uint8), 1))[0]
            vrai(txt == LIEN, nom + ' ' + l + ' : QR = lien d\'avis (' + txt + ')')
            box = pg.locator('#cqr svg').bounding_box()
            vrai(box['width'] >= 200, nom + ' ' + l + ' : QR assez grand (%d px)' % box['width'])
            if nom == 'telephone' and l == 'es': pg.screenshot(path=os.path.join(OUT, 'capture-avis-client.png'))
            pg.click('#fermer')
            vrai(not pg.is_visible('#client'), nom + ' ' + l + ' : fermeture')
        vrai(pg.evaluate('document.documentElement.scrollWidth') <= opts['viewport']['width'], nom + ' : pas de défilement horizontal')
        if nom == 'telephone': pg.screenshot(path=os.path.join(OUT, 'capture-avis-equipe.png'))
        vrai(not err, nom + ' : aucune erreur JS ' + str(err))
        if nom == 'telephone':
            # chevalets : PDF A4, 4 QR lisibles
            pdf = os.path.join(tempfile.mkdtemp(), 'chevalets.pdf')
            pg.emulate_media(media='print')
            pg.pdf(path=pdf, format='A4', print_background=True, prefer_css_page_size=True)
            subprocess.run(['pdftoppm', '-r', '150', '-png', pdf, pdf[:-4]], check=True)
            pages = sorted(glob.glob(pdf[:-4] + '*.png'))
            vrai(len(pages) == 1, 'chevalets : une seule page A4 (%d)' % len(pages))
            img = cv2.imread(pages[0])
            h, w = img.shape[:2]
            lus = []
            for y in range(2):
                for x in range(2):
                    q = img[y*h//2:(y+1)*h//2, x*w//2:(x+1)*w//2]
                    t = cv2.QRCodeDetector().detectAndDecode(q)[0]
                    lus.append(t)
            vrai(lus.count(LIEN) == 4, 'chevalets : 4 QR lisibles à 150 dpi ' + str(lus))
            txt = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
            vrai(all(v in txt for v in ATTENDU.values()), 'chevalets : 4 langues imprimées')
            cv2.imwrite(os.path.join(OUT, 'capture-chevalets.png'), cv2.resize(img, (w//2, h//2)))
        pg.close()
    # paysage : le QR reste entier dans l'écran
    pg = b.new_page(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
    pg.goto(URL); pg.tap('#montrer')
    bb = pg.locator('#cqr svg').bounding_box()
    vrai(bb['y'] >= 0 and bb['y'] + bb['height'] <= 390, 'paysage : QR entier à l\'écran (%d..%d)' % (bb['y'], bb['y'] + bb['height']))
    png = pg.locator('#cqr svg').screenshot()
    vrai(cv2.QRCodeDetector().detectAndDecode(cv2.imdecode(np.frombuffer(png, np.uint8), 1))[0] == LIEN, 'paysage : QR lisible')
    pg.keyboard.press('Escape'); vrai(not pg.is_visible('#client'), 'Échap ferme l\'écran client')
    vrai(pg.get_attribute('#langs [data-l=fr]', 'aria-pressed') == 'true', 'langue choisie annoncée (aria-pressed)')
    pg.close()
    # hors ligne : la page fonctionne sans internet (seules les polices manquent)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg.route('https://fonts.gstatic.com/**', lambda r: r.abort())
    pg.goto(URL); pg.click('#montrer')
    png = pg.locator('#cqr svg').screenshot()
    vrai(cv2.QRCodeDetector().detectAndDecode(cv2.imdecode(np.frombuffer(png, np.uint8), 1))[0] == LIEN, 'sans réseau : QR toujours affiché')
    b.close()
srv.shutdown()
print('%d vérifications avis QR passées%s.' % (ok, (', %d ÉCHECS' % ko) if ko else ''))
sys.exit(1 if ko else 0)
