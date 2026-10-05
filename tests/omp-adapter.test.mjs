import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { installOmpSkills } from '../scripts/install-omp-skills.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omp-skills-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo with spaces');
  const destination = join(root, 'project with spaces', '.omp', 'skills');
  const add = async (bucket, name, body) => {
    const dir = join(repo, bucket, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), body ?? `---\nname: ${name}\ndescription: Test skill\n---\n`);
    return dir;
  };
  await add('skills/engineering', 'implement-spec');
  await add('skills/engineering', 'tdd');
  await add('skills/productivity', 'teach');
  const override = await add('adapters/omp/skills', 'implement-spec');
  return { root, repo, destination, add, override };
}

test('flattens promoted buckets and chooses the OMP override', async t => {
  const f = await fixture(t);
  const result = await installOmpSkills(f);
  assert.deepEqual(result.map(item => item.name), ['implement-spec', 'tdd', 'teach']);
  assert.equal(await readlink(join(f.destination, 'implement-spec')), f.override);
  assert.equal(await readlink(join(f.destination, 'tdd')), join(f.repo, 'skills/engineering/tdd'));
});

test('links entire directories so supporting files remain available', async t => {
  const f = await fixture(t);
  await writeFile(join(f.repo, 'skills/engineering/tdd/tests.md'), 'supporting file');
  await installOmpSkills(f);
  assert.equal(await readFile(join(f.destination, 'tdd/tests.md'), 'utf8'), 'supporting file');
});

test('excludes deprecated, misc, and in-progress skills', async t => {
  const f = await fixture(t);
  for (const bucket of ['deprecated', 'misc', 'in-progress']) await f.add(`skills/${bucket}`, 'not-installed');
  await installOmpSkills(f);
  assert.deepEqual((await readdir(f.destination)).sort(), ['implement-spec', 'tdd', 'teach']);
});

test('dry run makes no destination directory', async t => {
  const f = await fixture(t);
  const result = await installOmpSkills({ ...f, dryRun: true });
  assert.equal(result.length, 3);
  await assert.rejects(readdir(f.destination), { code: 'ENOENT' });
});

test('rerunning keeps matching symlinks', async t => {
  const f = await fixture(t);
  await installOmpSkills(f);
  assert.ok((await installOmpSkills(f)).every(item => item.action === 'keep'));
});

test('preflights all collisions and preserves an existing directory', async t => {
  const f = await fixture(t);
  const occupied = join(f.destination, 'teach');
  await mkdir(occupied, { recursive: true });
  await writeFile(join(occupied, 'keep.txt'), 'user data');
  await assert.rejects(installOmpSkills(f), /Refusing to replace/);
  assert.deepEqual(await readdir(f.destination), ['teach']);
  assert.equal(await readFile(join(occupied, 'keep.txt'), 'utf8'), 'user data');
});

test('preserves existing files', async t => {
  const f = await fixture(t);
  await mkdir(f.destination, { recursive: true });
  await writeFile(join(f.destination, 'tdd'), 'user file');
  await assert.rejects(installOmpSkills(f), /Refusing to replace/);
  assert.equal(await readFile(join(f.destination, 'tdd'), 'utf8'), 'user file');
});

test('does not replace another fork or a broken symlink', async t => {
  const f = await fixture(t);
  await mkdir(f.destination, { recursive: true });
  const target = join(f.destination, 'tdd');
  await symlink(join(f.root, 'absent'), target, 'dir');
  await assert.rejects(installOmpSkills(f), /Refusing to replace/);
  assert.equal(await readlink(target), join(f.root, 'absent'));
});

test('rejects a symlink as the destination itself', async t => {
  const f = await fixture(t);
  const actual = join(f.root, 'actual');
  await mkdir(actual);
  const destination = join(f.root, 'alias');
  await symlink(actual, destination, 'dir');
  await assert.rejects(installOmpSkills({ ...f, destination }), /real directory/);
});

