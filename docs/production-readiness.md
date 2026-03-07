# Production Readiness — Gap Analysis

Ce document liste les lacunes identifiees entre l'etat actuel du POC et un
deploiement en production. Les items sont classes par priorite.

---

## P0 — Bloquants

### 1. Logging structure

**Etat actuel :** Un seul `console.log` dans `index.ts`. Aucun log de requete,
d'erreur, de performance ou de filtrage.

**Requis :**
- Integrer un logger structure (pino ou winston) avec niveaux (debug, info,
  warn, error)
- Logger chaque requete entrante : methode, path, query params, duree, status
- Logger chaque appel upstream : URL, duree, status, taille de la reponse
- Logger les erreurs avec contexte : stack trace, params de la requete, config
  de la collection
- Correlation ID sur chaque requete (le package `@villedemontreal/correlation-id`
  est deja installe mais non utilise)
- Format JSON pour integration avec ELK/Datadog/CloudWatch

**Fichiers concernes :**
- `packages/proxy/src/app.ts` — middleware de logging
- `packages/proxy/src/engine/adapter.ts` — logs upstream
- `packages/proxy/src/ogc/items.ts` — logs de filtrage et pagination
- `packages/proxy/src/wfs/router.ts` — logs WFS

---

### 2. Timeouts sur les appels upstream

**Etat actuel :** Les `fetch()` dans `adapter.ts` n'ont aucun timeout. Si un
upstream ne repond pas, le proxy attend indefiniment, consommant des connexions
et des threads.

**Requis :**
- Ajouter un `AbortController` avec timeout configurable (defaut : 15s) a
  chaque appel `fetch()` dans `adapter.ts`
- Timeout distinct par collection (configurable dans `collections.yaml`)
- Retourner une erreur 504 Gateway Timeout quand le timeout est atteint
- Logger le timeout avec l'URL upstream

**Fichiers concernes :**
- `packages/proxy/src/engine/adapter.ts:23-29` — `fetchJson()`
- `packages/proxy/src/engine/types.ts` — ajouter `timeout` a `UpstreamConfig`
- `packages/proxy/src/config/collections.yaml` — timeout par collection

---

### 3. Limite du post-fetch filtering

**Etat actuel :** Quand un filtre post-fetch est actif, le proxy fetch
`maxFeatures * 10` items pour compenser les rejets. Ce multiplicateur est
arbitraire et non borne. Exemple : `maxFeatures=1000` → fetch 10 000 items en
memoire.

**Requis :**
- Plafonner le nombre d'items fetches en post-fetch (ex : `maxPostFetchItems`
  dans la config, defaut 5000)
- Retourner un warning dans la reponse si le plafond est atteint et que le
  nombre de resultats demandes n'est pas satisfait
- Documenter la limitation : les filtres tres selectifs sur de grosses
  collections peuvent retourner moins de resultats que demande

**Fichiers concernes :**
- `packages/proxy/src/wfs/get-feature.ts:153-155`
- `packages/proxy/src/ogc/items.ts:315`
- `packages/proxy/src/engine/types.ts` — config `maxPostFetchItems`

---

### 4. Limites de taille des requetes

**Etat actuel :** `express.text()` dans le router WFS n'a pas de limite de
taille. Les filtres CQL2 n'ont pas de longueur max. Cela ouvre la porte a des
attaques DoS (XML bombs, filtres CQL2 tres complexes).

**Requis :**
- `express.text({ limit: '100kb' })` dans `wfs/router.ts`
- `express.json({ limit: '100kb' })` dans `app.ts`
- Limite de longueur sur le parametre `filter` (ex : 4096 caracteres)
- Limite de profondeur de l'AST CQL2 (ex : 20 niveaux de nesting)
- Desactiver l'expansion d'entites XML dans fast-xml-parser (verifier le flag
  `processEntities: false`)

**Fichiers concernes :**
- `packages/proxy/src/wfs/router.ts:18`
- `packages/proxy/src/app.ts`
- `packages/proxy/src/ogc/items.ts` — validation longueur filtre
- `packages/proxy/src/engine/cql2/parser.ts` — limite profondeur AST

---

### 5. Graceful shutdown

**Etat actuel :** Le serveur n'a pas de handler SIGTERM. Un `docker stop` tue
le process immediatement sans drainer les connexions en cours.

**Requis :**
- Handler SIGTERM et SIGINT dans `index.ts`
- Fermer le serveur HTTP (`server.close()`)
- Attendre que les requetes en cours se terminent (timeout 30s)
- Logger l'arret

**Fichiers concernes :**
- `packages/proxy/src/index.ts`

---

## P1 — Importants

### 6. Validation de la configuration au demarrage

**Etat actuel :** Le YAML est parse mais jamais valide. Les variables
d'environnement manquantes deviennent des chaines vides. Les response mapping
paths ne sont jamais verifies.

**Requis :**
- Valider le schema YAML au chargement avec zod ou ajv
- Verifier que les variables d'environnement referees existent
- Verifier que les URLs upstream sont syntaxiquement valides
- Verifier que les `responseMapping` paths correspondent a des champs existants
  (au moins un test de connectivity au demarrage, optionnel)
- Echouer au demarrage si la config est invalide (fail fast)

**Fichiers concernes :**
- `packages/proxy/src/engine/registry.ts`
- `packages/proxy/src/engine/types.ts` — schema zod

---

### 7. Validation runtime des reponses upstream

**Etat actuel :** Les reponses upstream sont utilisees sans validation. Un
upstream qui retourne du JSON malformé, des champs manquants ou des geometries
invalides passe sans erreur.

**Requis :**
- Valider que la reponse upstream contient les champs attendus
  (`responseMapping.items` existe, est un tableau)
