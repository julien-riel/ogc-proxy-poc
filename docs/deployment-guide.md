# Guide de déploiement en production

## 1. Prérequis

| Composant | Version minimale | Notes |
|-----------|-----------------|-------|
| Node.js | 20+ | LTS recommandé |
| Docker | 20.10+ | Avec Docker Compose v2 |
| npm | 9+ | Inclus avec Node 20 |

Le proxy est une application Express/TypeScript stateless. La compilation TypeScript doit être effectuée avant le déploiement :

```bash
cd packages/proxy
npm ci
npm run build
```

## 2. Variables d'environnement

| Variable | Description | Défaut | Recommandation production |
|----------|-------------|--------|--------------------------|
| `PORT` | Port d'écoute du serveur | `3000` | Garder `3000` derrière un reverse proxy |
| `UPSTREAM_HOST` | URL de base des APIs municipales | **(requis)** | URL interne du réseau (ex: `http://api.internal:8080`) |
| `BASE_URL` | URL publique du proxy | Auto-détecté | Définir explicitement (ex: `https://ogc.ville.qc.ca`) |
| `JWT_HOST` | Hôte de validation JWT | Désactivé | Activer en production |
| `JWT_ENDPOINT` | Endpoint de validation JWT | — | Requis si `JWT_HOST` est défini |
| `CORS_ORIGIN` | Origines autorisées (séparées par virgule) | `*` | **Restreindre** (ex: `https://carte.ville.qc.ca`) |
| `RATE_LIMIT_WINDOW_MS` | Fenêtre du rate limiter (ms) | `60000` | Ajuster selon le trafic |
| `RATE_LIMIT_MAX` | Requêtes max par fenêtre | `100` | Ajuster selon le trafic |
| `LOG_LEVEL` | Niveau de journalisation (`debug` pour logs verbeux, sinon `info` par défaut) | `info` | `info` en production |

> **Important** : Ne jamais laisser `CORS_ORIGIN=*` en production. Définir explicitement les domaines autorisés.

## 3. Sécurité

### CORS

Restreindre les origines autorisées :

```bash
CORS_ORIGIN=https://carte.ville.qc.ca,https://admin.ville.qc.ca
```

### Authentification JWT

Pour activer JWT, deux étapes sont requises :

1. Définir `enabled: true` dans la section `security.jwt` de `collections.yaml`
2. Définir les variables d'environnement `JWT_HOST` et `JWT_ENDPOINT`, qui sont substituées comme variables de template dans le fichier YAML

```bash
JWT_HOST=https://auth.ville.qc.ca
JWT_ENDPOINT=/api/v1/validate
```

Lorsque JWT est activé, l'authentification s'applique globalement à toutes les routes d'items et de features. Il n'y a pas de configuration d'authentification par collection.

### Rate limiting

Deux niveaux de protection :

- **Global** : `express-rate-limit` configurable via `RATE_LIMIT_WINDOW_MS` et `RATE_LIMIT_MAX`
- **Par upstream** : Token bucket limitant les appels vers chaque API source

### Protections intégrées (aucune configuration requise)

| Protection | Détail |
|-----------|--------|
| Helmet | CSP, X-Frame-Options, HSTS, etc. |
| Prévention XXE | `processEntities: false` sur le parseur XML |
| Limite de corps | 100 Ko max (JSON et XML) |
| Filtres CQL2 | 4096 caractères max, profondeur 20 |
| Journaux | URLs upstream loguées sans paramètres de requête |

## 4. Déploiement Docker

### Construction de l'image

```bash
cd packages/proxy
npm ci && npm run build
docker build -t ogc-proxy:latest .
```

Le `Dockerfile` utilise `node:20-alpine` pour une image minimale (~180 Mo).

### Docker Compose — Production

Créer un fichier `docker-compose.prod.yml` :

```yaml
services:
  proxy:
    image: ogc-proxy:latest
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      UPSTREAM_HOST: "http://api.internal:8080"
      BASE_URL: "https://ogc.ville.qc.ca"
      CORS_ORIGIN: "https://carte.ville.qc.ca"
      JWT_HOST: "https://auth.ville.qc.ca"
      JWT_ENDPOINT: "/api/v1/validate"
      RATE_LIMIT_MAX: "200"
      LOG_LEVEL: "info"
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Reverse proxy (nginx)

Placer nginx devant le proxy pour TLS et load balancing :

```nginx
upstream ogc_proxy {
  server 127.0.0.1:3000;
}

