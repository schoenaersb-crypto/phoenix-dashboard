# python3 labo/resa-whatsapp/e2e-resa-wa.py
import http.server, threading, functools, os, sys, datetime, urllib.parse, subprocess, json
from zoneinfo import ZoneInfo
AUJ = datetime.datetime.now(ZoneInfo('Europe/Madrid')).date()
def prochain(wd, apres=1):
    d = AUJ + datetime.timedelta(days=apres)
    while d.weekday() != wd: d += datetime.timedelta(days=1)
    return d
MER = prochain(2).isoformat(); SAM = prochain(5); SAMI = SAM.isoformat(); SAMF = SAM.strftime('%d/%m/%Y')
HIER = (AUJ - datetime.timedelta(days=1)).isoformat(); A = AUJ.isoformat(); JEU = prochain(3).isoformat()
from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SORTIE', ICI)
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

# --- tests du module seul (node) ---
js = '''
var R=require('./resa-wa.js'),out={},A='%(A)s';
out.mer=R.estFerme('%(MER)s'); out.jeu=R.estFerme('%(JEU)s');
out.v=[R.verifier({date:'%(MER)s',service:'midi',heure:'13:00',personnes:2,nom:'A'},A),
 R.verifier({date:'%(HIER)s',service:'midi',heure:'13:00',personnes:2,nom:'A'},A),
 R.verifier({date:'%(JEU)s',service:'soir',heure:'13:00',personnes:2,nom:'A'},A),
 R.verifier({date:'%(JEU)s',service:'soir',heure:'20:00',personnes:0,nom:'A'},A),
 R.verifier({date:'%(JEU)s',service:'soir',heure:'20:00',personnes:31,nom:'A'},A),
 R.verifier({date:'%(JEU)s',service:'soir',heure:'20:00',personnes:4,nom:'   '},A),
 R.verifier({date:'%(JEU)s',service:'soir',heure:'20:00',personnes:4,nom:'Ana'},A),
 R.verifier({date:'',service:'soir',heure:'20:00',personnes:4,nom:'Ana'},A),
 R.verifier({date:'2026-11-17',service:'midi',heure:'13:00',personnes:4,nom:'Ana'},'2026-11-17','16:45'),
 R.verifier({date:'2026-11-17',service:'soir',heure:'20:00',personnes:4,nom:'Ana'},'2026-11-17','16:45')];
out.l=R.lien('nl',{date:'2026-11-21',service:'soir',heure:'20:30',personnes:6,nom:'Jan & Els 🎉\\nde Vries',note:'kinderstoel? #2'});
out.coupe=R.lien('fr',{date:'2026-11-21',service:'soir',heure:'20:30',personnes:2,nom:'x'.repeat(79)+'🎉🎉',note:''});
out.mad=R.maintenantMadrid(new Date('2026-11-17T23:30:00Z'));
console.log(JSON.stringify(out));''' % dict(A=A, MER=MER, JEU=JEU, HIER=HIER)
r = json.loads(subprocess.run(['node', '-e', js], cwd=ICI, capture_output=True, text=True).stdout)
vrai(r['mer'] and not r['jeu'], 'mercredi fermé, jeudi ouvert')
vrai(r['v'] == ['ferme', 'passe', 'heure', 'personnes', 'personnes', 'nom', '', 'date', 'tard', ''], 'contrôles ' + str(r['v']))
u = urllib.parse.urlparse(r['l']); txt = urllib.parse.parse_qs(u.query)['text'][0]
vrai(u.netloc == 'wa.me' and u.path == '/34744622975', 'numéro WhatsApp du restaurant')
vrai('zaterdag 21/11/2026 (diner)' in txt and 'Tijd : 20:30' in txt and 'Personen : 6' in txt, 'message NL complet')
vrai('Jan & Els 🎉 de Vries' in txt and 'kinderstoel? #2' in txt, 'caractères spéciaux (& # ? emoji, retour ligne) intacts')
vrai(txt.count('\n') == 6, 'retours à la ligne du message conservés seulement entre les rubriques')
vrai(('x' * 79 + '🎉') in urllib.parse.unquote(r['coupe']), 'nom trop long coupé sans casser un emoji')
vrai(r['mad'] == {'jour': '2026-11-18', 'heure': '00:30'}, 'date et heure prises à Madrid ' + str(r['mad']))

