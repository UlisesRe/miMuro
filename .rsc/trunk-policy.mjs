// Is the default branch closed for the agent in this project? (team-safe-default, part A)
//
// The spec leaves the call to the agent, change by change: complex or in production → branches;
// simple (scripts, research, personal) → straight on the default branch. That is judgement, and
// constitution P1 sends judgement to the skills. This module is only the FLOOR: the signals anyone
// can count — there is CI, there is a deployment, there is a team — which are the spec's own examples
// of "complejo o con producción". No signal: the floor stays open and the skill decides. A signal: the
// floor closes, and if the project is in fact simple the way out is the person asking to unlock it.
//
// `.rsc/.no-trunk-guard` is that unlock: a PROJECT switch (it travels in `.rsc.json` optOuts), set
// when somebody asks the agent «desbloquea main».
//
// Standalone on purpose: copied next to `branch-guard.mjs` and `knowledge-sync.mjs` under `.rsc/`.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const UNLOCK = '.no-trunk-guard';

const CI = ['.github/workflows', '.gitlab-ci.yml', '.circleci', 'azure-pipelines.yml', 'Jenkinsfile',
  'bitbucket-pipelines.yml', '.buildkite', '.travis.yml', '.woodpecker.yml', '.drone.yml'];
const DEPLOY = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
  'vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml', 'railway.json', 'railway.toml', 'Procfile',
  'app.yaml', 'serverless.yml', 'wrangler.toml', 'k8s', 'helm', 'Chart.yaml'];
const TEAM_COMMITS = 50;

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim();
  } catch { return null; }
}

const present = (root, rel) => {
  const path = join(root, rel);
  if (!existsSync(path)) return false;
  try { return readdirSync(path).length > 0; } catch { return true; } // a file, not a folder
};

/** The countable reasons this project looks complex or in production. Empty = looks simple. */
export function trunkSignals(root) {
  const out = [];
  const ci = CI.find((rel) => present(root, rel));
  if (ci) out.push(`CI (${ci})`);
  const deploy = DEPLOY.find((rel) => present(root, rel));
  if (deploy) out.push(`despliegue (${deploy})`);
  const authors = new Set((git(root, ['log', `-${TEAM_COMMITS}`, '--format=%ae']) || '').split('\n').filter(Boolean));
  if (authors.size >= 2) out.push(`equipo (${authors.size} personas en los últimos ${TEAM_COMMITS} commits)`);
  return out;
}

/** The default branch's name: the remote's HEAD, else main/master, else null. */
export function defaultBranchName(root) {
  const head = git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^refs\/remotes\/origin\//, '');
  for (const b of ['main', 'master']) {
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`])) return b;
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])) return b;
  }
  return null;
}

/** `{ closed, reason, signals }` — reason: 'unlocked' | 'simple' | 'signals'. */
export function trunkPolicy(root) {
  if (existsSync(join(root, '.rsc', UNLOCK))) return { closed: false, reason: 'unlocked', signals: [] };
  const signals = trunkSignals(root);
  return signals.length ? { closed: true, reason: 'signals', signals } : { closed: false, reason: 'simple', signals };
}

export const trunkClosed = (root) => trunkPolicy(root).closed;
