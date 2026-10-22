# Repository Workflow

- Preserve existing game behavior and user files unless the requested change requires editing them.
- After game changes, regenerate `outputs/pathcode-3d.html` with `pnpm run build:portable` and include it with the source changes.
- Keep dependencies, caches, local backups, credentials, and environment secrets out of Git.
- Configure the local commit hook with `git config --local core.hooksPath .githooks` after cloning.
- Review staged changes and run `node scripts/check-secrets.mjs --staged` before committing.
- Use the existing origin repository. Do not replace existing remote history or force push.
- Never push until the human user explicitly approves the concrete outgoing changes. Show the target repository, branch, and change summary before requesting that approval.