ATT = {'fr': ('Bonjour', 'samedi'), 'es': ('Hola', 'sábado'), 'en': ('Hello', 'Saturday'), 'nl': ('Hallo', 'zaterdag')}
with sync_playwright() as p:
    b = p.chromium.launch()
    for loc, nom in [('fr-FR', 'telephone'), ('nl-BE', 'nl-auto'), ('es-ES', 'sombre'), ('de-DE', 'allemand')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2 if nom == 'telephone' else 1,
                            is_mobile=True, has_touch=True, locale=loc, timezone_id='Europe/London' if nom == 'sombre' else 'Europe/Madrid',
                            color_scheme='dark' if nom == 'sombre' else 'light')
        pg = ctx.new_page(); err = []; partis = []
        pg.on('pageerror', lambda e: err.append(str(e)))
        pg.route('https://wa.me/**', lambda rt: (partis.append(rt.request.url), rt.fulfill(status=200, body='ok')))
        pg.goto(URL)
        vrai(pg.evaluate('document.documentElement.lang') == ('en' if loc.startswith('de') else loc[:2]), nom + ' : langue du téléphone détectée (anglais sinon)')
        vrai(pg.evaluate("document.getElementById('date').min") == A, nom + ' : date minimale = aujourd\'hui à Madrid')
        auj = pg.evaluate("document.getElementById('date').value")
        vrai(datetime.date.fromisoformat(auj).weekday() != 2, nom + ' : la date proposée n\'est jamais un mercredi')
        # mercredi refusé
        pg.fill('#date', MER); pg.dispatch_event('#date', 'change')
        vrai(pg.inner_text('#msg') != '', nom + ' : message mercredi fermé affiché dès le choix')
        pg.fill('#nom', 'Test'); pg.tap('#go'); pg.wait_for_timeout(200)
        vrai(not partis, nom + ' : rien ne part un mercredi')
        # nom vide refusé
        pg.fill('#date', SAMI); pg.dispatch_event('#date', 'change'); pg.fill('#nom', '')
        pg.tap('#go'); pg.wait_for_timeout(200)
        vrai(not partis and pg.inner_text('#msg') != '', nom + ' : nom obligatoire')
        # parcours complet chronométré, dans chaque langue
        for l in ['fr', 'es', 'en', 'nl']:
            partis.clear()
            pg.tap('#langs [data-l=%s]' % l)
            pg.fill('#date', SAMI); pg.dispatch_event('#date', 'change')
            pg.tap('#service [data-s=soir]'); pg.select_option('#heure', '21:00')
            pg.tap('#plus'); pg.tap('#plus')
            pg.fill('#nom', 'Ana López')
            pg.tap('#go'); pg.wait_for_timeout(400)
            vrai(len(partis) == 1, nom + ' ' + l + ' : WhatsApp s\'ouvre une fois')
            if partis:
                t = urllib.parse.parse_qs(urllib.parse.urlparse(partis[0]).query)['text'][0]
                a, j = ATT[l]
                vrai(t.startswith(a) and j in t and SAMF in t and '21:00' in t and ('%s : 4' % ({'fr':'Personnes','es':'Personas','en':'Guests','nl':'Personen'}[l])) in t and 'Ana López' in t,
                     nom + ' ' + l + ' : message complet (date, service, heure, personnes, nom) : ' + t.replace('\n', ' | '))
            pg.goto(URL)
        vrai(pg.evaluate('document.documentElement.scrollWidth') <= 390, nom + ' : pas de défilement horizontal')
        hs = pg.evaluate("[...document.querySelectorAll('button,input,select')].map(e=>e.getBoundingClientRect().height)")
        vrai(min(hs) >= 44, nom + ' : toutes les zones tactiles ≥ 44 px (%d)' % min(hs))
        if nom == 'telephone': pg.screenshot(path=os.path.join(OUT, 'capture-resa-wa.png'), full_page=True)
        vrai(not err, nom + ' : aucune erreur JS ' + str(err))
        ctx.close()
    b.close()
srv.shutdown()
print('%d vérifications réservation WhatsApp passées%s.' % (ok, (', %d ÉCHECS' % ko) if ko else ''))
sys.exit(1 if ko else 0)
