# Design : Distribution multi-organisations via Docker

**Date** : 2026-03-08
**Statut** : Validé

## Contexte

Rendre le repo ogc-proxy facilement utilisable par plusieurs organisations différentes, avec Docker, en permettant des intégrations faciles tout en gardant la possibilité de mettre à jour le core aisément.

## Architecture de distribution

Image Docker générique publiée sur `ghcr.io` via GitHub Actions. Les organisations consomment l'image sans toucher au code source.

```
Ce repo (ogc-proxy-poc)
├── packages/proxy/  → image Docker
├── examples/        → starter kit
└── docs/kubernetes/ → manifestes K8s

        ↓ CI: build + push

  ghcr.io/<org>/ogc-proxy:1.2.0

        ↓ consommé par

  Organisation X
  ├── docker-compose.yml (réf image ghcr.io)
  ├── config/
  │   ├── collections.yaml
  │   └── plugins/        (optionnel)
  └── .env
```

**Versioning** : Semantic versioning avec tags `:latest`, `:1`, `:1.2`, `:1.2.0`.

**Mise à jour du core** : Changer le tag d'image → `docker compose pull && docker compose up -d`.

## Personnalisation par volumes

| Volume | Chemin conteneur | Obligatoire | Description |
|--------|-----------------|-------------|-------------|
| Config collections | `/app/config/collections.yaml` | Oui | Définitions des collections |
| Plugins custom | `/app/plugins/` | Non | Fichiers JS de plugins additionnels |

Variables d'environnement inchangées (`UPSTREAM_HOST`, `REDIS_URL`, `JWT_HOST`, etc.).

Le système de plugins scanne `/app/plugins/` en plus du chemin interne pour les plugins montés par volume.

## Dossier `examples/`

```
examples/
├── docker-compose.yml       # Proxy (image ghcr.io) + Redis
├── collections.yaml         # 2-3 collections d'exemple commentées
├── .env.example             # Variables avec descriptions
├── plugins/
│   └── README.md            # Interface Plugin documentée
└── README.md                # Guide quickstart
```

Quickstart en 4 étapes : copier, configurer YAML, configurer .env, `docker compose up -d`.

## Documentation Kubernetes

```
docs/kubernetes/
├── README.md
├── namespace.yaml
├── configmap.yaml
├── deployment.yaml
├── service.yaml
├── ingress.yaml
└── redis.yaml
```

Manifestes YAML bruts (pas de Helm). Hors scope : autoscaling, monitoring, service mesh.

## CI/CD — Publication de l'image

Nouveau workflow `.github/workflows/publish.yml` :

- **Déclencheurs** : push tag `v*` → image versionnée ; push `main` → `:latest`
- **Build** : multi-plateforme (`linux/amd64`, `linux/arm64`)
- **Tags automatiques** : `:1.2.0`, `:1.2`, `:1`, `:latest`
- **Registry** : `ghcr.io` via `GITHUB_TOKEN`

Le workflow `ci.yml` existant reste inchangé.

## Modifications au code

1. **`registry.ts`** — Charger collections.yaml depuis `/app/config/` en priorité, fallback interne
2. **`plugin.ts`** — Scanner `/app/plugins/` en plus de `src/plugins/`
3. **`Dockerfile`** — Créer `/app/config/` et `/app/plugins/`, copier le YAML par défaut
4. **Nouveaux fichiers** — workflow publish, dossier examples/, docs/kubernetes/
5. **Aucun changement** aux routes OGC/WFS, à l'app Express, aux tests, au docker-compose dev
