# SPEC.md — InfraGuard FinOps & Security

> Statut : **IMPLÉMENTÉ & VALIDÉ (v1.0.0)**.
> Version de la spec : 1.0.0

---

## 1. Objectif, positionnement et mots-clés

### 1.1 Objectif
GitHub Action **"InfraGuard FinOps & Security"** qui analyse les fichiers **modifiés dans une Pull Request** (Dockerfile, docker-compose, Terraform `.tf`) pour détecter :
- les **dérives de coûts Cloud** (instances GPU/larges, disques surdimensionnés),
- les **mauvaises pratiques de ressources et de sécurité** (tags `:latest`, root, absence de healthcheck/limites, stockage non chiffré),
- les **secrets exposés** (AWS, OpenAI, Anthropic, Stripe, GitHub),

puis poste **un seul commentaire Markdown idempotent** sur la PR, et émet des **annotations inline** GitHub.

### 1.2 Contraintes non négociables
| # | Contrainte | Conséquence technique |
|---|-----------|-----------------------|
| C1 | 0 € d'infra récurrente | Exécution 100 % sur le runner du client (Node 20). Aucun backend, aucune base, aucun télémétrie. |
| C2 | Licence via API publique Polar.sh | Seul appel réseau sortant hors API GitHub : `POST https://api.polar.sh/v1/customer-portal/license-keys/validate`. |
| C3 | Distribution organique | `action.yml` complet (branding), README optimisé SEO Marketplace. |
| C4 | Freemium | Free = sans clé ; Pro = input `license_key`. |
| C5 | Ne jamais bloquer la CI à cause de nous | Fail-open sur la licence ; erreurs internes → `core.warning`, jamais `setFailed` (sauf `fail_on_error` Pro sur findings). |

### 1.3 Positionnement marché
Alternative **légère, zéro-config, orientée coût** face à Checkov/tfsec/Trivy (orientés conformité, verbeux) et Infracost (nécessite compte/API). Proposition de valeur : *"en 10 s, dans la PR, combien ça coûte et qu'est-ce qui fuit"*. Cible : startups, équipes DevOps/platform, freelances, projets open source.

### 1.4 Mots-clés GitHub Marketplace ciblés
`finops`, `cloud cost`, `cost optimization`, `terraform`, `dockerfile`, `docker-compose`, `devsecops`, `secret scanning`, `security`, `infrastructure as code`, `iac`, `aws`, `pull request`, `linter`, `best practices`, `hadolint alternative`, `tfsec alternative`, `cloud waste`.
- `action.yml` → `name: "InfraGuard FinOps & Security"`, `description` ≤ 125 caractères contenant *FinOps, Terraform, Docker, secrets*.
- README : H1 avec mots-clés, section "Why", exemple de workflow copiable en 1er écran, capture du rapport, tableau Free vs Pro, section FAQ licence, badges.
- Branding : `icon: shield`, `color: green` (valeurs valides Marketplace).

---

## 2. Architecture technique

### 2.1 Stack
- TypeScript 5.x strict, Node **20+** (`runs.using: node20`), ESM interdit en sortie (bundle CJS).
- Bundling : `@vercel/ncc build src/main.ts -o dist --source-map --license licenses.txt` → **`dist/index.js` commité**.
- Dépendances runtime : `@actions/core`, `@actions/github`, `yaml` (parse docker-compose & `.infraguard.yml`), `minimatch`. Parsing HCL : **parseur maison tolérant à base de regex/blocs** (pas de binaire externe, pas de dépendance native).
- Dev : `vitest`, `@vitest/coverage-v8`, `eslint` + `@typescript-eslint`, `prettier`, `typescript`, `@vercel/ncc`.
- `fetch` natif Node 20 (`AbortController`) pour Polar.sh (pas de lib HTTP).

