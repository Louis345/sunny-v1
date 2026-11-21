# Keeping Sunny's size under control: plan (draft, 2026-11-13)

**Owner:** "decouple this, and backups should be on GitHub."

## What's using the space (measured tonight)

**This Mac: 68 GB of Sunny, 2.2 GB free (disk full)**

| What | Size |
|---|---|
| About 66 extra full copies of Sunny (`~/Development/sunny-*`, one per past task or PR) | ~47 GB |
| Old Claude session copies inside `sunny/.claude/worktrees` (15 of them) | 14 GB |
| Main checkout (web build, packages, git, other copies) | ~7 GB |

**Saori: 22 GB of Sunny data, about 11 GB free**

| What | Size |
|---|---|
| Deploy backups (24, about 1 GB each) | 13 GB |
| Archive (manual copies from 11/08, about 550 MB each) | 8.4 GB |
| **The databases (the real record)** | **7 MB** (Ila 5.7, Reina 1.3) |

**Why each backup is 1 GB when the record is 7 MB.** Each backup also copies `src/context/ila`, which is
994 MB inside the code folder. Most of that can be regenerated or is diagnostic:

| Inside Ila's folder | Size | What it is |
|---|---|---|
| `cycles/.planner/.../provider-diagnostics` | ~200 MB+ | A full copy of every prompt sent to the Planner, dozens of 5 MB+ files |
| `direct-drafts` | 299 MB | Game drafts the builder made |
| `canvas-verification` | 120 MB | Screenshots from the board checks |
| `games` | 20 MB | The built games she plays |
| The week records, plans, traces, conversations | a few MB | **The real history** |

## The idea: three tiers, each with its own rule

| Tier | What | Rule |
|---|---|---|
| **1. The record**: never lose it | The databases, week records (cycles) without the diagnostics, graded uploads, documents (IEP, notes, scans), the living profile | Backed up off this machine every night. Kept forever |
| **2. Rebuildable** | Built games and pictures still on a live board | Kept while a board uses them. The picture library is reused |
| **3. Scratch** | Planner prompt dumps, game drafts, check screenshots, logs | Kept 14 days (dumps from failed runs: 60 days), then deleted automatically |

## The plan, in order

**1. Clean this Mac now (frees about 50–60 GB).**
- A read-only check of every `sunny-*` copy and every old session copy: is everything in it already on
  GitHub?
- You get a list in two groups, "safe to delete" and "has unsaved work".
- I delete only the safe ones, after your yes.
- **Rule from now on:** at most 5 working copies. A copy is deleted when its PR merges.

**2. Stop the bloat at the source (one small PR).**
- **Deploy backups take only tier 1:** about 20–50 MB instead of 1 GB. Keep the newest 10.
- **Tier 3 is cleaned up automatically on startup.** It's logged (" 🎮 [storage] [pruned] …") and never
  blocks startup.
- **The Planner keeps only one summary line per prompt**, not the whole prompt, unless the call failed.
- **Saori's old 8.4 GB archive and old backups get deleted**, once the new backup is proven (your yes first).

**3. Off-machine backup on GitHub (your request).**
- **A separate private repository,** e.g. `sunny-family-data`. Never the code repository.
- **Every night Saori packs tier 1** (databases plus records, about 20–50 MB), **encrypts it,** and uploads it
  to that repository as a dated release file.
- **Retention:** 30 daily, 12 monthly, then 1 a year.
- **Release files keep the repository itself tiny:** git history doesn't grow by 1 GB a night.
- **The decryption key lives in two places:** your password manager and this Mac. Without the key, the
  files on GitHub are unreadable, even to GitHub.
- **A restore test once a month,** done automatically: decrypt, open the database, count events, log the
  result.

**4. Decouple child data from code (bigger change, after PR #59).**
- **Move each child's data** from `src/context/<child>` (inside the code) to `~/SunnyData/<child>` (outside
  it). The code only reads it through one path setting, which the databases already use (`SUNNY_CHART_DIR`).
- **The code repository becomes code only.** Children's data is never in a code copy again, so new copies
  are small and can't leak anything.
- **This matches your earlier rule,** "data lives with the family, code lives in GitHub", and it's what lets
  a second family use Sunny later.

**5. Size report.**
- **`npm run sunny:size`** prints each tier's size on Saori and on this Mac.
- **Startup logs a warning** if Saori has under 10 GB free or a tier grows past its budget. It's a
  warning, never a blocker.

## A decision for you: child data on GitHub

The IEP, teacher notes and test scores will be the most private data Sunny holds. Encrypted, GitHub only
ever stores scrambled files. The risk is the key: if it's lost, the backups are lost too.

The alternative is an external drive or iCloud Drive on Saori: no key to lose, but a single location.

**Recommendation:** GitHub encrypted (as you asked), plus the key in your password manager.

## Not changing

How the record works: append-only, one file per child, nothing edited. Only where the files live, and how
long the scratch files are kept.