server {
  listen 443 ssl;
  server_name ogc.ville.qc.ca;

  location / {
    proxy_pass http://ogc_proxy;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 5. Vérification de santé

| Endpoint | Type | Comportement |
|----------|------|-------------|
| `GET /health` | Liveness | Retourne `200` si le processus est actif |
| `GET /ready` | Readiness | Retourne `200` si le registre de collections est chargé |

### Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Docker Compose

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/ready"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 10s
```

### Arrêt gracieux

Le proxy gère `SIGTERM` et `SIGINT` avec un délai de 30 secondes pour terminer les requêtes en cours. Docker doit accorder ce délai :

```yaml
stop_grace_period: 35s
```

## 6. Monitoring

### Journalisation structurée

Les logs sont émis en JSON structuré via `@villedemontreal/logger`, incluant :

- **Correlation ID** : Chaque requête reçoit un identifiant unique pour le traçage
- **Niveau** : Configurable via `LOG_LEVEL` (`debug` pour logs verbeux, sinon `info` par défaut)
- **Contexte** : Méthode HTTP, chemin, code de réponse, durée

Exemple de sortie :

```json
{
  "level": "info",
  "correlationId": "abc-123-def",
  "method": "GET",
  "path": "/collections/bornes-incendie/items",
  "statusCode": 200,
  "duration": 142
}
```

### Intégration ELK / Datadog

Les logs JSON sont directement compatibles avec les agents de collecte standards :

- **ELK** : Configurer Filebeat pour lire `stdout` du conteneur Docker
- **Datadog** : Activer la collecte de logs Docker avec `source:nodejs`
- **Prometheus** : Exposer un endpoint `/metrics` via un middleware custom si nécessaire (non inclus)

## 7. Scaling

### Architecture stateless

Le proxy ne conserve aucun état entre les requêtes. Il peut être répliqué horizontalement sans contrainte de session.

### Limitation : rate limiting en mémoire

Le rate limiter global et le token bucket par upstream utilisent un stockage **en mémoire**. Conséquences :

- Les compteurs sont **par instance** — avec N répliques, le taux effectif est multiplié par N
- Les compteurs sont perdus au redémarrage

### Recommandation : Redis pour le scaling horizontal

Pour un déploiement multi-instances, utiliser `rate-limit-redis` :

```bash
npm install rate-limit-redis ioredis
```

Cela permet de partager les compteurs entre toutes les instances.

### Dimensionnement

| Charge estimée | Répliques | Mémoire par instance | CPU |
|---------------|-----------|---------------------|-----|
| < 100 req/s | 1-2 | 256 Mo | 0.5 |
| 100-500 req/s | 2-4 | 512 Mo | 1.0 |
| > 500 req/s | 4+ | 512 Mo | 1.0+ |

## 8. Dépannage

| Code | Erreur | Cause probable | Solution |
|------|--------|---------------|----------|
| `502` | Bad Gateway | L'API upstream est inaccessible | Vérifier `UPSTREAM_HOST`, la connectivité réseau et l'état de l'API source |
| `504` | Gateway Timeout | L'API upstream ne répond pas dans les 15s (timeout par défaut du fetch upstream, configurable par collection via `timeout` dans `collections.yaml`). Le timeout socket du serveur HTTP est de 60s. | Vérifier la performance de l'API source; ajuster le `timeout` de la collection si nécessaire |
| `429` | Too Many Requests | Rate limit atteint | Augmenter `RATE_LIMIT_MAX` ou répartir la charge sur plus d'instances |
| `403` | Forbidden | Token JWT invalide ou expiré | Vérifier `JWT_HOST`/`JWT_ENDPOINT` et la validité du token |
| CORS | Requête bloquée par le navigateur | Origine non autorisée | Ajouter le domaine à `CORS_ORIGIN` |
| `500` | Internal Server Error | Erreur dans le proxy | Consulter les logs avec le correlation ID pour identifier la cause |

### Commandes de diagnostic

```bash
# Vérifier que le proxy est actif
curl -s http://localhost:3000/health | jq .

# Vérifier que le registre est chargé
curl -s http://localhost:3000/ready | jq .

# Tester une collection
curl -s http://localhost:3000/collections | jq .

# Consulter les logs en temps réel
docker compose logs -f proxy

# Vérifier la connectivité upstream depuis le conteneur
docker compose exec proxy wget -qO- http://api.internal:8080/health
```