- Valider le total (nombre, pas NaN)
- Features malformees : skipper avec un warning plutot que crasher
- GeoJSON : valider que `type` et `coordinates` sont presents

**Fichiers concernes :**
- `packages/proxy/src/engine/adapter.ts` — `extractItems()`, `extractTotal()`
- `packages/proxy/src/engine/geojson-builder.ts` — `buildFeature()`

---

### 8. Rate limiting

**Etat actuel :** Aucune protection contre l'abus d'API. Un client peut
envoyer des milliers de requetes par seconde.

**Requis :**
- Rate limiting par IP (express-rate-limit ou equivalent)
- Configurable : requetes/minute, burst
- Headers standard : `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset`
- Reponse 429 Too Many Requests

**Fichiers concernes :**
- `packages/proxy/src/app.ts` — middleware

---

### 9. Headers de securite

**Etat actuel :** Seul CORS est configure. Aucun header de securite defensif.

**Requis :**
- Integrer helmet (ou configurer manuellement) :
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security` (si HTTPS)
  - `Content-Security-Policy`
- Ne pas exposer `X-Powered-By: Express`
- Sanitiser les messages d'erreur (ne pas leaker les URLs upstream, les stack
  traces, les noms de fichiers internes)

**Fichiers concernes :**
- `packages/proxy/src/app.ts`
- `packages/proxy/src/wfs/router.ts:51,57` — messages d'erreur
- `packages/proxy/src/ogc/items.ts:336-338` — messages d'erreur

---

### 10. CI/CD pipeline

**Etat actuel :** Aucun pipeline. Les tests et le build doivent etre lances
manuellement.

**Requis :**
- Pipeline GitHub Actions (ou GitLab CI) :
  - Lint (eslint)
  - Type check (`tsc --noEmit`)
  - Unit tests (`npm test -w packages/proxy`)
  - Conformance tests (`npm test -w packages/conformance-tests`)
  - Build Docker image
  - Push image vers registre
- Branch protection : PR obligatoire, tests verts requis
- Dependabot ou Renovate pour les mises a jour de deps

**Fichiers a creer :**
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `.eslintrc.js` (si absent)

---

## P2 — Recommandes

### 11. Connection pooling et keep-alive

**Etat actuel :** Chaque `fetch()` ouvre une nouvelle connexion TCP. Pas de
keep-alive, pas de pooling.

**Requis :**
- Configurer un `http.Agent` / `https.Agent` avec `keepAlive: true` et
  `maxSockets` raisonnable (50-100)
- Reutiliser l'agent pour les appels upstream d'une meme collection
- Optionnel : undici pour des performances superieures

**Fichiers concernes :**
- `packages/proxy/src/engine/adapter.ts`

---

### 12. Cache

**Etat actuel :** Chaque requete identique refait un appel upstream. Aucun
cache, meme pour des donnees qui changent rarement (capabilities, describe,
collections).

**Requis :**
- Cache en memoire (lru-cache ou node-cache) avec TTL configurable
- Cibles prioritaires :
  - GetCapabilities : TTL 5 min (change rarement)
  - DescribeFeatureType : TTL 5 min
  - Collections / queryables : TTL 1 min
  - Items : TTL 30s (optionnel, configurable par collection)
- Header `Cache-Control` dans les reponses
- Invalidation manuelle via endpoint admin (optionnel)

---

### 13. Health check avance

**Etat actuel :** `/health` retourne `{ status: 'ok' }` sans verifier quoi
que ce soit.

**Requis :**
- Readiness probe : verifier que la config est chargee et valide
- Liveness probe : verifier que le serveur repond
- Optionnel : verifier la connectivite upstream (avec timeout court)
- Format compatible Kubernetes (`/health/ready`, `/health/live`)

**Fichiers concernes :**
- `packages/proxy/src/app.ts`

---

### 14. Tests d'integration et de resilience

**Etat actuel :** Tests unitaires (87) et conformite (182) solides. Aucun test
d'integration HTTP reel, aucun test de resilience.

**Requis :**
- Tests d'integration : requetes HTTP reelles contre le serveur
- Tests de resilience :
  - Upstream timeout → 504
  - Upstream erreur 500 → 502
  - Upstream JSON malformé → erreur propre
  - XML malformé en POST → 400
  - Filtre CQL2 invalide → 400
  - Requete trop grosse → 413
- Tests de charge (optionnel) : k6 ou autocannon

---

### 15. Docker multi-stage build

**Etat actuel :** Dockerfile basique, pas de HEALTHCHECK, pas d'optimisation
du cache de couches.

**Requis :**
- Multi-stage build : etape build (avec devDependencies) + etape runtime
  (sans devDependencies)
- `HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1`
- `.dockerignore` pour exclure node_modules, .git, docs, tests
- Limites de ressources dans docker-compose (memory, cpu)
- Non-root user dans le container

---

## Resume

| Priorite | Item | Effort estime |
|----------|------|---------------|
| P0 | Logging structure | 2-3j |
| P0 | Timeouts upstream | 0.5j |
| P0 | Limite post-fetch filtering | 0.5j |
| P0 | Limites taille requetes | 0.5j |
| P0 | Graceful shutdown | 0.5j |
| P1 | Validation config au demarrage | 1-2j |
| P1 | Validation runtime upstream | 1j |
| P1 | Rate limiting | 0.5j |
| P1 | Headers de securite | 0.5j |
| P1 | CI/CD pipeline | 1-2j |
| P2 | Connection pooling | 0.5j |
| P2 | Cache | 1-2j |
| P2 | Health check avance | 0.5j |
| P2 | Tests integration/resilience | 2-3j |
| P2 | Docker multi-stage | 0.5j |
| **Total** | | **~12-17 jours** |
