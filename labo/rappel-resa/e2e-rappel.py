"""python3 labo/rappel-resa/e2e-rappel.py — page Rappels de réservation (Playwright)."""
import os, sys, urllib.parse
from playwright.sync_api import sync_playwright
ICI = os.path.dirname(os.path.abspath(__file__))
URL = 'file://' + os.path.join(ICI, 'index.html')
n = ko = 0
def ok(c, m):
    global n, ko
    n += 1
    if not c: ko += 1; print('ÉCHEC', m)

def ouvrir(b, date, **kw):
    ctx = b.new_context(**kw)
    ctx.route('**/*', lambda r: r.abort() if not r.request.url.startswith('file://') else r.continue_())
    p = ctx.new_page(); erreurs = []
    p.on('pageerror', lambda e: erreurs.append(str(e)))
    p.goto(URL + ('?date=' + date if date else '')); p.wait_for_selector('#resume')
    return ctx, p, erreurs

def deborde(p):
    return p.evaluate("""() => { const W = document.documentElement.clientWidth; let bad = [];
      document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push(e.tagName + '.' + e.className); });
      return {bad, sw: document.documentElement.scrollWidth, W}; }""")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 1. Vendredi 27/11 sur iPhone 13 -> samedi 28
    ctx, p, err = ouvrir(b, '2026-11-27', **pw.devices['iPhone 13'])
    ok(not err, 'erreurs JS ' + str(err))
    ok('samedi 28/11' in p.inner_text('#sous'), 'sous-titre samedi')
    ok(p.locator('.carte').count() == 8, 'cartes %d' % p.locator('.carte').count())
    ok('0/4' in p.inner_text('#resume'), 'résumé 0/4 : ' + p.inner_text('#resume'))
    heures = p.locator('.heure').all_inner_texts(); ok(heures == sorted(heures), 'tri ' + str(heures))
    d = deborde(p); ok(not d['bad'] and d['sw'] <= d['W'], 'débordement iPhone ' + str(d))
    # boutons : taille tactile
    for bt in p.locator('a.go, .langs button').all():
        bb = bt.bounding_box(); ok(bb['height'] >= 44, 'zone tactile %s' % bb)
    # carte à valider : pas de bouton
    a = p.locator('.carte', has_text='Client A'); ok(a.locator('a.go').count() == 0 and 'Pas encore validée' in a.inner_text(), 'à valider sans bouton')
    # numéro incomplet
    may = p.locator('.carte', has_text='May'); ok(may.locator('a.go').count() == 0 and '470000004' in may.inner_text() and '+32' in may.inner_text(), 'numéro incomplet expliqué')
    ok('ligne 18' in p.inner_text('#illisibles') and 'Client L' in p.inner_text('#illisibles'), 'ligne illisible signalée')
    ok(p.locator('.langs button[aria-pressed="true"]').count() == 4, 'aria-pressed')
    h = p.locator('.carte', has_text='Client H'); ok('notre propre adresse' in h.inner_text(), 'notre adresse écartée')
    # Durand : NL par défaut puis FR d'un appui
    dur = p.locator('.carte', has_text='Durand')
    ok(dur.locator('.langs button.on').inner_text() == 'NL', 'langue NL par défaut')
    href = dur.locator('a.go').get_attribute('href'); ok(href.startswith('https://wa.me/32470000002?text='), href)
    ok('morgen, zaterdag 28 november om 12:00' in urllib.parse.unquote(href), 'texte NL')
    dur.locator('.langs button', has_text='FR').tap()
    href = p.locator('.carte', has_text='Durand').locator('a.go').get_attribute('href')
    ok('demain, samedi 28 novembre à 12:00 pour 2 personnes' in urllib.parse.unquote(href), 'texte FR après appui')
    ok('demain, samedi' in p.locator('.carte', has_text='Durand').locator('.apercu').inner_text(), 'aperçu à jour')
    for l, mot in (('ES', 'mañana'), ('EN', 'tomorrow')):
        p.locator('.carte', has_text='Durand').locator('.langs button', has_text=l).tap()
        ok(mot in urllib.parse.unquote(p.locator('.carte', has_text='Durand').locator('a.go').get_attribute('href')), 'langue ' + l)
    # e-mail
    g = p.locator('.carte', has_text='Client G'); gh = g.locator('a.go').get_attribute('href')
    ok(gh.startswith('mailto:client.g@example.com?subject='), gh)
    # envoi : popup wa.me (bloqué réseau) puis marqué envoyé
    with ctx.expect_page() as pop:
        p.locator('.carte', has_text='Durand').locator('a.go').tap()
    pop.value.close()
    p.wait_for_timeout(500)
    ok('Rappel envoyé' in p.locator('.carte', has_text='Durand').inner_text(), 'marqué envoyé')
    ok('1/4' in p.inner_text('#resume'), 'résumé 1/4')
    p.reload(); p.wait_for_selector('#resume')
    ok('Rappel envoyé' in p.locator('.carte', has_text='Durand').inner_text(), 'envoyé gardé après rechargement')
    p.locator('.carte', has_text='Durand').locator('.defaire').tap()
    ok(p.locator('.carte', has_text='Durand').locator('a.go').count() == 1 and '0/4' in p.inner_text('#resume'), 'annuler envoyé')
    p.screenshot(path=os.path.join(ICI, 'capture-rappel.png'), full_page=False)
    ctx.close()
    # 2. 320 px + sombre
    ctx, p, err = ouvrir(b, '2026-11-27', viewport={'width': 320, 'height': 640}, color_scheme='dark')
    d = deborde(p); ok(not d['bad'] and d['sw'] <= d['W'], 'débordement 320 sombre ' + str(d))
    bg = p.evaluate("getComputedStyle(document.body).backgroundColor"); ok(bg != 'rgb(246, 240, 228)', 'fond sombre ' + bg)
    ok(not err, 'erreurs 320 ' + str(err)); ctx.close()
    # 3. Mardi 1/12 -> jeudi 3/12 ; mercredi ; jour vide
    ctx, p, err = ouvrir(b, '2026-12-01', viewport={'width': 390, 'height': 800})
    ok('jeudi 3/12' in p.inner_text('#sous') and 'mercredi fermé' in p.inner_text('#sous'), 'mardi -> jeudi')
    ok(p.locator('.carte').count() == 1 and 'jueves 3 de diciembre' in urllib.parse.unquote(p.locator('a.go').get_attribute('href')), 'Client K jeudi')
    ok('demain' not in urllib.parse.unquote(p.locator('a.go').get_attribute('href')).lower().replace('mañana',''), 'pas « demain » pour jeudi')
    p.goto(URL + '?date=2026-12-02'); p.wait_for_selector('#resume')
    ok('fermé' in p.inner_text('#sous') and p.locator('.carte').count() == 0, 'mercredi fermé')
    p.goto(URL + '?date=2026-12-05'); p.wait_for_selector('#resume')
    ok('Rien à faire' in p.inner_text('#liste'), 'jour sans réservation')
    p.goto(URL + '?date=2026-02-30'); p.wait_for_selector('#resume')
    ok(not err, 'date invalide ignorée sans erreur ' + str(err)); ctx.close()
    # 4. localStorage bloqué (navigation privée stricte) -> la page marche quand même
    ctx = b.new_context(viewport={'width': 390, 'height': 800})
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('bloqué')}})")
    p = ctx.new_page(); err = []; p.on('pageerror', lambda e: err.append(str(e)))
    p.goto(URL + '?date=2026-11-27'); p.wait_for_selector('#resume')
    ok(p.locator('.carte').count() == 8 and not err, 'sans localStorage ' + str(err))
    with ctx.expect_page() as pop:
        p.locator('.carte', has_text='Client F').locator('a.go').click()
    pop.value.close(); p.wait_for_timeout(500)
    ok('Rappel envoyé' in p.locator('.carte', has_text='Client F').inner_text(), 'envoyé en mémoire sans localStorage')
    ctx.close()
    # 4b. Numéro espagnol possible : confirmé d'un appui
    ctx = b.new_context(viewport={'width': 390, 'height': 800})
    ctx.add_init_script("window.RESA_LIGNES=[['Date','Heure','Couverts','Nom','Contact','Statut','Note'],['2026-11-28','20:00','2','Pepe','612345678','Confirmada','']]")
    p = ctx.new_page(); p.goto(URL + '?date=2026-11-27'); p.wait_for_selector('#resume')
    ok(p.locator('a.go').count() == 0 and p.locator('[data-esp]').count() == 1, 'pas d\'envoi avant confirmation +34')
    p.locator('[data-esp]').click()
    ok(p.locator('a.go').get_attribute('href').startswith('https://wa.me/34612345678?text='), 'envoi +34 après confirmation')
    ok('confirmé par vous' in p.inner_text('.carte'), 'mention confirmée')
    ctx.close()
    # 5. Injection : nom piégé
    ctx = b.new_context(viewport={'width': 390, 'height': 800})
    ctx.add_init_script("window.RESA_LIGNES=[['Date','Heure','Couverts','Nom','Contact','Statut','Note'],['2026-11-28','20:00','2','<img src=x onerror=window.PIEGE=1>','34600000001','Confirmée','<b>x</b>'],['xx<img src=y onerror=window.PIEGE=2>','20:00','2','<svg onload=window.PIEGE=3>','','Confirmée','']]")
    p = ctx.new_page(); p.goto(URL + '?date=2026-11-27'); p.wait_for_selector('#resume')
    ok(p.evaluate('window.PIEGE') is None and p.locator('#liste img, #liste svg').count() == 0, 'injection neutralisée (carte + ligne illisible)')
    ctx.close()
    b.close()
print('%d/%d vérifications OK' % (n - ko, n)); sys.exit(1 if ko else 0)
