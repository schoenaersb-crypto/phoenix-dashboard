#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phoenix Relais — le petit serveur du PC du restaurant.

Ce qu'il fait :
  1. Il sert la caisse sur le wifi du restaurant :  http://<IP-du-PC>:8080/caisse.html
     (la page vient de GitHub, elle est gardee en copie si internet tombe).
  2. Il imprime : la caisse lui envoie chaque bon (cuisine, bar, ticket client)
     et il l'envoie a la bonne imprimante (reseau ou USB branchee sur ce PC).
  3. Il partage les tables entre toutes les tablettes et telephones.
  4. Page de reglage : http://<IP-du-PC>:8080/reglages  (choisir quelle
     imprimante fait cuisine / bar / caisse, et imprimer un test).

Aucune bibliotheque a installer : Python 3.8+ suffit.
"""
import json, os, socket, sys, threading, time, ipaddress, urllib.request, html, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = 8080
SITE = 'https://schoenaersb-crypto.github.io/phoenix-dashboard'
ICI = os.path.dirname(os.path.abspath(sys.argv[0] if getattr(sys, 'frozen', False) else __file__))
DOSSIER = os.path.join(ICI, 'donnees')
os.makedirs(DOSSIER, exist_ok=True)
F_REGLAGES = os.path.join(DOSSIER, 'reglages.json')
F_ETAT = os.path.join(DOSSIER, 'etat-caisse.json')
F_JOURNAL = os.path.join(DOSSIER, 'journal.txt')
VERROU = threading.RLock()


def log(*a):
    ligne = time.strftime('%d/%m %H:%M:%S ') + ' '.join(str(x) for x in a)
    print(ligne, flush=True)
    try:
        with open(F_JOURNAL, 'a', encoding='utf-8') as f:
            f.write(ligne + '\n')
    except Exception:
        pass


def lit_json(chemin, defaut):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return defaut


def ecrit_json(chemin, obj):
    tmp = chemin + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, chemin)


# ───────────────────────────── réglages ─────────────────────────────
# Une imprimante s'écrit "reseau:192.168.1.50" (port 9100) ou "windows:Nom de l'imprimante".
REGLAGES = lit_json(F_REGLAGES, {})
REGLAGES.setdefault('cuisine', '')
REGLAGES.setdefault('bar', '')
REGLAGES.setdefault('caisse', '')
REGLAGES.setdefault('largeur', 42)


def sauve_reglages():
    with VERROU:
        ecrit_json(F_REGLAGES, REGLAGES)


# ───────────────────────────── impression ─────────────────────────────
ESC, GS = b'\x1b', b'\x1d'
REMPLACE = str.maketrans({'\u2014': '-', '\u2013': '-', '\u2019': "'", '\u2018': "'", '\u201c': '"',
                          '\u201d': '"', '\u2026': '...', '\u00a0': ' ', '\u202f': ' ', '\u2022': '*'})


def en_escpos(texte, tiroir=False):
    """Texte de la caisse -> octets ESC/POS. \x01 en tête de ligne = double
    hauteur et largeur, \x02 = double hauteur. Page de code PC858 (accents + €)."""
    out = bytearray(ESC + b'@' + ESC + b't\x13')
    lignes = texte.split('\n')
    vide = not texte.strip()
    if tiroir or vide:
        out += ESC + b'p\x00\x19\xfa'      # impulsion tiroir-caisse
        if vide:
            return bytes(out)
    for l in lignes:
        taille = b'\x00'
        if l.startswith('\x01'):
            taille, l = b'\x11', l[1:]
        elif l.startswith('\x02'):
            taille, l = b'\x01', l[1:]
        if taille != b'\x00':
            out += GS + b'!' + taille + ESC + b'E\x01'
        l = l.translate(REMPLACE)
        out += l.encode('cp858', errors='replace') + b'\n'
        if taille != b'\x00':
            out += GS + b'!\x00' + ESC + b'E\x00'
    out += b'\n' * 5 + GS + b'V\x42\x00'   # avance puis coupe
    return bytes(out)


def envoie_reseau(ip, data, port=9100):
    with socket.create_connection((ip, port), timeout=6) as s:
        s.sendall(data)


def imprimantes_windows():
    if os.name != 'nt':
        return []
    try:
        import ctypes
        from ctypes import wintypes
        winspool = ctypes.WinDLL('winspool.drv')
        flags = 2 | 4  # LOCAL | CONNECTIONS
        besoin, nb = wintypes.DWORD(), wintypes.DWORD()
        winspool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(besoin), ctypes.byref(nb))
        buf = ctypes.create_string_buffer(besoin.value)

        class PI4(ctypes.Structure):
            _fields_ = [('pPrinterName', wintypes.LPWSTR), ('pServerName', wintypes.LPWSTR),
                        ('Attributes', wintypes.DWORD)]
        if not winspool.EnumPrintersW(flags, None, 4, buf, besoin, ctypes.byref(besoin), ctypes.byref(nb)):
            return []
        tab = ctypes.cast(buf, ctypes.POINTER(PI4))
        return [tab[i].pPrinterName for i in range(nb.value)]
    except Exception as e:
        log('liste imprimantes Windows impossible :', e)
        return []


def envoie_windows(nom, data):
    import ctypes
    from ctypes import wintypes
    winspool = ctypes.WinDLL('winspool.drv')

    class DOCINFO(ctypes.Structure):
        _fields_ = [('pDocName', wintypes.LPWSTR), ('pOutputFile', wintypes.LPWSTR),
                    ('pDatatype', wintypes.LPWSTR)]
    h = wintypes.HANDLE()
    if not winspool.OpenPrinterW(nom, ctypes.byref(h), None):
        raise OSError('imprimante Windows introuvable : ' + nom)
    try:
        di = DOCINFO('Phoenix', None, 'RAW')
        if not winspool.StartDocPrinterW(h, 1, ctypes.byref(di)):
            raise OSError('StartDocPrinter refuse')
        winspool.StartPagePrinter(h)
        ecrit = wintypes.DWORD()
        winspool.WritePrinter(h, data, len(data), ctypes.byref(ecrit))
        winspool.EndPagePrinter(h)
        winspool.EndDocPrinter(h)
    finally:
        winspool.ClosePrinter(h)


def cible_de(dest):
    """cuisine / bar / caisse -> chaîne d'imprimante. Une destination vide
    retombe sur une autre pour ne jamais perdre un bon."""
    for d in (dest, 'caisse', 'bar', 'cuisine'):
        c = (REGLAGES.get(d) or '').strip()
        if c and not c.startswith('='):
            return c
        if c.startswith('='):
            return cible_de(c[1:])
    return ''


def imprime(dest, texte):
    cible = cible_de(dest)
    if not cible:
        raise OSError('aucune imprimante reglee (ouvrir /reglages)')
    data = en_escpos(texte)
    genre, _, adr = cible.partition(':')
    if genre == 'reseau':
        hote, _, port = adr.partition(':')
        envoie_reseau(hote, data, int(port or 9100))
    elif genre == 'windows':
        envoie_windows(adr, data)
    else:
        raise OSError('imprimante mal reglee : ' + cible)
    log('imprime', dest, '->', cible, len(data), 'octets')


def mon_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return socket.gethostbyname(socket.gethostname())


def cherche_imprimantes_reseau():
    """Balaye le réseau local (port 9100, ce qu'utilisent les imprimantes tickets)."""
    ip = mon_ip()
    reseau = ipaddress.ip_network(ip + '/24', strict=False)
    trouvees, fils = [], []

    def essaie(h):
        try:
            with socket.create_connection((str(h), 9100), timeout=0.6):
                trouvees.append(str(h))
        except Exception:
            pass
    for h in reseau.hosts():
        if str(h) == ip:
            continue
        t = threading.Thread(target=essaie, args=(h,), daemon=True)
        t.start()
        fils.append(t)
    for t in fils:
        t.join()
    return sorted(trouvees, key=lambda x: int(x.split('.')[-1]))


# ───────────────────────────── partage des tables ─────────────────────────────
def etat_vide(gen=0, jour=''):
    return {'v': 1, 'gen': gen, 'jour': jour, 'tables': {}, 'tombes': {}, 'tickets': [],
            'ventes': [], 'journal': [], 'rupture': {}, 'ruptureTs': 0}


ETAT = lit_json(F_ETAT, None) or etat_vide()


def sauve_etat():
    ecrit_json(F_ETAT, ETAT)


def applique_maj(d):
    with VERROU:
        avant = json.dumps(ETAT, sort_keys=True)
        if d.get('z'):
            ETAT.clear()
            ETAT.update(etat_vide(gen=int(time.time()), jour=''))
            ETAT['v'] = int(time.time() * 1000) % 1000000000
            sauve_etat()
            return {'v': ETAT['v'], 'gen': ETAT['gen']}
        jour = d.get('jour') or ''
        occupe = ETAT['ventes'] or ETAT['tables']
        if jour and ETAT['jour'] and jour != ETAT['jour'] and occupe:
            return {'v': ETAT['v'], 'gen': ETAT['gen']}   # autre journée : refus
        if jour and not ETAT['jour']:
            ETAT['jour'] = jour
        for ref, t in (d.get('tables') or {}).items():
            loc = ETAT['tables'].get(ref)
            tombe = ETAT['tombes'].get(ref, 0)
            mod = t.get('mod') or 0
            if tombe and tombe >= max(t.get('ts') or 0, mod):
                continue
            if not loc or mod >= (loc.get('mod') or 0):
                ETAT['tables'][ref] = t
        for ref, ts in (d.get('supprime') or {}).items():
            ETAT['tables'].pop(ref, None)
            ETAT['tombes'][ref] = max(ts or 0, ETAT['tombes'].get(ref, 0))
        ids = {k.get('id') for k in ETAT['tickets']}
        for k in d.get('tickets') or []:
            if k.get('id') not in ids:
                ETAT['tickets'].append(k)
                ids.add(k.get('id'))
        fait = set(d.get('ticketsFait') or [])
        for k in ETAT['tickets']:
            if k.get('id') in fait:
                k['fait'] = True
        nos = {v.get('no') for v in ETAT['ventes']}
        for v in d.get('ventes') or []:
            if v.get('no') not in nos:
                ETAT['ventes'].append(v)
                nos.add(v.get('no'))
        cles = {'|'.join(str(e.get(c, '')) for c in ('ts', 'qui', 'type', 'detail', 'montant')) for e in ETAT['journal']}
        for e in d.get('journal') or []:
            c = '|'.join(str(e.get(x, '')) for x in ('ts', 'qui', 'type', 'detail', 'montant'))
            if c not in cles:
                ETAT['journal'].append(e)
                cles.add(c)
        r = d.get('rupture')
        if r and (r.get('ts') or 0) > (ETAT.get('ruptureTs') or 0):
            ETAT['rupture'] = r.get('map') or {}
            ETAT['ruptureTs'] = r.get('ts')
        if len(ETAT['tickets']) > 400:
            ETAT['tickets'] = [k for k in ETAT['tickets'] if not k.get('fait')][-400:]
        if json.dumps({k: v for k, v in ETAT.items() if k != 'v'}, sort_keys=True) != \
           json.dumps({k: v for k, v in json.loads(avant).items() if k != 'v'}, sort_keys=True):
            ETAT['v'] += 1
            sauve_etat()
        return {'v': ETAT['v'], 'gen': ETAT['gen']}


# ───────────────────────────── pages de l'appli (copie de GitHub) ─────────────────────────────
CACHE = os.path.join(DOSSIER, 'appli')
os.makedirs(CACHE, exist_ok=True)
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png',
         '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.json': 'application/json',
         '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'}