### 2.2 Flux d'exécution
```
main.ts
 ├─ config/inputs.ts        lire inputs
 ├─ license/polar.ts        valider licence (si license_key) → tier: free | pro
 ├─ github/files.ts         lister fichiers modifiés de la PR (pulls.listFiles, paginé) + contenu (HEAD sha)
 ├─ config/infraguard-config.ts  charger .infraguard.yml (Pro uniquement)
 ├─ engine/runner.ts        dispatch fichiers → analyseurs selon tier
 │    ├─ analyzers/dockerfile.ts       (Free)
 │    ├─ analyzers/compose.ts          (Free)
 │    ├─ analyzers/terraform.ts        (Pro)
 │    └─ analyzers/secrets.ts          (Pro)
 ├─ engine/filter.ts        appliquer ignore_rules / seuils / sévérité min
 ├─ report/markdown.ts      construire le rapport
 ├─ report/annotations.ts   core.warning / core.error inline
 ├─ github/comment.ts       upsert commentaire (marqueur HTML)
 └─ outputs + core.setFailed si fail_on_error && tier Pro && findings ≥ seuil
```
Événements supportés : `pull_request`, `pull_request_target`. Autre événement → `core.notice` + sortie propre (exit 0).

### 2.3 Arborescence exacte
```
infraguard-finops-action/
├─ .github/
│  └─ workflows/
│     ├─ ci.yml                 # lint + test + build + vérif dist à jour
│     └─ release.yml            # tag v1 flottant
├─ src/
│  ├─ main.ts                   # point d'entrée (try/catch global)
│  ├─ types.ts                  # Finding, Rule, Severity, Tier, Config…
│  ├─ config/
│  │  ├─ inputs.ts
│  │  └─ infraguard-config.ts   # parse + validation .infraguard.yml
│  ├─ license/
│  │  └─ polar.ts
│  ├─ github/
│  │  ├─ files.ts
│  │  └─ comment.ts
│  ├─ analyzers/
│  │  ├─ dockerfile.ts
│  │  ├─ compose.ts
│  │  ├─ terraform.ts
│  │  └─ secrets.ts
│  ├─ rules/
│  │  ├─ free.ts                # catalogue règles Free (IDs, sévérités, messages)
│  │  ├─ pro.ts                 # catalogue règles Pro
│  │  └─ pricing.ts             # table de prix statique (estimations)
│  ├─ engine/
│  │  ├─ runner.ts
│  │  └─ filter.ts
│  └─ report/
│     ├─ markdown.ts
│     └─ annotations.ts
├─ tests/
│  ├─ unit/
│  │  ├─ dockerfile.test.ts
│  │  ├─ compose.test.ts
│  │  ├─ terraform.test.ts
│  │  ├─ secrets.test.ts
│  │  ├─ license.test.ts
│  │  ├─ config.test.ts
│  │  ├─ filter.test.ts
│  │  ├─ markdown.test.ts
│  │  └─ annotations.test.ts
│  ├─ integration/
│  │  ├─ comment-idempotence.test.ts
│  │  └─ main-flow.test.ts
│  ├─ fixtures/
│  │  ├─ docker/   (good.Dockerfile, bad.Dockerfile, multistage.Dockerfile, …)
│  │  ├─ compose/  (good.yml, bad.yml, v2-legacy.yml)
│  │  ├─ terraform/(gpu.tf, rds-large.tf, ebs-unencrypted.tf, clean.tf, modules/…)
│  │  ├─ secrets/  (leaks.env.txt, false-positives.txt)
│  │  ├─ config/   (valid.infraguard.yml, invalid.infraguard.yml)
│  │  ├─ github/   (pulls-listFiles.json, comments-existing.json)
│  │  └─ polar/ (granted.json, revoked.json, disabled.json, expired.json)
│  └─ __snapshots__/
├─ dist/
│  ├─ index.js                  # généré par ncc, commité
│  ├─ index.js.map
│  └─ licenses.txt
├─ action.yml
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ .eslintrc.cjs
├─ .prettierrc
├─ .gitignore                   # node_modules, coverage (PAS dist)
├─ .infraguard.example.yml
├─ README.md
├─ LICENSE
├─ SPEC.md
├─ TASKS.md
└─ GEMINI.md
```

