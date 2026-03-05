# Configurer MapStore avec le proxy WFS

## Prerequis

- Docker Compose demarre : `docker compose up`
- MapStore accessible sur `http://localhost:8080`

## Ajouter le service WFS

1. Ouvrir MapStore : `http://localhost:8080`
2. Se connecter (admin/admin par defaut)
3. Creer une nouvelle carte : **Nouvelle carte**
4. Cliquer sur le bouton **Catalogue** (icone de dossier dans la barre d'outils)
5. Cliquer **+** pour ajouter un nouveau service
6. Remplir :
   - **URL** : `http://proxy:3000/wfs`
   - **Type** : WFS
   - **Titre** : Proxy Municipal
7. Cliquer **Sauvegarder**

## Ajouter des couches

1. Dans le catalogue, selectionner le service "Proxy Municipal"
2. Les 3 couches apparaissent : bornes-fontaines, pistes-cyclables, arrondissements
3. Cliquer **Ajouter a la carte** pour chaque couche

## Verification

- Les features s'affichent sur la carte
- Cliquer sur une feature ouvre la popup avec les attributs
- Le zoom/pan declenche de nouvelles requetes GetFeature

## Depannage

- Si le catalogue ne montre rien, verifier que le proxy est accessible
  depuis le conteneur MapStore : `docker compose exec mapstore curl http://proxy:3000/wfs?service=WFS&request=GetCapabilities`
- Si erreur CORS, verifier que le proxy renvoie bien les headers CORS
- Verifier les logs : `docker compose logs proxy`

## Notes

- MapStore utilise WFS 1.1.0 avec outputFormat=application/json
- Les requetes GetFeature sont envoyees en POST avec un body XML
- Le proxy traduit ces requetes vers les APIs internes
