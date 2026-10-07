import { expect, test } from './support';

// Flow 1 — navigation, validation and persistence of the options.

test.describe('Options', () => {
  test('navigates from the menu and back @mobile', async ({ app, page }) => {
    await app.open();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('rejects out-of-range values with accessible errors', async ({ app, page }) => {
    await app.open();
    await page.getByRole('button', { name: 'Options' }).click();
    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    const spawn = page.getByRole('spinbutton', { name: 'Enemy spawn time' });

    await session.fill('59');
    await spawn.fill('0.75');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('alert')).toHaveText([
      'Enter a whole number of seconds between 60 and 180.',
      'Enter a number of seconds in steps of 0.5 between 1 and 30.',
    ]);
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(session).toBeFocused();
    await expect(page.getByTestId('options-status')).toHaveText('');

    // (Number inputs refuse non-numeric text, so only numeric and empty values are tried.)
    for (const bad of ['181', '120.5', '']) {
      await session.fill(bad);
      await expect(page.getByText('Enter a whole number of seconds between 60 and 180.')).toBeVisible();
    }
    for (const bad of ['0', '31', '-2']) {
      await spawn.fill(bad);
      await expect(page.getByText('Enter a number of seconds in steps of 0.5 between 1 and 30.')).toBeVisible();
    }
  });

  test('saves valid values, keeps them after a refresh and applies them to the next match', async ({ app, page }) => {
    await app.open();
    await page.getByRole('button', { name: 'Options' }).click();

    // The +/- buttons respect the limits.
    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    await session.fill('70');
    await page.getByRole('button', { name: 'Decrease game session time' }).click();
    await expect(session).toHaveValue('60');
    await expect(page.getByRole('button', { name: 'Decrease game session time' })).toBeDisabled();

    await page.getByRole('spinbutton', { name: 'Enemy spawn time' }).fill('2.5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('options-status')).toHaveText('Options saved. They apply to your next match.');

    await page.reload();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('60');
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('2.5');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await app.startMatch();
    await expect(page.getByTestId('hud-time')).toHaveText('01:00');
  });

  test('restores defaults', async ({ app, page }) => {
    await app.open({ options: { sessionDurationSec: 90, enemySpawnIntervalSec: 6 } });
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('button', { name: 'Restore defaults' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('120');
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('4');
  });
});