### 2.4 `action.yml` (contrat)
```yaml
name: "InfraGuard FinOps & Security"
description: "FinOps & security audit for Docker, Compose and Terraform in PRs: cloud cost drift, bad practices, exposed secrets."
author: "InfraGuard"
branding: { icon: shield, color: green }
inputs:
  github_token:    { description: "Token pour lire la PR et commenter", required: false, default: "${{ github.token }}" }
  license_key:     { description: "Clé de licence Pro Polar.sh (vide = Free)", required: false, default: "" }
  fail_on_error:   { description: "Pro : échoue le job si finding de sévérité error (true/false)", required: false, default: "false" }
  config_path:     { description: "Pro : chemin du fichier de config", required: false, default: ".infraguard.yml" }
  comment:         { description: "Poster/mettre à jour le commentaire PR (true/false)", required: false, default: "true" }
outputs:
  tier:            { description: "free | pro" }
  findings_count:  { description: "Nombre total de findings" }
  errors_count:    { description: "Nombre de findings sévérité error" }
  estimated_monthly_cost_usd: { description: "Surcoût mensuel estimé (Pro, sinon 0)" }
runs: { using: node20, main: dist/index.js }
```
Le `license_key` est immédiatement masqué via `core.setSecret`. Permissions requises documentées dans le README : `contents: read`, `pull-requests: write`.

### 2.5 `package.json` / `tsconfig.json` (contrat)
- Scripts : `build` (`tsc --noEmit && ncc build …`), `test` (`vitest run`), `test:cov`, `lint`, `format:check`, `all` (lint + test + build).
- `engines.node: ">=20"`.
- `tsconfig` : `target ES2022`, `module commonjs`, `strict: true`, `noUncheckedIndexedAccess: true`, `outDir lib`, `rootDir src`, `esModuleInterop: true`, `resolveJsonModule: true`; `tests/` exclu du build.
- CI vérifie `git diff --exit-code dist/` après build (dist toujours à jour).

### 2.6 Types centraux
```ts
type Severity = 'info' | 'warning' | 'error';
type Tier = 'free' | 'pro';
interface Finding {
  ruleId: string; severity: Severity; file: string;
  line: number; endLine?: number;          // 1-indexé
  message: string; remediation: string;
  tier: Tier; monthlyCostUsd?: number;     // Pro FinOps uniquement
  resource?: string;                       // ex. aws_instance.gpu
}
```

### 2.7 Périmètre fichiers
- **Seuls les fichiers ajoutés/modifiés** (`status` ≠ `removed`) sont analysés. Limite : 300 fichiers (limite API) ; au-delà → notice « analyse tronquée ».
- Fichiers > 1 Mo ignorés (notice). Binaires ignorés.
- Détection Docker : basename `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `*.dockerfile`. Compose : `docker-compose*.yml|yaml`, `compose*.yml|yaml`. Terraform : `*.tf`. Secrets : tous fichiers texte modifiés (hors `*.lock`, `package-lock.json`, `dist/`, `node_modules/`, images…).
- Seules les **lignes ajoutées** sont rapportées pour la règle secrets (via `patch`) ; pour les autres règles, le fichier complet est analysé (ex. absence de `USER` ne se voit pas dans un diff).

---

## 3. Règles d'audit

Format ID : `IG-<DOMAINE>-<NNN>`. Sévérités : `error` > `warning` > `info`. Chaque finding a : ID, sévérité, fichier, ligne, message, remédiation.

### 3.1 Règles FREE (Dockerfile & docker-compose)

#### Dockerfile (ciblage : fichiers Dockerfile)
| ID | Sév. | Condition exacte de déclenchement | Message / remédiation |
|----|------|-----------------------------------|-----------------------|
| `IG-DKR-001` | warning | Une instruction `FROM` dont l'image (après résolution des `ARG` à valeur par défaut) a le tag `latest` **ou n'a aucun tag ni digest**. Exclusions : `FROM scratch`, `FROM <alias-de-stage-précédent>`, image avec `@sha256:`. Ligne = ligne du `FROM`. | « Image de base non épinglée (`node:latest`). » → « Épinglez une version précise (ex. `node:20.11-alpine`) ou un digest `@sha256:…` pour des builds reproductibles. » |
| `IG-DKR-002` | warning | **Dernier stage** (stage final) ne contient aucune instruction `USER`, **ou** dernier `USER` ∈ {`root`, `0`, `0:0`, `root:*`}. Ligne = dernier `FROM` (absent) ou ligne du dernier `USER`. | « Le conteneur s'exécute en root. » → « Ajoutez `RUN adduser -D app` puis `USER app` avant `CMD`/`ENTRYPOINT`. » |
| `IG-DKR-003` | info | Stage final sans instruction `HEALTHCHECK`, ou avec `HEALTHCHECK NONE`. Exclusion : image finale `FROM scratch`. | « Aucun HEALTHCHECK défini. » → « Ajoutez `HEALTHCHECK CMD curl -f http://localhost:PORT/health || exit 1`. » |

