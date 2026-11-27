/* Copie ANONYMISÉE de l'onglet Reservations (structure et défauts réels du 27/11/2026 :
   doublons, #ERROR!, numéros sans indicatif, notre propre adresse, nom « Client »).
   Noms et numéros remplacés ; dates décalées sur le week-end du 28-29/11 pour la démonstration. */
window.RESA_EXEMPLE = [
  ["Date","Heure","Couverts","Nom","Contact","Source","Statut","Note","MsgId","Arrivee"],
  ["2026-11-28","19:00","2","Client A","31600000001","Email","À valider","Speciale avond met DJ (18u–00u)","m1"],
  ["2026-11-28","12:00","2","Client B Durand","32470000002","Email","Confirmée","","m2"],
  ["2026-11-28","12:00","2","Client B Durand","32470000002","Email","Confirmée","Lunch (12u–15u)","m3"],
  ["2026-11-28","12:00","2","Client B Durand","","Email","Confirmée","","m4"],
  ["2026-11-28","13:30","2","Martin Claude","32470000003","Email","Confirmée","","m5"],
  ["2026-11-28","13:30","2","Claude Martin","#ERROR!","Email","À valider","","m6"],
  ["2026-11-28","12:30","2","May","470000004","Email","Confirmée","Chien toujours accepté?","m7"],
  ["2026-11-28","19:30","2","Client E","470000005","Web","Confirmée","","web-m8"],
  ["2026-11-28","20:30","3","Client F","34600000006","Email","Confirmée","","m9"],
  ["2026-11-28","20:30","3","Client","","Email","Confirmée","","m10"],
  ["2026-11-28","21:00","4","Client G","client.g@example.com","Email","Confirmée","","m11"],
  ["2026-11-28","21:15","2","Client H","brasseriephoenixrestaurant@gmail.com","Email","Confirmée","","m12"],
  ["2026-11-28","20:00","2","Client I","44700000009","Email","Annulée","","m13"],
  ["2026-12-04","19:30","2","Client J","#ERROR!","Email","Confirmée","","m14"],
  ["2026-12-04","19:30","2","Client J","","Email","À valider","Degustatiemenu zonder Foie Gras (remplacement demandé)","m15"],
  ["2026-12-03","19:30","2","Client K","34600000010","Email","Confirmée","","m16"],
  ["2026-30-07","12:00","2","Client L","34600000011","Email","Confirmée","","m17"]
];
