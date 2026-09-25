// Conventional Commits: `type(scope): subject`. Enforced by the commit-msg hook (lefthook.yml) and
// by the pull-request title check in CI, so the history stays readable and release notes can be
// generated from it.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    // Bodies routinely carry long URLs and command output.
    'body-max-line-length': [0],
    // A convention, not a gate: an unfamiliar scope warns instead of blocking the commit.
    'scope-enum': [
      1,
      'always',
      [
        'auth',
        'marketplace',
        'orders',
        'payments',
        'dealer',
        'farmer',
        'expert',
        'disease',
        'messaging',
        'notifications',
        'admin',
        'profile',
        'ui',
        'theme',
        'navigation',
        'backend',
        'db',
        'ci',
        'docs',
        'deps',
        'tooling',
        'android',
        'metro',
        'release',
        'security',
        'test',
      ],
    ],
  },
};
