# Labo — Réservation WhatsApp avec message pré-rempli (prototype)

- `index.html` + `resa-wa.js` : date, service, heure, personnes, nom → WhatsApp s'ouvre sur le +34 744 62 29 75 avec un message complet dans la langue du client (FR/ES/EN/NL, anglais par défaut). Mercredi, dates et heures passées (heure de Madrid) refusés. Créneaux et limite 1–30 repris de `reserver.html`.
- But : remplacer le lien nu `https://wa.me/34744622975` du site public (aujourd'hui le client arrive sur une conversation vide).
- Test : `python3 labo/resa-whatsapp/e2e-resa-wa.py` (76).