Règles de parsing : continuation de ligne `\`, commentaires `#`, instructions insensibles à la casse, directives `# syntax=`, `FROM --platform=… image AS name`.

#### docker-compose.yml (ciblage : fichiers compose, section `services.*`)
| ID | Sév. | Condition exacte | Message / remédiation |
|----|------|------------------|-----------------------|
| `IG-CMP-001` | warning | `services.<svc>.image` avec tag `latest` ou sans tag/digest (après interpolation `${VAR:-défaut}` si défaut ; variable sans défaut → ignoré). Services avec uniquement `build:` ignorés. | « Service `<svc>` : image non épinglée. » → « Utilisez un tag de version explicite. » |
| `IG-CMP-002` | warning | Service sans `user:` ou avec `user` ∈ {`root`, `0`, `0:0`}. Exclusion : services sans `image` ni `build`. | « Service `<svc>` s'exécute en root. » → « Ajoutez `user: "1000:1000"` ou définissez `USER` dans l'image. » |
| `IG-CMP-003` | info | Service sans clé `healthcheck`, ou `healthcheck.disable: true`. | « Service `<svc>` sans healthcheck. » → « Ajoutez `healthcheck: { test: [...], interval: 30s, retries: 3 }`. » |
| `IG-CMP-004` | warning | Service sans **aucune** limite : ni `deploy.resources.limits.cpus`/`memory`, ni `mem_limit`/`cpus` (compose v2 legacy). Warning si aucune des deux limites ; **info** si une seule des deux (CPU ou RAM) est définie. | « Service `<svc>` sans limites CPU/RAM. » → « Ajoutez `deploy.resources.limits: { cpus: "0.50", memory: 512M }`. » |

Numéros de ligne via `yaml` (`parseDocument` + `range`/`linePos`) ; repli sur la ligne de la clé `services`.

### 3.2 Règles PRO (Terraform, secrets) — actives uniquement si licence valide (ou grâce fail-open)

#### Terraform (`*.tf`)
Parsing : blocs `resource "<type>" "<name>" { … }` avec accolades équilibrées, attributs `key = "valeur"|nombre|bool`, blocs imbriqués (`root_block_device`, `ebs_block_device`). Variables `var.x` avec `default` résolues si possible ; sinon attribut ignoré (pas de faux positif). Commentaires `#`, `//`, `/* */` ignorés.

