import { execFileSync } from 'node:child_process';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const stagedOnly = process.argv.includes('--staged');
const paths = git(stagedOnly
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
  : ['ls-files', '-z']).split('\0').filter(Boolean);
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['API token', /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
  ['credential in URL', /https?:\/\/[^\s/:"'<>]+:[^\s/@"'<>]+@/],
  ['password or API key assignment', /["']?\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi]
];
const placeholder = /^(?:example|sample|dummy|test|placeholder|your[_ -]|replace[_ -]|changeme|process\.env|\$\{|<)/i;
const failures = [];

for (const path of paths) {
  const name = path.split('/').pop();
  if ((/^\.env(?:\.|$)/i.test(name) && !/^\.env\.(?:example|sample)$/.test(name)) ||
      /\.(?:pem|key|p12|pfx)$/i.test(name) ||
      /^(?:\.npmrc|\.netrc|\.git-credentials|credentials.*\.json|service-account.*\.json)$/i.test(name) ||
      /(?:^|\/)(?:\.aws|\.ssh|secrets|credentials)\//.test(path)) {
    failures.push(`${path}: sensitive filename`);
    continue;
  }
  const content = git(['show', `:${path}`]);
  const texts = [content];
  // The portable game embeds its application JavaScript as base64.
  for (const match of content.matchAll(/atob\(['"]([A-Za-z0-9+/=]{128,})['"]\)/g)) {
    texts.push(Buffer.from(match[1], 'base64').toString('utf8'));
  }
  for (const [label, pattern] of patterns) {
    const found = texts.some(text => {
      pattern.lastIndex = 0;
      if (!pattern.global) return pattern.test(text);
      return [...text.matchAll(pattern)].some(match => !placeholder.test(match[1]));
    });
    if (found) failures.push(`${path}: possible ${label}`);
  }
}

if (failures.length) {
  console.error('Commit blocked. Review these files locally; secret values are not printed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Secret check passed (${paths.length} staged/tracked files).`);
}
