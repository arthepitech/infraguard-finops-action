# Règles strictes : Spec-Driven Development (SDD)

1. NE JAMAIS écrire ou modifier de code applicatif tant que `SPEC.md` et `TASKS.md` ne sont pas validés par l'utilisateur.
2. Toujours respecter l'architecture définie dans `SPEC.md` (TypeScript, Node 20+, `@vercel/ncc` pour bundler vers `dist/index.js`).
3. Contrainte absolue : 0 € d'infrastructure récurrente (exécution sur GitHub Runner + appel direct à l'API Lemon Squeezy pour les licences Pro).
4. Exécuter les tâches de `TASKS.md` UNE PAR UNE. Après chaque tâche : lancer les tests/lint/build, cocher la case `[x]` dans `TASKS.md`, résumer en 3 lignes et S'ARRÊTER pour attendre validation.
5. Environnement shell : Toujours exécuter les commandes via WSL Ubuntu (`wsl -d Ubuntu -- bash -lc "..."` ou `wsl -- bash -lc "..."`) et non en PowerShell natif.
