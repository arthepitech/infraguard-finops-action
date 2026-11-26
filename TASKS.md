# TASKS.md — InfraGuard FinOps & Security

> Statut : **TERMINÉ — 37/37 tâches validées (v1.0.0)**. Référence : `SPEC.md`.

## Règles d'exécution
- Une tâche à la fois (règle n°4). Après chaque tâche : lancer la commande de validation, cocher `[x]`, résumer en 3 lignes, **s'arrêter** et attendre validation.
- Toutes les commandes passent par WSL. Préfixe (noté `WSL>` ci-dessous) :
  `wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/Megaport/Code/infraguard-finops-action && <commande>"`
- Les tests unitaires sont écrits **avec** chaque module (tests + fixtures dans la même tâche).
- Tâche « Validation » = commande exacte à exécuter ; elle doit retourner le code 0.

---

## Phase 1 — Initialisation du projet

- [x] **Tâche 1.1 : Initialiser `package.json` et `.gitignore`**
  - Créer : `package.json` (engines node >=20, scripts `build`, `test`, `test:cov`, `lint`, `format:check`, `all`), `.gitignore` (node_modules, coverage, lib ; PAS dist), `LICENSE`
  - Validation : `WSL> node -e "JSON.parse(require('fs').readFileSync('package.json'))" && echo OK`

- [x] **Tâche 1.2 : Installer les dépendances**
  - Modifier : `package.json`, créer `package-lock.json`
  - Runtime : `@actions/core`, `@actions/github`, `yaml`, `minimatch` ; Dev : `typescript`, `@vercel/ncc`, `vitest`, `@vitest/coverage-v8`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, `@types/node`
  - Validation : `WSL> npm ci && npm ls --depth=0`

- [x] **Tâche 1.3 : Configurer TypeScript**
  - Créer : `tsconfig.json` (ES2022, commonjs, strict, `noUncheckedIndexedAccess`, rootDir `src`, outDir `lib`, tests exclus)
  - Créer : `src/types.ts` (`Severity`, `Tier`, `Finding`, `Config`, `ChangedFile`)
  - Validation : `WSL> npx tsc --noEmit`

- [x] **Tâche 1.4 : Configurer ESLint et Prettier**
  - Créer : `.eslintrc.cjs`, `.eslintignore`, `.prettierrc`, `.prettierignore`
  - Validation : `WSL> npm run lint && npm run format:check`

- [x] **Tâche 1.5 : Configurer Vitest avec un test témoin**
  - Créer : `vitest.config.ts` (env node, coverage v8, seuils 90 % lignes / 85 % branches), `tests/unit/smoke.test.ts` (placeholder à supprimer en 2.x)
  - Validation : `WSL> npm test`

- [x] **Tâche 1.6 : Configurer le bundling @vercel/ncc**
  - Créer : `src/main.ts` (squelette minimal : log « InfraGuard ready » via `@actions/core`)
  - Modifier : `package.json` (`build` = `tsc --noEmit && ncc build src/main.ts -o dist --source-map --license licenses.txt`)
  - Validation : `WSL> npm run build && test -f dist/index.js && echo OK`

- [x] **Tâche 1.7 : Écrire `action.yml` complet**
  - Créer : `action.yml` (name, description ≤ 125 car., author, branding `shield`/`green`, inputs `github_token` `license_key` `fail_on_error` `config_path` `comment`, outputs `tier` `findings_count` `errors_count` `estimated_monthly_cost_usd`, `runs: node20` → `dist/index.js`)
  - Validation : `WSL> node -e "const y=require('yaml').parse(require('fs').readFileSync('action.yml','utf8'));if(y.runs.using!=='node20'||y.branding.icon!=='shield')process.exit(1);console.log('OK')"`

---

## Phase 2 — Moteur d'audit Gratuit

- [x] **Tâche 2.1 : Catalogue de règles Free**
  - Créer : `src/rules/free.ts` (IDs `IG-DKR-001..003`, `IG-CMP-001..004`, sévérités, messages, remédiations)
  - Créer : `tests/unit/rules-free.test.ts` (catalogue complet, IDs uniques)
  - Validation : `WSL> npx vitest run tests/unit/rules-free.test.ts`