| ID | Sév. | Condition exacte | Message / remédiation |
|----|------|------------------|-----------------------|
| `IG-TF-001` | error | `aws_instance` / `aws_launch_template` / `aws_launch_configuration` dont `instance_type` (famille.taille) appartient à une **famille GPU/accélérée** : `p2 p3 p4d p4de p5 g3 g4dn g4ad g5 g5g g6 inf1 inf2 trn1 trn1n dl1 dl2q f1 vt1` | « Instance GPU/accélérée `<type>` (~$X/mois). » → « Vérifiez le besoin ; préférez Spot, Savings Plans, ou une instance plus petite. » |
| `IG-TF-002` | warning | Instance EC2 « large » : taille ∈ {`4xlarge`, `8xlarge`, `12xlarge`, `16xlarge`, `24xlarge`, `32xlarge`, `48xlarge`, `metal`} (seuil par défaut `ec2_min_size: 4xlarge`, configurable) **et** la ressource n'est **pas** pilotée par un `aws_autoscaling_group` (aucun ASG du même lot de fichiers ne référence le launch template/config) **et** `aws_instance` direct (sans scaling). | « Instance `<type>` fixe sans scaling (~$X/mois). » → « Utilisez un Auto Scaling Group ou réduisez la taille. » |
| `IG-TF-003` | warning | `aws_db_instance` dont `instance_class` ∈ `db.*` taille ≥ `4xlarge` (seuil `rds_min_size`, défaut `4xlarge`) **et** sans `max_allocated_storage` (autoscaling stockage) **et** `multi_az` ≠ true n'est PAS pris en compte. Aussi `aws_rds_cluster_instance` sans `aws_appautoscaling_target` associé. | « RDS `<class>` surdimensionné sans scaling (~$X/mois). » → « Réduisez la classe, activez `max_allocated_storage` / Aurora autoscaling. » |
| `IG-TF-004` | error | Volume non chiffré : `aws_ebs_volume` sans `encrypted = true` ; `root_block_device` / `ebs_block_device` sans `encrypted = true` ; `aws_db_instance` sans `storage_encrypted = true`. | « Stockage `<resource>` non chiffré. » → « Ajoutez `encrypted = true` (et `kms_key_id`). » |
| `IG-TF-005` | warning | Disque surdimensionné : `size` / `volume_size` / `allocated_storage` **> `max_volume_gb`** (défaut **500** Go). Surcoût = `(size − seuil) × prix_$/Go/mois du type` (gp2 0.10, gp3 0.08, io1/io2 0.125 + IOPS × 0.065, st1 0.045, sc1 0.015 ; RDS gp2/gp3 0.115 ; défaut gp2). | « Disque `<size>` Go (> seuil, +$X/mois). » → « Réduisez la taille ou activez l'autoscaling de stockage. » |
| `IG-TF-006` | info | `aws_ebs_volume` / `root_block_device` de type `gp2` (ou `type` absent). | « gp2 est ~20 % plus cher que gp3. » → « Passez à `type = "gp3"` (économie ≈ $X/mois). » |

**Estimation de surcoût mensuel** : table statique `src/rules/pricing.ts`, prix on-demand `us-east-1` Linux, 730 h/mois, valeurs d'exemple (à figer lors de l'implémentation) : `p3.2xlarge 2234`, `g5.xlarge 734`, `g4dn.xlarge 384`, `m5.4xlarge 561`, `m5.8xlarge 1122`, `db.r5.4xlarge 2190`… ; type inconnu → estimation par facteur de taille (xlarge = 1, 2xlarge = 2, 4xlarge = 4…) × prix de la `xlarge` de la famille, sinon `null` (affiché « n/d »). Région non-`us-east-1` : même table, mention « estimation us-east-1 ». Le rapport affiche **toujours** « estimation indicative ». Total = somme des `monthlyCostUsd` des findings FinOps. `count` multiplie le coût si littéral entier.

#### Secrets (tous fichiers texte modifiés — lignes ajoutées uniquement)
| ID | Sév. | Regex (JS, flag `g`) | Message / remédiation |
|----|------|----------------------|-----------------------|
| `IG-SEC-001` | error | AWS Access Key ID : `\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b` ; AWS Secret : `(?i)aws(.{0,20})?(secret|sk)(.{0,20})?['"][0-9a-zA-Z\/+]{40}['"]` (adaptée sans `(?i)` inline JS) | « Clé AWS exposée. » → « Révoquez la clé dans IAM immédiatement, purgez l'historique git, utilisez OIDC/Secrets. » |
| `IG-SEC-002` | error | OpenAI : `\bsk-(?:proj-)?[A-Za-z0-9_\-]{32,}\b` (hors `sk-ant-`) | « Clé API OpenAI exposée. » → « Révoquez-la sur platform.openai.com et stockez-la dans GitHub Secrets. » |
| `IG-SEC-003` | error | Anthropic : `\bsk-ant-(?:api\d{2}-)?[A-Za-z0-9_\-]{80,}\b` | « Clé API Anthropic exposée. » → « Révoquez-la dans la console Anthropic. » |
| `IG-SEC-004` | error | Stripe : `\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b` (les `*_test_` donnent `warning`) | « Clé secrète Stripe exposée. » → « Roulez la clé dans le dashboard Stripe. » |
| `IG-SEC-005` | error | GitHub : `\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b` ou `\bgithub_pat_[A-Za-z0-9_]{60,}\b` | « Token GitHub exposé. » → « Révoquez-le dans Settings → Developer settings. » |

