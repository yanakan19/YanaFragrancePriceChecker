/**
 * Build the `createCommitOnBranch` GraphQL request body for
 * scripts/signed-commit.sh, and refuse rather than truncate if it is too big.
 *
 * Split out of the shell script for one reason: this is JSON containing
 * arbitrary file bytes. Assembling it by shell string concatenation would
 * mangle quotes, backslashes and newlines in precisely the files most likely
 * to contain them (every payload this touches is JSON snapshots), and a
 * corrupted body is the one failure mode that could plausibly land *wrong*
 * content rather than no content. JSON.stringify cannot get that wrong.
 *
 * Reads its inputs from the environment rather than argv so a file path
 * containing a space, a newline or a leading dash cannot be re-parsed as
 * something else on the way in.
 *
 *   ADDITIONS     newline-separated repo-relative paths to add or update
 *   DELETIONS     newline-separated repo-relative paths to delete
 *   MESSAGE       the commit message; first line is the headline
 *   BRANCH        branch name, e.g. claude/scentday-retailer-registry-h92tth
 *   REPO          "owner/name", i.e. GITHUB_REPOSITORY
 *   EXPECTED_OID  the commit the branch must still be at (the CAS guard)
 *   MAX_BYTES     refuse if the raw content sums above this
 *
 * Writes the request body to stdout, or exits non-zero with a reason on
 * stderr — which signed-commit.sh reports as "not attempted" and falls back
 * from, losing nothing.
 */
import { execFileSync } from 'node:child_process';

const lines = (v) => (v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

const additions = lines(process.env.ADDITIONS);
const deletions = lines(process.env.DELETIONS);
const message = process.env.MESSAGE ?? '';
const branch = process.env.BRANCH ?? '';
const repo = process.env.REPO ?? '';
const expectedOid = process.env.EXPECTED_OID ?? '';
const maxBytes = Number(process.env.MAX_BYTES ?? 0);

if (!branch || !repo || !expectedOid) {
  console.error('signed-commit-payload: BRANCH, REPO and EXPECTED_OID are all required');
  process.exit(1);
}
if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  console.error(`signed-commit-payload: REPO is not "owner/name": ${repo}`);
  process.exit(1);
}
if (additions.length === 0 && deletions.length === 0) {
  console.error('signed-commit-payload: nothing to add and nothing to delete');
  process.exit(1);
}

// From the index, not the working tree: what gets sent must be exactly what
// was staged, even if a later build step has since rewritten the file on disk.
// `git show :path` is the index copy by definition.
let total = 0;
const fileAdditions = [];
for (const path of additions) {
  let buf;
  try {
    buf = execFileSync('git', ['show', `:${path}`], { maxBuffer: 1024 * 1024 * 256 });
  } catch {
    console.error(`signed-commit-payload: could not read ${path} out of the index`);
    process.exit(1);
  }
  total += buf.length;
  if (maxBytes > 0 && total > maxBytes) {
    console.error(
      `signed-commit-payload: staged content exceeds the ${maxBytes}-byte cap at ${path} ` +
        `(${total} bytes so far) — this payload goes down the git path instead`,
    );
    process.exit(1);
  }
  fileAdditions.push({ path, contents: buf.toString('base64') });
}

// GitHub's own shape: a headline plus an optional body. Every CI message this
// script sees is a single line, but splitting properly costs nothing and keeps
// a multi-line message from being flattened into one unreadable headline.
const [headline, ...rest] = message.split('\n');
const body = rest.join('\n').replace(/^\n+/, '');

const query = `mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid url } }
}`;

const input = {
  branch: {
    repositoryNameWithOwner: repo,
    branchName: branch,
  },
  expectedHeadOid: expectedOid,
  message: body ? { headline, body } : { headline },
  fileChanges: {
    ...(fileAdditions.length > 0 ? { additions: fileAdditions } : {}),
    ...(deletions.length > 0 ? { deletions: deletions.map((path) => ({ path })) } : {}),
  },
};

process.stdout.write(JSON.stringify({ query, variables: { input } }));
