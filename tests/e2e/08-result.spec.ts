import { expect, test } from './support';

// Flow 8 — the result screen and its persistence after a refresh.

test.describe('Result', () => {
  test('shows score, time, reason and record status, and survives a refresh @mobile', async ({ app, page }) => {
    await app.open({ options: { sessionDurationSec: 60, enemySpawnIntervalSec: 4 } });
    await app.startMatch();
    await app.finishByTime();

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText('0');
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded');
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByTestId('last-match')).toHaveText('Last match: 0 pts · 01:00 · Time up');

    // Back on the menu, a refresh stays on the menu and keeps the last result.
    await page.reload();
    await expect(page.getByTestId('last-match')).toHaveText('Last match: 0 pts · 01:00 · Time up');
  });
});
