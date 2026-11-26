# 🛡️ InfraGuard FinOps & Security — Cloud Cost, Terraform, Dockerfile & Secret Scanning Action

[![CI](https://github.com/arthepitech/infraguard-finops-action/actions/workflows/ci.yml/badge.svg)](https://github.com/arthepitech/infraguard-finops-action/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/arthepitech/infraguard-finops-action?label=Release&color=2ea44f)](https://github.com/arthepitech/infraguard-finops-action/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20](https://img.shields.io/badge/Runtime-Node%2020-339933?logo=node.js)](https://nodejs.org/)
[![Zero Telemetry](https://img.shields.io/badge/Telemetry-Zero%20%2F%20100%25%20Runner-success)](#privacy--security)

**Stop AWS cloud waste, container misconfigurations, and leaked API secrets before merge — directly in your Pull Request, in under 10 seconds, with zero external infrastructure.**

InfraGuard FinOps & Security is a fast, zero-config **DevSecOps & FinOps GitHub Action** (a lightweight **hadolint alternative** and **tfsec alternative**) that audits only the files changed in each Pull Request, posts a single **idempotent Markdown report** (`<!-- infraguard-report -->`), and emits inline GitHub code annotations.

---

## ⚡ 30-Second Quickstart (Free Tier — No Account or Key Required)

Create `.github/workflows/infraguard.yml`:

```yaml
name: InfraGuard FinOps & Security

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  infraguard:
    runs-on: ubuntu-latest
    steps:
      - name: Run InfraGuard Audit
        uses: arthepitech/infraguard-finops-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. Every Pull Request touching a `Dockerfile` or `docker-compose.yml` gets an instant audit comment that updates in place on new commits — zero spam, zero SaaS signup, zero cloud credentials.

### Enabling Pro (Terraform FinOps, Secret Scanning, `.infraguard.yml`, CI Gating)

```yaml
      - name: Run InfraGuard Audit (Pro)
        uses: arthepitech/infraguard-finops-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          license_key: ${{ secrets.INFRAGUARD_LICENSE_KEY }}
          fail_on_error: 'true'
```

---

## 📊 Pull Request Report Preview

Exact layout posted as a single, self-updating comment on your Pull Request:

> <!-- infraguard-report -->
> ## 🛡️ InfraGuard FinOps & Security — Rapport
>
> **Plan :** Pro · **Fichiers analysés :** 3 · **Findings :** 3
> | 🔴 Errors | 🟠 Warnings | 🔵 Infos | 💸 Surcoût mensuel estimé |
> |:--:|:--:|:--:|:--:|
> | 2 | 1 | 0 | ≈ $2 234 /mois |
>
> ### 🐳 Docker & Compose
> | Sév. | Règle | Fichier | Ligne | Problème | Remédiation |
> |:--:|---|---|:--:|---|---|
> | 🟠 | `IG-DKR-001` | `Dockerfile` | 1 | Image de base non épinglée (`node:latest`). | Épinglez une version précise (ex. `node:20.11-alpine`) ou un digest `@sha256:…` pour des builds reproductibles. |
>
> ### ☁️ Terraform (Pro)
> | Sév. | Règle | Fichier:Ligne | Ressource | Surcoût/mois | Remédiation |
> |:--:|---|---|---|--:|---|
> | 🔴 | `IG-TF-001` | `infra/main.tf:12` | `aws_instance.gpu` | ~$2 234 | Vérifiez le besoin ; préférez Spot, Savings Plans, ou une instance plus petite. |
>
> ### 🔑 Secrets exposés (Pro)
> | Sév. | Règle | Fichier:Ligne | Valeur (masquée) | Remédiation |
> |:--:|---|---|---|---|
> | 🔴 | `IG-SEC-001` | `.env:3` | `AKIA************XYZ1` | Révoquez la clé dans IAM immédiatement, purgez l'historique git, utilisez OIDC/Secrets. |
>
> <details><summary>ℹ️ Détails & limites</summary>
>
> Estimations de coûts indicatives (on-demand us-east-1, 730 h/mois). Règles ignorées : aucune.
> </details>
>
> <sub>InfraGuard FinOps & Security v1.0.0 · 2026-11-26 12:00:00 UTC</sub>

---

## 🎯 Why InfraGuard?

| Challenge | Heavyweight IaC / Cost Tools | InfraGuard FinOps & Security |
|---|---|---|
| **Onboarding** | SaaS account, API tokens, AWS IAM roles, binary installs | **1 YAML step**, runs natively on GitHub Runner (`node20`) |
| **Developer signal** | Noisy compliance dumps across untouched legacy files | **PR-diff scoped** high-signal cost, resource & secret checks |
| **Cloud cost visibility** | Bill shock at the end of the month | **Estimated monthly USD cost** inline before merge |
| **CI reliability** | External service downtime breaks your merges | **Fail-open license check (5s timeout)** — never breaks CI |

---

## 🆓 Free vs 🔒 Pro

| Capability | Free (Default) | Pro (`license_key`) |
|---|:---:|:---:|
| **Dockerfile audit** (`:latest` / untagged images, root `USER`, missing `HEALTHCHECK`) | ✅ | ✅ |
| **Docker Compose audit** (unpinned images, root user, missing healthcheck, missing CPU/RAM limits) | ✅ | ✅ |
| **Idempotent PR comment** (`<!-- infraguard-report -->`) & inline annotations (capped at 50) | ✅ | ✅ |
| **Inline suppressions** (`# infraguard:ignore IG-XXX-NNN`) | ✅ | ✅ |
| **Terraform `.tf` FinOps & Security** (GPU instances, unscaled large EC2/RDS, unencrypted EBS/RDS, oversized disks with USD/mo estimate, `gp2` → `gp3`) | — | ✅ |
| **Secret Scanning** on added PR lines (AWS, OpenAI, Anthropic, Stripe, GitHub) with strict value masking | — | ✅ |
| **Custom `.infraguard.yml`** (`ignore_rules`, `ignore_paths`, `severity_overrides`, custom thresholds & budget cap `IG-FIN-001`) | — | ✅ |
| **CI Merge Blocking** (`fail_on_error: true` + `fail_on_severity: error \| warning`) | — | ✅ |

👉 **[Upgrade to InfraGuard Pro → Get your license key](https://buy.polar.sh/polar_cl_1vY1xdhWPozSZfAU1VtaBbJC71nMOpuUl4ple4GQQPC)**

---

## ⚙️ Inputs & Outputs

### Inputs

| Input | Required | Default | Description |
|---|:---:|---|---|
| `github_token` | No | `${{ github.token }}` | GitHub token with `contents: read` and `pull-requests: write` to inspect PR files and upsert the report comment |
| `license_key` | No | `""` | Polar.sh Pro license key (leave empty to run in Free mode; automatically masked via `core.setSecret`) |
| `fail_on_error` | No | `'false'` | **Pro:** fail the workflow (`core.setFailed`) when findings reach `fail_on_severity` (`error` by default). Ignored in Free mode |
| `config_path` | No | `'.infraguard.yml'` | **Pro:** repository path to the custom YAML configuration file |
| `comment` | No | `'true'` | Post or update the single idempotent Pull Request comment (`true` / `false`) |

### Outputs

| Output | Description |
|---|---|
| `tier` | Active execution tier: `free` or `pro` |
| `findings_count` | Total number of findings after inline and config filtering |
| `errors_count` | Number of `error`-severity findings |
| `estimated_monthly_cost_usd` | Total estimated monthly USD cost delta (`0` in Free mode) |

---

## 📋 Audit Rules Reference

### Free Rules — Docker & Docker Compose

| Rule ID | Severity | Target | Impact | Trigger Condition |
|---|---|---|---|---|
| `IG-DKR-001` | 🟠 `warning` | `Dockerfile` | **Reproducibility & Security** — unpinned builds break unexpectedly or pull compromised images | `FROM` image uses `:latest` or omits both tag and `@sha256:` digest (resolves `ARG` defaults; ignores `scratch` and prior stage aliases) |
| `IG-DKR-002` | 🟠 `warning` | `Dockerfile` | **Container Escape Risk** — processes run with UID 0 privileges inside the container | Final build stage has no `USER` instruction or ends with `USER root` / `0` / `0:0` |
| `IG-DKR-003` | 🔵 `info` | `Dockerfile` | **Availability** — orchestrators cannot detect frozen containers | Final build stage omits `HEALTHCHECK` or sets `HEALTHCHECK NONE` (ignored for `FROM scratch`) |
| `IG-CMP-001` | 🟠 `warning` | `docker-compose*.yml` | **Reproducibility** — silent runtime drift across environments | Service `image` uses `:latest` or has no tag/digest (resolves `${VAR:-default}`; skips `build`-only services) |
| `IG-CMP-002` | 🟠 `warning` | `docker-compose*.yml` | **Least Privilege** — container runs as root | Service has no `user` key or sets `root` / `0` |
| `IG-CMP-003` | 🔵 `info` | `docker-compose*.yml` | **Availability** — degraded dependencies go undetected | Service omits `healthcheck` or sets `healthcheck.disable: true` |
| `IG-CMP-004` | 🟠 `warning` / 🔵 `info` | `docker-compose*.yml` | **FinOps & Stability** — noisy-neighbor OOM kills and runaway host resource usage | Missing both CPU & RAM limits (`warning`) or only one defined (`info`); supports `deploy.resources.limits` and legacy `cpus`/`mem_limit` |

### Pro Rules — Terraform Infrastructure as Code (IaC), FinOps & Secret Scanning

| Rule ID | Severity | Target | Impact | Trigger Condition |
|---|---|---|---|---|
| `IG-TF-001` | 🔴 `error` | `*.tf` | **Severe Cloud Cost Drift** ($380–$70,000+/mo) | `aws_instance`, `aws_launch_template`, or `aws_launch_configuration` using GPU / accelerated families (`p2`–`p5`, `g3`–`g6`, `inf1`/`inf2`, `trn1`, `dl1`, `f1`, `vt1`) |
| `IG-TF-002` | 🟠 `warning` | `*.tf` | **Cloud Waste** ($500+/mo idle compute) | Fixed EC2 instance `>= 4xlarge` (configurable) not attached to an `aws_autoscaling_group` |
| `IG-TF-003` | 🟠 `warning` | `*.tf` | **Cloud Waste** ($1,000+/mo overprovisioned DB) | `aws_db_instance` (`>= 4xlarge`) without `max_allocated_storage` or `aws_rds_cluster_instance` without `aws_appautoscaling_target` |
| `IG-TF-004` | 🔴 `error` | `*.tf` | **Data Exposure & Compliance** — plaintext disk/DB snapshots | `aws_ebs_volume`, `root_block_device`, `ebs_block_device` without `encrypted = true`, or `aws_db_instance` without `storage_encrypted = true` |
| `IG-TF-005` | 🟠 `warning` | `*.tf` | **Storage Cost Waste** (recurring $/GB/mo) | EBS volume or RDS `allocated_storage` `> 500 GB` (configurable) with excess monthly USD estimate |
| `IG-TF-006` | 🔵 `info` | `*.tf` | **Easy FinOps Quick Win** (~20% storage savings) | `aws_ebs_volume` or `root_block_device` using legacy `gp2` (or default) instead of `gp3` |
| `IG-SEC-001` | 🔴 `error` | Added PR lines | **Account Takeover / Cloud Billing Fraud** | Exposed AWS Access Key ID (`AKIA…`, `ASIA…`) or AWS Secret Access Key |
| `IG-SEC-002` | 🔴 `error` | Added PR lines | **API Quota & Billing Abuse** | Exposed OpenAI API key (`sk-…`, `sk-proj-…`) |
| `IG-SEC-003` | 🔴 `error` | Added PR lines | **API Quota & Billing Abuse** | Exposed Anthropic API key (`sk-ant-…`) |
| `IG-SEC-004` | 🔴 `error` / 🟠 `warning` | Added PR lines | **Financial & Payment Compromise** | Exposed Stripe live secret/restricted key (`error`) or test key (`warning`) |
| `IG-SEC-005` | 🔴 `error` | Added PR lines | **Repository & Supply-Chain Compromise** | Exposed GitHub token (`ghp_…`, `gho_…`, `ghs_…`, `github_pat_…`) |
| `IG-FIN-001` | 🔴 `error` | `.infraguard.yml` | **Budget Guardrail Breach** | Sum of estimated monthly USD costs exceeds `thresholds.max_monthly_cost_usd` |

---

## 🛠️ Configuration (`.infraguard.yml` — Pro)

Copy [`.infraguard.example.yml`](.infraguard.example.yml) to `.infraguard.yml` in your repository root:

```yaml
version: 1

ignore_rules:
  - IG-DKR-003
  - IG-TF-006

ignore_paths:
  - "examples/**"
  - "**/*.test.tf"

severity_overrides:
  IG-CMP-004: error

thresholds:
  max_volume_gb: 500
  ec2_min_size: 4xlarge
  rds_min_size: 4xlarge
  max_monthly_cost_usd: 1000

fail_on_severity: error # error | warning
```

Suppress any specific finding inline (supported in **both Free and Pro**) by adding `# infraguard:ignore IG-DKR-001` on the target line.

---

## 🔒 Privacy & Security

- **100% local execution:** Runs strictly inside your GitHub Actions runner (`node20`) with zero backend infrastructure.
- **Zero code egress & zero telemetry:** Your source code, Dockerfiles, Terraform files, and diffs **never leave GitHub**.
- **Strict secret redaction:** Every detected credential is masked (`AKIA************XYZ1`) in PR comments, annotations, and logs. `license_key` is masked immediately via `core.setSecret`.
- **Single optional outbound call:** Only when `license_key` is provided, InfraGuard sends `{ "key": "<license_key>", "organization_id": "5e25eb4f-321a-4e5f-b909-1ec156b374bd" }` to `POST https://api.polar.sh/v1/customer-portal/license-keys/validate` (no `Authorization` header, no repository metadata sent).

---

## ❓ FAQ

**What happens if the Polar.sh API is slow or unreachable?**
InfraGuard enforces a strict **5-second timeout (`AbortController`, zero retries)** and operates **fail-open**: on timeout, network error, 429, or 5xx, Pro features remain active with a `Pro (licence non vérifiée)` badge and a non-blocking warning. Your CI pipeline is never blocked by an external outage.

**What happens on Pull Requests from external forks (read-only `GITHUB_TOKEN`)?**
If GitHub responds with HTTP `403` when posting the comment, InfraGuard emits a clear warning, writes the full Markdown report to `GITHUB_STEP_SUMMARY`, and exits with code 0.

**How are monthly Terraform costs calculated?**
Using an embedded static on-demand `us-east-1` Linux pricing table (730 h/month) with `count` multipliers and family size scaling. Figures are clearly marked as indicative estimates to catch cost regressions early without requiring AWS credentials.

---

## 📄 License

[MIT](LICENSE)
