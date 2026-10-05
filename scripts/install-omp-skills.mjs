#!/usr/bin/env node
import { lstat, mkdir, readFile, readdir, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const buckets = ['skills/engineering', 'skills/productivity'];
const overlay = 'adapters/omp/skills';

function within(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function exists(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function canonicalDestination(path) {
  const suffix = [];
  let probe = resolve(path);
  while (!(await exists(probe))) {
    suffix.unshift(basename(probe));
    probe = dirname(probe);
  }
  return resolve(await realpath(probe), ...suffix);
}

async function collect(repo) {
  const skills = new Map();
  for (const bucket of [...buckets, overlay]) {
    const entries = (await readdir(join(repo, bucket), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const source = await realpath(join(repo, bucket, entry.name));
      if (!within(repo, source)) throw new Error(`Source escapes the repository: ${source}`);
      const skillPath = join(source, 'SKILL.md');
      if (!(await exists(skillPath))) continue;
      const body = await readFile(skillPath, 'utf8');
      const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      const name = frontmatter?.match(/^name:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*$/m)?.[1];
      if (name !== entry.name || !/^description:\s*\S/m.test(frontmatter ?? '')) {
        throw new Error(`Invalid name or missing description: ${skillPath}`);
      }
      if (bucket === overlay) {
        if (!skills.has(name)) throw new Error(`OMP override has no upstream skill: ${name}`);
      } else if (skills.has(name)) {
        throw new Error(`Duplicate promoted skill: ${name}`);
      }
      skills.set(name, source);
    }
  }
  if (!skills.has('implement-spec')) throw new Error('Missing implement-spec skill');
  return skills;
}

export async function installOmpSkills({ repo, destination, dryRun = false }) {
  if (!destination) throw new Error('An explicit destination is required');
  repo = await realpath(resolve(repo));
  destination = resolve(destination);
  const destinationStat = await exists(destination);
  if (destinationStat && (!destinationStat.isDirectory() || destinationStat.isSymbolicLink())) {
    throw new Error(`Destination must be a real directory, not a file or symlink: ${destination}`);
  }
  if (within(repo, await canonicalDestination(destination))) {
    throw new Error('Destination resolves inside the source repository');
  }
  const skills = await collect(repo);
  const plan = [];
  // Preflight every destination before creating any links. Never replace existing content.
  for (const [name, source] of [...skills].sort(([a], [b]) => a.localeCompare(b))) {
    const target = join(destination, name);
    const stat = await exists(target);
    let action = 'link';
    if (stat) {
      if (!stat.isSymbolicLink() || resolve(dirname(target), await readlink(target)) !== source) {
        throw new Error(`Refusing to replace existing entry: ${target}`);
      }
      action = 'keep';
    }
    plan.push({ name, source, target, action });
  }
  if (dryRun) return plan;
  await mkdir(destination, { recursive: true });
  const created = [];
  try {
    for (const item of plan) {
      if (item.action === 'keep') continue;
      await symlink(item.source, item.target, 'dir');
      created.push(item);
    }
  } catch (error) {
    // Remove only links created by this invocation, and only if they still point to our source.
    for (const item of created.reverse()) {
      try {
        if ((await exists(item.target))?.isSymbolicLink() && await readlink(item.target) === item.source) {
          await unlink(item.target);
        }
      } catch { /* Preserve a concurrently changed entry instead of deleting it. */ }
    }
    throw error;
  }
  return plan;
}

async function main(args) {
  const usage = 'Usage: node scripts/install-omp-skills.mjs --dest <skills-directory> [--dry-run]';
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  let destination;
  let dryRun = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--dest' && !destination && args[index + 1] && !args[index + 1].startsWith('--')) {
      destination = args[++index];
    } else if (args[index] === '--dry-run' && !dryRun) {
      dryRun = true;
    } else throw new Error(usage);
  }
  if (!destination) throw new Error(usage);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const plan = await installOmpSkills({ repo, destination, dryRun });
  for (const item of plan) console.log(`${dryRun ? 'preview ' : ''}${item.action}: ${item.target} -> ${item.source}`);
  console.log('Existing skills and OMP configuration were not overwritten. Restart OMP to reload discovery.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
