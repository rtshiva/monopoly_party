// lint-arch: cheap structural guards for the monopoly-arch skill.
// Fails on hard boundary violations; warns on size drift.
// Run: node scripts/lint-arch.mjs  (wired into `npm run lint` -> `npm run verify`).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const failures = [];
const warnings = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, out);
    } else if (e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(root, p);

// 1. getIo() calls live only in store.ts (def) + core/broadcast.ts (boundary).
for (const f of walk(path.join(root, 'server', 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  if (/getIo\(\)/.test(src) && !/core\/broadcast\.ts$/.test(rel(f).replace(/\\/g, '/')) && !/store\.ts$/.test(f)) {
    failures.push(`${rel(f)}: getIo() outside broadcast.ts — use emit()/notifyEvicted()`);
  }
}

// 2. No bare acks: every { ok: false } must carry a typed GameError.
for (const f of walk(path.join(root, 'server', 'src'))) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (
      /\{\s*ok:\s*false\s*\}\s*\)/.test(l) &&
      !/NO_|BAD_|TIME_|GAME_|PENDING_|ROLL_|NOT_|ALREADY_|STALE_|NEED_|AUCTION_|BID_|NEGATIVE/.test(l)
    ) {
      // Allow the line if the error code sits on the next line (multiline ack).
      const next = lines[i + 1] ?? '';
      if (!/error:\s*'/.test(next)) failures.push(`${rel(f)}:${i + 1}: bare { ok: false } without GameError`);
    }
  });
}

// 3. No magic log-cap: use MAX_LOG_ENTRIES.
for (const f of walk(path.join(root, 'server', 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  if (/slice\(0,\s*80\)/.test(src)) failures.push(`${rel(f)}: magic slice(0, 80) — use MAX_LOG_ENTRIES`);
}

// 4. Math.random in shared/ is warn-only: dice/card draws use it by design
// (documented as "Random (no state mutation)" in engine.ts). Flagged here so
// new RNG call sites get a second look for determinism impact.
for (const f of walk(path.join(root, 'shared', 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  if (/Math\.random/.test(src))
    warnings.push(`${rel(f)}: Math.random in shared/ — dice/card RNG by design, keep it out of new helpers`);
}

// 5. Size signal (warn-only): one concern per file, ~150 lines.
for (const f of [...walk(path.join(root, 'server', 'src')), ...walk(path.join(root, 'shared', 'src'))]) {
  const n = fs.readFileSync(f, 'utf8').split('\n').length;
  if (n > 200) warnings.push(`${rel(f)}: ${n} lines (>200) — consider a split`);
}

for (const w of warnings) console.log(`WARN ${w}`);
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}
console.log(`arch ok (${warnings.length} size warning(s))`);
