Lis le plan d'implémentation dans docs/plans/2026-03-04-poc-ogc-proxy-implementation.md et exécute-le tâche par tâche en utilisant le skill superpowers:executing-plans.

Le travail est en cours dans le worktree `.worktrees/poc-implementation` (branche `feature/poc-implementation`). Les tâches 1 à 9 sont déjà complétées et commitées. Les 21 tests unitaires et 55 tests de conformance passent (76 tests au total).

Notes sur les corrections faites en cours de route :
- Le `BASE_URL` de Vite fuit dans les process enfants : le global-setup exclut `BASE_URL` de l'env passé au proxy enfant
- Le parsing des query params WFS GET utilise des clés lowercase (après normalisation dans le router)
- L'adapter exporte `UpstreamError` pour distinguer les 404 upstream des autres erreurs

Reprends à la tâche 10 (Docker Compose + Dockerfiles). Change de répertoire de travail vers `.worktrees/poc-implementation` avant de commencer.