Règles transverses secrets :
- **Jamais** afficher la valeur complète : masquage `AKIA************XYZ1` (4 premiers + 4 derniers caractères) dans rapport, annotations et logs.
- Faux positifs exclus : lignes contenant `# infraguard:ignore`, valeurs contenant `EXAMPLE`, `example`, `xxxx`, `your_`, `<...>`, `${...}`, `AKIAIOSFODNN7EXAMPLE`; fichiers `*.md` en `info` si dans un bloc de code.
- Dédoublonnage par `(ruleId, file, line)`.

#### Configuration `.infraguard.yml` (Pro)
```yaml
version: 1
ignore_rules: [IG-DKR-003, IG-TF-006]      # IDs ignorés (Free et Pro)
ignore_paths: ["examples/**", "**/*.test.tf"] # globs minimatch
severity_overrides:                          # facultatif
  IG-CMP-004: error
thresholds:
  max_volume_gb: 500
  ec2_min_size: 4xlarge
  rds_min_size: 4xlarge
  max_monthly_cost_usd: 1000                 # si total > seuil → finding IG-FIN-001 (error)
fail_on_severity: error                      # error | warning (défaut : error)
```
- Validation stricte : clé inconnue → `core.warning` (non bloquant) ; fichier absent → valeurs par défaut ; YAML invalide → `core.warning` + défauts.
- `IG-FIN-001` (Pro, error) : généré par le moteur si `estimated_monthly_cost > thresholds.max_monthly_cost_usd`.
- Config ignorée en Free (notice : « `.infraguard.yml` détecté : fonctionnalité Pro »).
- Ignore inline : commentaire `# infraguard:ignore IG-XXX-NNN` sur la ligne de la ressource/instruction (Free et Pro).

#### `fail_on_error` (Pro)
- `fail_on_error: true` ET tier Pro → `core.setFailed("InfraGuard : N finding(s) ≥ <seuil>")` si au moins un finding de sévérité ≥ `fail_on_severity` (défaut `error`) après filtrage.
- En Free, `fail_on_error` est ignoré avec `core.notice` ; **le job ne échoue jamais** en Free.

---

## 4. Module de licence Polar.sh (`src/license/polar.ts`)

### 4.1 Appel
- `POST https://api.polar.sh/v1/customer-portal/license-keys/validate`
- Headers : `Accept: application/json`, `Content-Type: application/json` (aucun header `Authorization` requis)
- Body JSON : `{ "key": "<license_key>", "organization_id": "5e25eb4f-321a-4e5f-b909-1ec156b374bd" }` (`POLAR_ORG_ID`). Une clé vide/espaces → tier Free, **aucun appel**.
- Aucune donnée du repo envoyée.

### 4.2 Réponse exploitée
```json
{ "id": "lk_123", "organization_id": "5e25eb4f-321a-4e5f-b909-1ec156b374bd", "status": "granted", "expires_at": null }
```
Pro accordé si : HTTP 200 **et** `status === "granted"` **et** `expires_at` non dépassé.

### 4.3 Matrice de décision
| Situation | Tier | Comportement CI | Log |
|-----------|------|-----------------|-----|
| Pas de `license_key` | Free | normal | notice « Mode Free » |
| 200 + `status: "granted"` (non expirée) | **Pro** | normal | notice « Licence Pro valide » |
| 200 + `status !== "granted"` (`revoked`, `disabled`, expirée) / 404 / 422 / 400 | **Free** | normal, **jamais d'échec** | warning « Licence invalide (<raison>), repli en mode Free » |
| **Timeout 5 s**, erreur réseau/DNS, 5xx, 429, JSON illisible | **Pro (fail-open)** | normal | warning « API Polar.sh injoignable — licence présumée valide (fail-open) » |