def page_appli(chemin):
    nom = re.sub(r'[^A-Za-z0-9._-]', '', chemin.strip('/').split('?')[0]) or 'caisse.html'
    local = os.path.join(CACHE, nom)
    try:
        req = urllib.request.Request(SITE + '/' + nom + '?t=' + str(int(time.time() // 60)),
                                     headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=4) as r:
            data = r.read()
        with open(local, 'wb') as f:
            f.write(data)
    except Exception:
        if not os.path.exists(local):
            return None, None
        with open(local, 'rb') as f:
            data = f.read()
    return data, TYPES.get(os.path.splitext(nom)[1], 'application/octet-stream')


# ───────────────────────────── page de réglage ─────────────────────────────
def page_reglages(msg=''):
    reseau = getattr(page_reglages, 'reseau', [])
    win = imprimantes_windows()
    choix = [('', '— aucune —')] + [('reseau:' + ip, 'Réseau ' + ip) for ip in reseau] + \
            [('windows:' + n, 'Sur ce PC : ' + n) for n in win]
    actuels = {REGLAGES.get(d) for d in ('cuisine', 'bar', 'caisse')}
    for a in actuels:
        if a and a not in [c[0] for c in choix]:
            choix.append((a, a))

    def select(dest):
        opts = ''.join('<option value="%s"%s>%s</option>' % (html.escape(v), ' selected' if REGLAGES.get(dest) == v else '',
                                                             html.escape(t)) for v, t in choix)
        return ('<div class="l"><b>%s</b><select name="%s">%s</select>'
                '<button name="test" value="%s">Test</button></div>') % (dest.capitalize(), dest, opts, dest)
    ip = mon_ip()
    return ('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">'
            '<title>Phoenix Relais</title><style>body{font-family:Arial;margin:18px;max-width:640px;color:#16364A}'
            'h1{color:#8a6d2f}.l{display:flex;gap:8px;align-items:center;margin:10px 0}.l b{width:80px}'
            'select{flex:1;padding:10px;font-size:16px}button{padding:10px 14px;font-size:16px}'
            '.m{background:#f6f0e4;padding:10px;border-radius:8px}.big{font-size:20px}</style>'
            '<h1>Phoenix Relais</h1>'
            '<p class="m big">Caisse à ouvrir sur les tablettes :<br><b>http://%s:%d/caisse.html</b></p>'
            '%s<form method=post action="/reglages">%s%s%s'
            '<p><button name="enregistrer" value="1" class="big">Enregistrer</button> '
            '<button name="chercher" value="1">Chercher les imprimantes réseau</button></p></form>'
            '<p style="color:#777">Imprimantes réseau trouvées : %s. Imprimantes de ce PC : %s.</p>'
            ) % (ip, PORT, ('<p class="m">%s</p>' % html.escape(msg)) if msg else '', select('cuisine'), select('bar'),
                 select('caisse'), ', '.join(reseau) or 'aucune (cliquer « Chercher »)', ', '.join(win) or 'aucune')


# ───────────────────────────── serveur ─────────────────────────────
class Gestion(BaseHTTPRequestHandler):
    server_version = 'PhoenixRelais/1.0'

    def log_message(self, *a):
        pass

    def entetes(self, code, typ, n):
        self.send_response(code)
        self.send_header('Content-Type', typ)
        self.send_header('Content-Length', str(n))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.entetes(code, 'application/json; charset=utf-8', len(b))
        self.wfile.write(b)

    def html(self, s):
        b = s.encode('utf-8')
        self.entetes(200, 'text/html; charset=utf-8', len(b))
        self.wfile.write(b)

    def corps(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n).decode('utf-8', errors='replace') if n else ''

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/sync/version':
            return self.json({'v': ETAT['v'], 'gen': ETAT['gen']})
        if p == '/sync/etat':
            with VERROU:
                return self.json(ETAT)
        if p in ('/reglages', '/reglages/'):
            return self.html(page_reglages())
        if p == '/sante':
            return self.json({'ok': True, 'imprimantes': {d: cible_de(d) for d in ('cuisine', 'bar', 'caisse')}})
        if p == '/':
            self.send_response(302)
            self.send_header('Location', '/caisse.html')
            self.end_headers()
            return
        data, typ = page_appli(p)
        if data is None:
            return self.json({'erreur': 'introuvable'}, 404)
        self.entetes(200, typ, len(data))
        self.wfile.write(data)

    def do_POST(self):
        p = self.path.split('?')[0]
        brut = self.corps()
        if p == '/imprime':
            try:
                d = json.loads(brut or '{}')
                imprime(d.get('dest') or 'caisse', d.get('texte') or '')
                return self.json({'ok': True})
            except Exception as e:
                log('ECHEC impression :', e)
                return self.json({'ok': False, 'erreur': str(e)}, 502)
        if p == '/sync/maj':
            try:
                return self.json(applique_maj(json.loads(brut or '{}')))
            except Exception as e:
                log('ECHEC sync :', e)
                return self.json({'erreur': str(e)}, 400)
        if p == '/reglages':
            from urllib.parse import parse_qs
            f = {k: v[0] for k, v in parse_qs(brut, keep_blank_values=True).items()}
            msg = ''
            if 'chercher' in f:
                page_reglages.reseau = cherche_imprimantes_reseau()
                msg = 'Recherche terminée : %d imprimante(s) réseau.' % len(page_reglages.reseau)
            else:
                for d in ('cuisine', 'bar', 'caisse'):
                    if d in f:
                        REGLAGES[d] = f[d]
                sauve_reglages()
                msg = 'Enregistré.'
                if 'test' in f:
                    dest = f['test']
                    try:
                        imprime(dest, '\x01  TEST ' + dest.upper() + '\n' + '-' * 42 + '\nBrasserie Phoenix\nCe bon doit sortir sur : ' +
                                dest + '\nAccents : é è à ç ñ — 12,50 €\n' + time.strftime('%d/%m/%Y %H:%M'))
                        msg = 'Test envoyé à ' + dest + ' (' + cible_de(dest) + ').'
                    except Exception as e:
                        msg = 'Le test a échoué : ' + str(e)
            return self.html(page_reglages(msg))
        self.json({'erreur': 'inconnu'}, 404)


def main():
    ip = mon_ip()
    log('Phoenix Relais demarre — caisse : http://%s:%d/caisse.html  — reglages : http://%s:%d/reglages' % (ip, PORT, ip, PORT))
    if not any(REGLAGES.get(d) for d in ('cuisine', 'bar', 'caisse')):
        log('Aucune imprimante reglee : recherche sur le reseau...')
        page_reglages.reseau = cherche_imprimantes_reseau()
        log('Imprimantes reseau trouvees :', page_reglages.reseau or 'aucune', '| sur ce PC :', imprimantes_windows() or 'aucune')
    try:
        srv = ThreadingHTTPServer(('0.0.0.0', PORT), Gestion)
    except OSError:
        log('Le port %d est deja pris : Phoenix Relais tourne deja.' % PORT)
        return
    srv.serve_forever()


if __name__ == '__main__':
    main()