test('rejects a destination inside the source repository', async t => {
  const f = await fixture(t);
  await assert.rejects(installOmpSkills({ ...f, destination: join(f.repo, '.omp/skills') }), /inside the source/);
});

test('detects a symlinked ancestor leading back into the source', async t => {
  const f = await fixture(t);
  const alias = join(f.root, 'alias');
  await symlink(f.repo, alias, 'dir');
  await assert.rejects(installOmpSkills({ ...f, destination: join(alias, 'new/skills') }), /inside the source/);
});

test('rejects duplicate promoted skill names', async t => {
  const f = await fixture(t);
  await f.add('skills/productivity', 'tdd');
  await assert.rejects(installOmpSkills(f), /Duplicate promoted skill/);
});

test('rejects an overlay that does not override an upstream skill', async t => {
  const f = await fixture(t);
  await f.add('adapters/omp/skills', 'unknown');
  await assert.rejects(installOmpSkills(f), /no upstream skill/);
});

test('rejects missing descriptions and name-directory mismatches', async t => {
  const f = await fixture(t);
  await f.add('skills/engineering', 'bad', '---\nname: different\n---\n');
  await assert.rejects(installOmpSkills(f), /Invalid name or missing description/);
});

test('never alters configuration files', async t => {
  const f = await fixture(t);
  await mkdir(dirname(f.destination), { recursive: true });
  const config = join(dirname(f.destination), 'config.yml');
  await writeFile(config, 'task:\n  maxConcurrency: 2\n');
  await installOmpSkills(f);
  assert.equal(await readFile(config, 'utf8'), 'task:\n  maxConcurrency: 2\n');
});

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = join(sourceRoot, 'adapters/omp/skills/implement-spec');

test('adapter retains explicit invocation and uses OMP skill loading', async () => {
  const body = await readFile(join(adapterRoot, 'SKILL.md'), 'utf8');
  assert.match(body, /^name: implement-spec$/m);
  assert.match(body, /^disable-model-invocation: true$/m);
  assert.match(body, /skill:\/\/tdd/);
  assert.match(body, /skill:\/\/code-review/);
  assert.match(body, /solutionSpace/);
  assert.match(body, /isolated: true/);
  assert.doesNotMatch(body, /\u2014/);
});

test('example bounds concurrency, disables recursion, and disables auto-apply', async () => {
  const config = await readFile(join(adapterRoot, 'config.example.yml'), 'utf8');
  assert.match(config, /^  maxConcurrency: 4$/m);
  assert.match(config, /^  maxRecursionDepth: 1$/m);
  assert.match(config, /^    merge: branch$/m);
  assert.match(config, /^    apply: false$/m);
});

test('requires an explicit installation destination', async t => {
  const f = await fixture(t);
  await assert.rejects(installOmpSkills({ repo: f.repo }), /explicit destination/);
});

test('ignores documentation directories without SKILL.md', async t => {
  const f = await fixture(t);
  await mkdir(join(f.repo, 'skills/engineering/reference'));
  const result = await installOmpSkills(f);
  assert.equal(result.length, 3);
});

test('preserves unrelated installed skills', async t => {
  const f = await fixture(t);
  const existing = join(f.destination, 'user-custom');
  await mkdir(existing, { recursive: true });
  await writeFile(join(existing, 'SKILL.md'), 'custom skill');
  await installOmpSkills(f);
  assert.equal(await readFile(join(existing, 'SKILL.md'), 'utf8'), 'custom skill');
});


test('adapter stops a failed wave before integration and requires approved seams', async () => {
  const body = await readFile(join(adapterRoot, 'SKILL.md'), 'utf8');
  assert.match(body, /user-approved test seams/);
  assert.match(body, /stop before integrating this batch/);
  assert.match(body, /Only then mark the ticket integrated/);
  assert.match(body, /coordinator is the only writer/);
  assert.match(body, /skill:\/\/codebase-design/);
});
