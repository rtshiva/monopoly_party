/**
 * smoke.spec.ts — One real-browser loop: host creates, phone joins, host
 * starts, whoever is current rolls, both screens observe the result.
 *
 * Turn order shuffles at start, so the roller is whoever's page shows the
 * roll button (phone, else the host seat via a second TV-context page that
 * shares the host key). No dice assumptions: assertions are outcome-agnostic.
 */
import { expect, test, type Page } from '@playwright/test';

const rollButton = (page: Page) => page.getByRole('button', { name: /shake the dice/i });
const revOf = async (page: Page): Promise<number> => {
  const bar = page.getByText(/🐞 debug · room/);
  await expect(bar).toBeVisible({ timeout: 15000 });
  const text = (await bar.textContent()) ?? '';
  return Number(/rev (\d+)/.exec(text)?.[1] ?? -1);
};

async function visibleSoon(locator: ReturnType<Page['getByRole']>): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

test('host + phone full loop with live broadcast', async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tv = await tvCtx.newPage();
  const phone = await phoneCtx.newPage();

  // 1. Host creates a room (debug overlay on: rev counter proves broadcasts).
  await tv.goto('/?debug=1');
  await tv.getByPlaceholder('e.g. Siva').fill('TVHost');
  await tv.getByRole('button', { name: /Create room \+ show board/ }).click();
  await expect(tv).toHaveURL(/\/host\/[A-Z0-9]{6}/, { timeout: 15000 });
  const code = tv.url().split('/host/')[1]!.split('?')[0]!;
  await tv.goto(`/host/${code}?debug=1`);

  // 2. Phone joins with the code.
  await phone.goto('/');
  await phone.getByPlaceholder('e.g. Siva').fill('Phone');
  await phone.getByPlaceholder('K7Q2XD').fill(code);
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone).toHaveURL(new RegExp(`/play/${code}`), { timeout: 15000 });

  // 3. Host sees both seats, then starts the game.
  // (Token + name pills are unique per seat; bare names repeat in the feed.)
  await expect(tv.getByText('🚗 TVHost')).toBeVisible({ timeout: 10000 });
  await expect(tv.getByText('🚗 Phone')).toBeVisible({ timeout: 10000 });
  await tv.getByRole('button', { name: /Start game with 2 players/ }).click();
  const revBefore = await revOf(tv);

  // 4. Whoever is current rolls: the phone seat, else the host seat through
  // a second TV-context page (shares host key via localStorage).
  let roller: Page = phone;
  if (!(await visibleSoon(rollButton(phone)))) {
    const sessions = await tv.evaluate(() => JSON.parse(localStorage.getItem('monopoly.sessions') || '{}'));
    const hostPid: string | undefined = sessions[code]?.pid;
    expect(hostPid).toBeTruthy();
    const hostPlay = await tvCtx.newPage();
    await hostPlay.goto(`/play/${code}?pid=${hostPid}&debug=1`);
    await expect(rollButton(hostPlay)).toBeVisible({ timeout: 15000 });
    roller = hostPlay;
  }
  await rollButton(roller).click();

  // 5. The roll resolves and broadcasts to both browsers.
  await expect(roller.getByText(/rolled \d\+\d=/)).toBeVisible({ timeout: 15000 });
  const revAfter = await revOf(tv);
  expect(revAfter).toBeGreaterThan(revBefore);

  await tvCtx.close();
  await phoneCtx.close();
});
