# OMP adapter

This fork adds an opt-in OMP execution path for `implement-spec`. The original Claude/Codex skills and plugin manifests are unchanged. OMP gets an override of the same skill name; the remaining promoted skills, including `tdd`, `codebase-design`, and `code-review`, come from upstream.

The adaptation covers the spec-implementation workflow and its skill dependencies. Installing the other skills does not mean every interactive workflow has been integration-tested under OMP.

## Install manually into an OMP skills directory

Manage installation yourself. Use `~/.omp/agent/skills` for user-wide installation or the target project's `.omp/skills` directory for project-only installation.

Copy or link each complete skill directory into one immediate child directory of the chosen skills root:

| Destination directory | Source directory in this checkout |
| --- | --- |
| `implement-spec` | `adapters/omp/skills/implement-spec` |
| `tdd` | `skills/engineering/tdd` |
| `codebase-design` | `skills/engineering/codebase-design` |
| `code-review` | `skills/engineering/code-review` |
| `setup-matt-pocock-skills` | `skills/engineering/setup-matt-pocock-skills` |

The setup skill configures the tracker before execution. Preserve supporting Markdown, templates, and scripts in every installed directory.

Use the OMP override for `implement-spec`, not `skills/engineering/implement-spec`. Check that each source directory contains its `SKILL.md` before installation.

Inspect existing destination entries before changing them. Resolve conflicting installations explicitly. Do not replace unrelated skills or OMP configuration.

Other promoted skills from `skills/engineering` and `skills/productivity` are optional. Install each selected skill one level deep, not as a bucket directory. Exclude deprecated, misc, and in-progress skills.

Keep this checkout at the same path if you use symlinks. Refresh copied directories after updates. Manage added and removed skills explicitly.

Restart OMP after installation. Check that `read skill://implement-spec` opens **Implement spec with OMP**. Check that the other installed skills and their supporting files are accessible.

An existing project installation or custom-directory override can win discovery precedence. Installing a second copy does not guarantee that OMP selects it.

## Configure the target project or worker

Merge the settings from [config.example.yml](adapters/omp/skills/implement-spec/config.example.yml) into the target project's `.omp/config.yml`. Do not replace an existing config file wholesale. Run OMP from that project directory and inspect the effective values with commands such as:

```bash
omp config get task.batch
omp config get task.maxConcurrency
omp config get task.maxRecursionDepth
omp config get task.isolation.enabled
omp config get task.isolation.merge
omp config get task.isolation.apply
omp config get async.enabled
```

The example selects four concurrent tasks, one child level, background execution, and isolated branch capture with automatic apply-back disabled. No provider, model, credentials, or permission policy is changed. Reviewers are children of the root coordinator too, so they do not require grandchildren.

OMP's protocol hosts can use different defaults from interactive sessions. When launching through Multica, validate these settings and tool availability in the actual worker execution mode. A successful interactive `omp config get` is not a protocol-host smoke test. The adapter stops before dispatch if its prerequisites are missing.

Invoke explicitly in OMP:

```text
/skill:setup-matt-pocock-skills
/skill:implement-spec <spec pointer>
```

The first command configures the project's tracker workflow. Perform interactive setup and approve test seams before unattended execution. For a Multica assignment, the root prompt can explicitly direct OMP to read `skill://implement-spec` and run it against the assigned spec. Do not assume a headless host expands interactive slash commands.

OMP treats `disable-model-invocation` as hiding a skill from automatic discovery, not an access-control boundary: direct reads remain possible. The adapter's explicit-invocation rule is an instruction; the recursion setting is the runtime limit.

## What changes from upstream

| Concern | OMP adaptation |
| --- | --- |
| Skill loading | `read skill://...`, including supporting files and nested skill references |
| Delegation | Native `task` batches with required `context` and per-item `solutionSpace` |
| Isolation | `isolated: true`, branch capture, no automatic apply-back |
| Concurrency | Four implementers by default, bounded by the effective harness limit |
| Scheduling | Bounded ready-frontier waves, then serial integration and verification |
| Completion | Captured branch and acceptance evidence, not just a child's success message |
| Dependencies | A local ledger of verified integration commits, independent of delayed issue closure |
| Review | Original Standards and Spec review prompts, scheduled by the root coordinator |
| Failure | Preserve artifacts, stop dispatch, and report blockers without closing issues |

Waves intentionally do not replenish continuously while other members of that wave run. This provides one known baseline per batch. Raising concurrency is a deployment choice, not an automatic response to a large frontier. Four Multica root runs with four child slots can still produce sixteen active children, plus the roots and build processes; the OMP setting is not a worker-wide quota.

Native isolation owns workspace creation and capture. The coordinator owns Git integration. Do not enable automatic apply-back while also using the coordinator's merge steps, and do not add the upstream merger subagent to this adapter. OMP can retain parked workspaces, so the adapter does not promise automatic immediate disk reclamation.

## Multica deployment

Distribute the override's entire directory as the `implement-spec` skill, plus the upstream `tdd`, `codebase-design`, and `code-review` directories. Preserve their supporting files. Configure the tracker instructions and the OMP settings separately; installing a skill does not configure the harness.

Use one dedicated checkout per root run, persistent recovery storage where needed, and separate Multica and OMP concurrency budgets. The adapter does not create Kubernetes Jobs or move child execution to another worker. OMP workspace isolation is not a security sandbox; worker credentials and OS/container permissions remain the security boundary.

## Validation

This adapter has no automated runtime tests. Manual installation does not validate OMP's native isolation layer or Multica.

Before unattended use, run these checks in a disposable project with approved test seams:

1. Confirm the installed skills resolve and the effective settings match this guide in the actual worker execution mode.
2. Run two independent tickets and a third that depends on both. Confirm separate isolated workspaces and captured branches without automatic apply-back. Confirm serial verified integration. The dependent ticket must start only after both blockers pass acceptance checks on the integration branch. Confirm both final review axes and no recursive implementation children.
3. Repeat with one failing acceptance test and one cancelled task. Neither ticket may count as complete. Confirm the coordinator preserves recovery artifacts.
4. Test a dirty checkout and unavailable isolation. Both must stop the workflow before writer dispatch.

## Source references

Reviewed against the upstream sources on 2026-10-06:

- [Upstream implement-spec](https://github.com/mattpocock/skills/blob/4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d/skills/engineering/implement-spec/SKILL.md)
- [Upstream TDD](https://github.com/mattpocock/skills/blob/4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d/skills/engineering/tdd/SKILL.md)
- [OMP skills and discovery](https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md)
- [OMP task schema and lifecycle](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md)
- [OMP task settings](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/task/settings.ts)
- [OMP isolation capture](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/task/isolation-runner.ts)

Treat the observed task schema as a compatibility requirement, not a promise about every released OMP version. Recheck it when upgrading the worker image.