- [x] **Tâche 2.2 : Parseur Dockerfile**
  - Créer : `src/analyzers/dockerfile-parser.ts` (continuations `\`, commentaires, casse, `FROM --platform … AS`, découpage en stages, numéros de ligne)
  - Créer : `tests/unit/dockerfile-parser.test.ts`, `tests/fixtures/docker/multistage.Dockerfile`
  - Validation : `WSL> npx vitest run tests/unit/dockerfile-parser.test.ts`

- [x] **Tâche 2.3 : Règle IG-DKR-001 (tag `latest` / non épinglé)**
  - Créer : `src/analyzers/dockerfile.ts` (fonction `analyzeDockerfile`, règle 001 : exclusions `scratch`, alias de stage, digest, `ARG` par défaut)
  - Créer : `tests/unit/dockerfile.test.ts`, `tests/fixtures/docker/bad.Dockerfile`, `good.Dockerfile`
  - Validation : `WSL> npx vitest run tests/unit/dockerfile.test.ts`

- [x] **Tâche 2.4 : Règles IG-DKR-002 (USER non-root) et IG-DKR-003 (HEALTHCHECK)**
  - Modifier : `src/analyzers/dockerfile.ts`, `tests/unit/dockerfile.test.ts`
  - Cas : multi-stage (stage final seul), `USER root/0`, `HEALTHCHECK NONE`, `scratch`
  - Validation : `WSL> npx vitest run tests/unit/dockerfile.test.ts`

- [x] **Tâche 2.5 : Parseur docker-compose avec numéros de ligne**
  - Créer : `src/analyzers/compose-parser.ts` (`yaml.parseDocument`, extraction `services.*`, lignes, anchors/merge keys, YAML invalide sans crash)
  - Créer : `tests/unit/compose-parser.test.ts`, `tests/fixtures/compose/good.yml`, `bad.yml`, `v2-legacy.yml`
  - Validation : `WSL> npx vitest run tests/unit/compose-parser.test.ts`

- [x] **Tâche 2.6 : Règles IG-CMP-001 (image) et IG-CMP-002 (user)**
  - Créer : `src/analyzers/compose.ts` (`analyzeCompose`, interpolation `${VAR:-défaut}`)
  - Créer : `tests/unit/compose.test.ts`
  - Validation : `WSL> npx vitest run tests/unit/compose.test.ts`

- [x] **Tâche 2.7 : Règles IG-CMP-003 (healthcheck) et IG-CMP-004 (limites CPU/RAM)**
  - Modifier : `src/analyzers/compose.ts`, `tests/unit/compose.test.ts`
  - Cas : `deploy.resources.limits` complet/partiel (info), `mem_limit`/`cpus` legacy, `healthcheck.disable`
  - Validation : `WSL> npx vitest run tests/unit/compose.test.ts`

- [x] **Tâche 2.8 : Détection des fichiers, ignore inline et moteur Free**
  - Créer : `src/engine/detect.ts` (patterns Docker/Compose/TF/secrets, exclusions), `src/engine/runner.ts` (dispatch par tier, Free uniquement pour l'instant), `src/engine/filter.ts` (ignore inline `# infraguard:ignore`, tri)
  - Créer : `tests/unit/detect.test.ts`, `tests/unit/filter.test.ts`, `tests/unit/runner-free.test.ts` ; supprimer `tests/unit/smoke.test.ts`
  - Validation : `WSL> npm test && npm run lint`

---

## Phase 3 — Client Lemon Squeezy et moteur Pro

- [x] **Tâche 3.1 : Client de licence Lemon Squeezy**
  - Créer : `src/license/lemonsqueezy.ts` (`validateLicense(key, {fetchImpl, timeoutMs=5000})`, POST form-urlencoded, contrôle `store_id`/`product_id`/`status`/`expires_at`, `AbortController`, aucun retry)
  - Créer : `tests/fixtures/lemonsqueezy/valid.json`, `invalid.json`, `expired.json`, `disabled.json`
  - Validation : `WSL> npm run lint`

- [x] **Tâche 3.2 : Tests du module de licence (matrice de décision §4.3)**
  - Créer : `tests/unit/license.test.ts` (valid, invalid, expired, disabled, mauvais produit, 404/400 → Free ; timeout 5 s via fake timers, réseau, 5xx, 429, JSON corrompu → Pro fail-open ; clé vide → 0 appel fetch ; payload/headers exacts ; clé jamais loggée)
  - Validation : `WSL> npx vitest run tests/unit/license.test.ts`

- [x] **Tâche 3.3 : Catalogue de règles Pro et table de prix**
  - Créer : `src/rules/pro.ts` (`IG-TF-001..006`, `IG-SEC-001..005`, `IG-FIN-001`), `src/rules/pricing.ts` (table statique, facteur de taille, calcul volumes)
  - Créer : `tests/unit/pricing.test.ts` (prix connus, type inconnu → facteur ou `null`, calcul `(size − seuil) × prix`)
  - Validation : `WSL> npx vitest run tests/unit/pricing.test.ts`

- [x] **Tâche 3.4 : Parseur Terraform tolérant**
  - Créer : `src/analyzers/terraform-parser.ts` (blocs `resource` à accolades équilibrées, attributs, blocs imbriqués, commentaires `#` `//` `/* */`, heredoc, `var.x` default, `count`, numéros de ligne)
  - Créer : `tests/unit/terraform-parser.test.ts`, `tests/fixtures/terraform/clean.tf`
  - Validation : `WSL> npx vitest run tests/unit/terraform-parser.test.ts`

- [x] **Tâche 3.5 : Règles IG-TF-001 (GPU) et IG-TF-002 (EC2 large sans ASG)**
  - Créer : `src/analyzers/terraform.ts` (`analyzeTerraform`, estimation de surcoût)
  - Créer : `tests/unit/terraform.test.ts`, `tests/fixtures/terraform/gpu.tf`, `ec2-large-asg.tf`
  - Validation : `WSL> npx vitest run tests/unit/terraform.test.ts`

- [x] **Tâche 3.6 : Règle IG-TF-003 (RDS large sans scaling)**
  - Modifier : `src/analyzers/terraform.ts`, `tests/unit/terraform.test.ts`
  - Créer : `tests/fixtures/terraform/rds-large.tf`
  - Validation : `WSL> npx vitest run tests/unit/terraform.test.ts`

- [x] **Tâche 3.7 : Règles IG-TF-004 (non chiffré), IG-TF-005 (disque > seuil), IG-TF-006 (gp2)**
  - Modifier : `src/analyzers/terraform.ts`, `tests/unit/terraform.test.ts`
  - Créer : `tests/fixtures/terraform/ebs-unencrypted.tf`
  - Validation : `WSL> npx vitest run tests/unit/terraform.test.ts`

- [x] **Tâche 3.8 : Détection de secrets (IG-SEC-001..005)**
  - Créer : `src/analyzers/secrets.ts` (regex AWS/OpenAI/Anthropic/Stripe/GitHub, lignes ajoutées via `patch`, masquage, faux positifs, dédoublonnage)
  - Créer : `tests/unit/secrets.test.ts`, `tests/fixtures/secrets/leaks.env.txt`, `false-positives.txt` (clés fictives au bon format)
  - Validation : `WSL> npx vitest run tests/unit/secrets.test.ts`

- [x] **Tâche 3.9 : Config `.infraguard.yml`**
  - Créer : `src/config/infraguard-config.ts` (parse, validation, défauts, clés inconnues → warning), `.infraguard.example.yml`
  - Créer : `tests/unit/config.test.ts`, `tests/fixtures/config/valid.infraguard.yml`, `invalid.infraguard.yml`
  - Validation : `WSL> npx vitest run tests/unit/config.test.ts`

- [x] **Tâche 3.10 : Intégration Pro dans le moteur (filtres, seuils, `IG-FIN-001`, `fail_on_severity`)**
  - Modifier : `src/engine/runner.ts`, `src/engine/filter.ts` (`ignore_rules`, `ignore_paths`, `severity_overrides`, seuil coût total, décision d'échec)
  - Créer : `tests/unit/runner-pro.test.ts` (Free n'exécute ni TF ni secrets ; Pro oui)
  - Validation : `WSL> npm test && npm run lint`

---

## Phase 4 — Intégration GitHub Actions

- [x] **Tâche 4.1 : Lecture et validation des inputs**
  - Créer : `src/config/inputs.ts` (`getInputs`, `core.setSecret(license_key)`, booléens, valeurs par défaut)
  - Créer : `tests/unit/inputs.test.ts`
  - Validation : `WSL> npx vitest run tests/unit/inputs.test.ts`

- [x] **Tâche 4.2 : Récupération des fichiers modifiés de la PR**
  - Créer : `src/github/files.ts` (`pulls.listFiles` paginé, exclusion `removed`, limite 300, taille > 1 Mo, binaires, récupération du contenu au SHA HEAD)
  - Créer : `tests/unit/files.test.ts`, `tests/fixtures/github/pulls-listFiles.json`
  - Validation : `WSL> npx vitest run tests/unit/files.test.ts`

- [x] **Tâche 4.3 : Générateur de rapport Markdown**
  - Créer : `src/report/markdown.ts` (gabarit §5.1, marqueur `<!-- infraguard-report -->`, sections omises, upsell en Free, échappement `|`, tri, troncature 60 000 car., badge fail-open)
  - Créer : `tests/unit/markdown.test.ts` (+ `tests/__snapshots__/`)
  - Validation : `WSL> npx vitest run tests/unit/markdown.test.ts`

- [x] **Tâche 4.4 : Commentaire PR idempotent**
  - Créer : `src/github/comment.ts` (`upsertComment` : pagination, marqueur + `user.type === 'Bot'`, create/update, 403 fork → warning + `GITHUB_STEP_SUMMARY`)
  - Créer : `tests/integration/comment-idempotence.test.ts`, `tests/fixtures/github/comments-existing.json`
  - Validation : `WSL> npx vitest run tests/integration/comment-idempotence.test.ts`

- [x] **Tâche 4.5 : Annotations inline**
  - Créer : `src/report/annotations.ts` (`core.error` / `core.warning` / `core.notice`, titre, `file`/`startLine`, plafond 50)
  - Créer : `tests/unit/annotations.test.ts`
  - Validation : `WSL> npx vitest run tests/unit/annotations.test.ts`

- [x] **Tâche 4.6 : Orchestration `main.ts` et outputs**
  - Modifier : `src/main.ts` (flux §2.2 : licence → fichiers → config Pro → moteur → rapport → annotations → commentaire → outputs → `core.setFailed` si `fail_on_error` Pro ; événement non-PR → notice ; try/catch global → warning, exit 0)
  - Créer : `tests/integration/main-flow.test.ts` (Free sans clé ; Pro valide + `fail_on_error` ; Pro fail-open ; événement non-PR ; exception interne)
  - Validation : `WSL> npm test && npm run lint && npx tsc --noEmit`

- [x] **Tâche 4.7 : Contrôle de couverture**
  - Modifier : tests manquants selon rapport
  - Validation : `WSL> npm run test:cov` (seuils ≥ 90 % lignes / 85 % branches)

---

## Phase 5 — Build final, CI et README

- [x] **Tâche 5.1 : Build final `dist/index.js`**
  - Modifier : `dist/index.js`, `dist/index.js.map`, `dist/licenses.txt` (générés et commités)
  - Validation : `WSL> npm run all && node -e "require('fs').accessSync('dist/index.js')" && echo OK`

- [x] **Tâche 5.2 : Workflow CI interne `.github/workflows/ci.yml`**
  - Créer : `.github/workflows/ci.yml` (jobs : `npm ci` → lint → test → build → `git diff --exit-code dist/` ; job dogfooding `uses: ./` avec `permissions: pull-requests: write, contents: read`, sans `license_key` = mode Free)
  - Validation : `WSL> node -e "const y=require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));if(!y.jobs)process.exit(1);console.log('OK')"`

- [x] **Tâche 5.3 : Workflow de release `.github/workflows/release.yml`**
  - Créer : `.github/workflows/release.yml` (sur tag `v*.*.*` : met à jour le tag flottant majeur `v1`)
  - Validation : `WSL> node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/release.yml','utf8'));console.log('OK')"`

- [x] **Tâche 5.4 : `README.md` optimisé SEO Marketplace**
  - Créer : `README.md` (H1 avec mots-clés FinOps/Terraform/Docker/secrets, pitch « Why », exemple de workflow copiable en 1er écran, permissions, tableau Free vs Pro, exemple de rapport, `.infraguard.yml`, FAQ licence/fail-open, confidentialité « 0 donnée envoyée », badges ; mots-clés SPEC §1.4)
  - Validation : `WSL> grep -c -i -E "finops|terraform|dockerfile|secret" README.md`

- [x] **Tâche 5.5 : Vérification finale**
  - Modifier : `package.json` (version 1.0.0), `.infraguard.example.yml` si nécessaire ; cocher les critères d'acceptation SPEC §8
  - Validation : `WSL> npm ci && npm run all && git diff --exit-code dist/`
