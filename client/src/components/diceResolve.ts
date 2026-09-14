/**
 * Which dice faces should the phone render?
 *
 * The roller sees a local shuffle preview (random faces) while actively
 * shaking or while the commit is in flight. In every other state — including
 * when a stray post-commit tick resurrects the preview — the authoritative
 * server dice win, so this phone can never disagree with the TV.
 *
 * Pure: unit-covered by a throwaway node script (no client test runner yet).
 */
export function resolveDiceFaces(
  preview: readonly [number, number] | null,
  active: boolean,
  dice: readonly [number, number],
): readonly [number, number] {
  return active && preview ? preview : dice;
}