> Décision de conception : le fail-open **accorde** le Pro (le client ayant fourni une clé n'est pas pénalisé par notre dépendance externe) et ne bloque **jamais** la CI. Un rapport affiche alors le badge « Pro (licence non vérifiée) ».

### 4.4 Timeout & robustesse
- `AbortController` + `setTimeout(5000)` ; 5000 ms total, **aucun retry** (pas de délai ajouté à la CI) ; `clearTimeout` dans `finally`.
- Aucune exception ne remonte : la fonction retourne toujours `{ tier, reason, verified: boolean }`.
- La clé n'est jamais loggée (`core.setSecret`) ; messages d'erreur sans corps de réponse brut.
- Interface testable : `validateLicense(key, { fetchImpl = fetch, timeoutMs = 5000 })`.

---

## 5. Format des sorties

### 5.1 Commentaire de PR (idempotent)
- **Marqueur caché** en toute première ligne : `<!-- infraguard-report -->`.
- Upsert : `issues.listComments` (paginé) → premier commentaire dont `body` contient le marqueur **et** `user.type === 'Bot'` ; si trouvé → `issues.updateComment`, sinon `issues.createComment`. Jamais de duplication, même en cas de relance. `comment: false` → pas de commentaire.
- Aucun finding → le commentaire existant est mis à jour avec la version « ✅ Aucun problème » (pas supprimé).
- Droits insuffisants (PR de fork, 403) → `core.warning` explicite + résumé dans `GITHUB_STEP_SUMMARY`, **pas d'échec**.
- Taille max 60 000 caractères (limite 65 536) ; au-delà, tronquer les lignes de détail et ajouter « … N autres findings masqués ».

**Gabarit exact :**
```markdown
<!-- infraguard-report -->
## 🛡️ InfraGuard FinOps & Security — Rapport

**Plan :** Free | Pro | Pro (licence non vérifiée) · **Fichiers analysés :** {n} · **Findings :** {total}
| 🔴 Errors | 🟠 Warnings | 🔵 Infos | 💸 Surcoût mensuel estimé |
|:--:|:--:|:--:|:--:|
| {e} | {w} | {i} | {≈ $X /mois ou — (Pro)} |

### 🐳 Docker & Compose
| Sév. | Règle | Fichier | Ligne | Problème | Remédiation |
|:--:|---|---|:--:|---|---|
| 🟠 | `IG-DKR-001` | `Dockerfile` | 1 | … | … |

### ☁️ Terraform (Pro)
| Sév. | Règle | Fichier:Ligne | Ressource | Surcoût/mois | Remédiation |
|:--:|---|---|---|--:|---|
| 🔴 | `IG-TF-001` | `infra/main.tf:12` | `aws_instance.gpu` | ~$2 234 | … |

### 🔑 Secrets exposés (Pro)
| Sév. | Règle | Fichier:Ligne | Valeur (masquée) | Remédiation |
|:--:|---|---|---|---|
| 🔴 | `IG-SEC-001` | `.env:3` | `AKIA************XYZ1` | … |

<details><summary>ℹ️ Détails & limites</summary>
Estimations de coûts indicatives (on-demand us-east-1, 730 h/mois). Règles ignorées : {liste}.
</details>

> 🔒 **Débloquez Terraform, détection de secrets, `.infraguard.yml` et `fail_on_error` avec InfraGuard Pro** → [COLLE_TON_CHECKOUT_URL_POLAR_ICI]   <!-- uniquement en Free -->

<sub>InfraGuard FinOps & Security v{version} · {date UTC}</sub>
```
Règles de rendu : sections sans finding **omises** ; en Free, les sections Terraform/Secrets sont remplacées par la ligne d'upsell unique ; tri par sévérité (error > warning > info), puis fichier, puis ligne ; pipes `|` et retours à la ligne échappés dans les cellules ; icônes : 🔴 error, 🟠 warning, 🔵 info.

### 5.2 Annotations inline
- Une annotation par finding, via `core.error` (sévérité `error`) ou `core.warning` (sévérité `warning` ; `info` → `core.notice`).
- Signature : `core.error(message, { title: '<ruleId>', file, startLine: line, endLine, startColumn? })`.
- Format du message : `[<ruleId>] <message> — <remédiation>`; titre : `InfraGuard <ruleId>`.
- Secrets : valeur masquée uniquement. Plafond de 50 annotations (limite GitHub par step) puis un `core.notice` final « N annotations supplémentaires voir le commentaire PR ».
- Sorties : `tier`, `findings_count`, `errors_count`, `estimated_monthly_cost_usd`. Résumé identique ajouté à `core.summary` (`GITHUB_STEP_SUMMARY`).

---

## 6. Stratégie de tests (Vitest)

### 6.1 Principes
- **Vitest** (`environment: node`), TypeScript, couverture `@vitest/coverage-v8` avec seuils **≥ 90 % lignes / 85 % branches** sur `src/`.
- Aucun appel réseau réel : `fetch` injecté (`fetchImpl`), `@actions/github` Octokit mocké (`vi.mock`), `@actions/core` espionné (`vi.spyOn`).
- Fixtures **réalistes** (Dockerfiles Node/Python/Go multi-stage, compose stack web+db+redis, Terraform VPC+EC2+RDS+ASG, `.env` fuités) sous `tests/fixtures/`, dont des **cas négatifs** (code conforme → 0 finding) et des **faux positifs** pièges.
- Snapshots (`toMatchSnapshot`) pour le Markdown ; tests déterministes (horloge figée `vi.useFakeTimers`).

### 6.2 Matrice de tests
| Module | Cas obligatoires |
|--------|------------------|
| dockerfile | `latest`, sans tag, `scratch`, alias de stage, `ARG` default, digest, multi-stage (USER seulement dans stage final), `USER root` final, `HEALTHCHECK NONE`, continuation `\`, casse mixte |
| compose | image sans tag, `${TAG:-latest}`, `build` seul, `deploy.resources.limits` complet/partiel, `mem_limit` legacy, `healthcheck.disable`, YAML invalide (no crash), anchors/merge keys `<<:` |
| terraform | GPU (`p3`, `g5`), `4xlarge` avec/sans ASG, RDS large avec/sans `max_allocated_storage`, EBS non chiffré, `root_block_device`, volume > 500 Go (calcul $ exact), `gp2` vs `gp3`, `var.x` default, commentaires/heredoc, `count = 3`, type inconnu → `n/d` |
| secrets | 1 vrai positif par fournisseur (clés fictives générées au format), faux positifs (`EXAMPLE`, placeholders), masquage, ligne ajoutée vs contexte du patch, `infraguard:ignore`, fichier binaire |
| license | valid/invalid/expired/disabled, mauvais `product_id`, **timeout 5 s** (fake timers + fetch jamais résolu), erreur réseau, 500, 429, JSON corrompu, clé vide (0 appel fetch), clé jamais loggée, payload exact (`license_key=…`, headers) |
| config | valide, clés inconnues, YAML invalide, seuils, `ignore_rules`, `ignore_paths`, `severity_overrides`, ignoré en Free |
| filter/engine | Free n'exécute pas Terraform/secrets, Pro oui, `IG-FIN-001`, `fail_on_severity` |
| markdown | snapshot Free/Pro/aucun finding/fail-open, sections omises, échappement `|`, troncature > 60 000 caractères, tri |
| annotations | mapping sévérité → `core.error`/`warning`/`notice`, plafond 50, paramètres file/line |
| comment (intégration) | aucun commentaire existant → `create` ; existant avec marqueur → `update` (1 seul appel, pas de `create`) ; commentaire humain contenant le marqueur ignoré ; pagination ; 403 fork → warning sans échec |
| main-flow (intégration) | Free sans clé ; Pro valide + `fail_on_error` → `setFailed` ; Pro fail-open ; événement non-PR ; exception interne → warning + exit 0 |

### 6.3 CI du projet (`.github/workflows/ci.yml`)
`npm ci` → `npm run lint` → `npm test` → `npm run build` → `git diff --exit-code dist/`. Job d'auto-test (« dogfooding ») exécutant l'action locale (`uses: ./`) sur les fixtures.

---

## 7. Hors périmètre (v1)
Autres clouds (Azure/GCP), Kubernetes/Helm, modules Terraform distants, estimation de coûts hors table statique, stockage de licences, télémétrie, fichiers `.tfvars`/`.tf.json`.

## 8. Critères d'acceptation globaux
- [x] 1. Action Free fonctionnelle sans aucune clé ni secret autre que `github_token`.
- [x] 2. Deux exécutions successives sur la même PR → **un seul** commentaire.
- [x] 3. API Polar.sh coupée → CI jamais cassée, Pro présumé, warning visible.
- [x] 4. Aucune valeur de secret complète dans les logs, annotations, commentaire.
- [x] 5. `dist/index.js` à jour et exécutable en Node 20 sans `npm install`.
- [x] 6. Tous les tests passent, couverture ≥ seuils.
