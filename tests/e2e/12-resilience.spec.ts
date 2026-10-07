import { expect, HTTP_ERROR_LOG, test } from './support';

// Flow 12 — re-sending after a timeout without duplicates, and late responses never overwriting newer data.

test.describe('Network resilience', () => {
  test('a submission that times out after being stored is recovered without a duplicate', async ({ app, page }) => {
    await app.open({ scenario: 'register-timeout', options: { sessionDurationSec: 60, enemySpawnIntervalSec: 3.5 } });
    await app.startMatch();
    await app.finishByTime();

    const record = page.getByTestId('result-record');
    await expect(record).toHaveAttribute('data-status', 'submitting');
    // First attempt times out (6 s); the retry gets the stored record back.
    await expect(record).toHaveAttribute('data-status', 'recorded', { timeout: 20_000 });

    const stored = await app.mockRecords();
    expect(stored).toHaveLength(1);

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
  });

  test('repeated retries of the same match never duplicate it', async ({ app, page }) => {
    await app.open({ options: { sessionDurationSec: 60, enemySpawnIntervalSec: 3.5 } });
    await app.startMatch();
    await app.finishByTime();
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded');

    // Re-send the same record several times directly, like double clicks or a stale retry would.
    const statuses = await page.evaluate(async () => {
      const pending = JSON.parse(localStorage.getItem('pirate-battle:last-result')!) as { matchId: string };
      const db = JSON.parse(localStorage.getItem('pirate-battle:mock-db')!) as { records: unknown[] };
      const body = JSON.stringify(db.records[0]);
      const responses = await Promise.all(
        [1, 2, 3].map(() => fetch('/api/matches', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })),
      );
      return { matchId: pending.matchId, statuses: responses.map((r) => r.status) };
    });
    expect(statuses.statuses).toEqual([200, 200, 200]);
    expect(await app.mockRecords()).toEqual([statuses.matchId]);
  });

  test('late responses do not overwrite the page being shown', async ({ app, page }) => {
    // Odd requests take 2 s, even ones 0.2 s: earlier requests resolve after later ones.
    await app.open({ scenario: 'out-of-order' });
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Next ranking page' }).click();
    await expect(page.getByTestId('pager-status')).toHaveText('Page 2 of 9', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Next ranking page' }).click();
    await expect(page.getByTestId('pager-status')).toHaveText('Page 3 of 9', { timeout: 10_000 });

    const ranks = page.getByTestId('ranking-table').locator('tbody tr td:first-child');
    await expect(ranks).toHaveText(['11', '12', '13', '14', '15']);
    // Wait out any slower response still in flight; the page must not change.
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('pager-status')).toHaveText('Page 3 of 9');
    await expect(ranks).toHaveText(['11', '12', '13', '14', '15']);
  });

  test("a stale response for the same query never replaces newer data", async ({ app, page }) => {
    await app.open({ scenario: 'out-of-order', options: { sessionDurationSec: 60, enemySpawnIntervalSec: 3.5 } });
    await expect(app.tabPanel).toContainText('No matches recorded with these settings yet', { timeout: 10_000 });

    // Record a match, then make the ranking refetch twice in a row: the slow first
    // response carries an older revision than what is already shown.
    await app.startMatch();
    await app.finishByTime();
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByTestId('ranking-table').locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('ranking-table').locator('tbody tr')).toHaveCount(1);
  });

  test('recovers when the browser restarts the mock worker and forgets this page', async ({ app, page }) => {
    // The first request after the worker forgot the page reaches the static host (HTTP 404) before recovery.
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open();
    await expect(page.getByTestId('ranking-table')).toBeVisible();

    // Same state as a worker restarted by the browser: the page is controlled but no longer mocked.
    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage('CLIENT_CLOSE'));
    await page.waitForTimeout(300);

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.tabPanel).toContainText('No recorded matches yet', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByTestId('ranking-table').locator('tbody tr')).toHaveCount(5);
    await expect(app.tabPanel.getByRole('alert')).toHaveCount(0);
  });
});
