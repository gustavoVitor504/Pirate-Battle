import { expect, HTTP_ERROR_LOG, test } from './support';

// Flow 11 — registering a match, refreshing both tabs, and recovering a pending submission after a refresh.

// Settings no fixture uses, so the ranking for them contains only the test's own matches.
const UNIQUE_SETTINGS = { sessionDurationSec: 60, enemySpawnIntervalSec: 3.5 };

test.describe('Match registration', () => {
  test('a finished match appears once in the history and the ranking @mobile', async ({ app, page }) => {
    await app.open({ options: UNIQUE_SETTINGS });
    await expect(app.tabPanel).toContainText('No matches recorded with these settings yet');

    await app.startMatch();
    await app.finishByTime();
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded');
    await expect(page.getByTestId('result-record')).toHaveText('Recorded in the ranking');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    const ranking = page.getByTestId('ranking-table');
    await expect(ranking.locator('tbody tr')).toHaveCount(1);
    await expect(ranking.locator('tbody tr')).toContainText('Captain Test');
    await expect(ranking.locator('.badge')).toHaveText('You');

    await page.getByRole('tab', { name: 'Match History' }).click();
    const history = page.getByTestId('history-table');
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.locator('tbody tr')).toContainText('01:00');
    await expect(history.locator('tbody tr')).toContainText('Time up');
    expect(await app.mockRecords()).toHaveLength(1);
  });

  test('a match that could not be sent stays pending across a refresh and is recovered', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open({ scenario: 'register-unavailable', options: UNIQUE_SETTINGS });
    await app.startMatch();
    await app.finishByTime();

    const record = page.getByTestId('result-record');
    await expect(record).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
    await expect(record).toContainText('Match registration is temporarily unavailable. (HTTP 503)');

    // Another match can start while one is pending.
    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForFunction(() => window.__pirateTest?.isReady() === true);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu' }).click();

    await page.reload();
    const notice = page.getByTestId('pending-notice');
    await expect(notice).toHaveText(/1 match is waiting to be recorded/, { timeout: 30_000 });
    expect(await app.mockRecords()).toHaveLength(0);

    await app.chooseScenario(/^Success/);
    // A background retry from app start-up may already deliver it; otherwise the button does.
    await notice
      .getByRole('button', { name: 'Retry' })
      .click({ timeout: 2_000 })
      .catch(() => undefined);
    await expect(notice).toBeHidden({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
    expect(await app.mockRecords()).toHaveLength(1);
  });

  test('pending matches are sent automatically when the app opens again', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open({ scenario: 'register-unavailable', options: UNIQUE_SETTINGS });
    await app.startMatch();
    await app.finishByTime();
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });

    // The service recovers; reopening the app sends the queued match without any click.
    await page.goto('/?testHooks=1&scenario=success&mockLatency=0');
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded', { timeout: 15_000 });
    expect(await app.mockRecords()).toHaveLength(1);
  });
});
