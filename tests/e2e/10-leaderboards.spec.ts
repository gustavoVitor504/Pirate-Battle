import { expect, HTTP_ERROR_LOG, test } from './support';

// Flow 10 — Ranking and Match History queries and pagination, including loading, empty and error states.

test.describe('Leaderboards', () => {
  test('ranking is paginated and ordered by score @mobile', async ({ app, page }) => {
    await app.open();
    const table = page.getByTestId('ranking-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(page.getByTestId('pager-status')).toHaveText('Page 1 of 9');
    await expect(page.getByRole('button', { name: 'Previous ranking page' })).toBeDisabled();

    const scores = (await table.locator('tbody tr td:nth-child(3)').allInnerTexts()).map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    await page.getByRole('button', { name: 'Next ranking page' }).click();
    await expect(page.getByTestId('pager-status')).toHaveText('Page 2 of 9');
    await expect(table.locator('tbody tr td:first-child')).toHaveText(['6', '7', '8', '9', '10']);

    await page.getByRole('button', { name: 'Previous ranking page' }).click();
    await expect(table.locator('tbody tr td:first-child')).toHaveText(['1', '2', '3', '4', '5']);
  });

  test('match history is paginated, newest first', async ({ app, page }) => {
    await app.open({ scenario: 'many-pages' });
    await page.getByRole('tab', { name: 'Match History' }).click();
    const table = page.getByTestId('history-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(page.getByTestId('pager-status')).toHaveText('Page 1 of 6');

    const firstPageDates = await table.locator('tbody th').allInnerTexts();
    await page.getByRole('button', { name: 'Next match history page' }).click();
    await expect(page.getByTestId('pager-status')).toHaveText('Page 2 of 6');
    const secondPageDates = await table.locator('tbody th').allInnerTexts();
    expect(new Date(firstPageDates.at(-1)!).getTime()).toBeGreaterThanOrEqual(new Date(secondPageDates[0]!).getTime());
  });

  test('tabs work with the keyboard', async ({ app, page }) => {
    await app.open();
    await page.getByRole('tab', { name: 'Ranking' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match History' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows a loading state on a slow network', async ({ app, page }) => {
    await app.open({ scenario: 'slow' });
    await expect(app.tabPanel.getByRole('status').filter({ hasText: 'Loading ranking' })).toBeVisible();
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 10_000 });
  });

  test('shows empty states', async ({ app, page }) => {
    await app.open({ scenario: 'empty' });
    await expect(app.tabPanel).toContainText('No matches recorded with these settings yet');
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.tabPanel).toContainText('No recorded matches yet');
  });

  test('shows errors with a retry, without blocking the game @mobile', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open({ scenario: 'ranking-error' });
    const alert = app.tabPanel.getByRole('alert');
    await expect(alert).toContainText('Could not load the ranking. The ranking is unavailable. (HTTP 500)', {
      timeout: 15_000,
    });

    // The other tab and the game stay available.
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.tabPanel).toContainText('No recorded matches yet');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

    // Recovery: the service is back and Try again loads the data.
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await app.chooseScenario(/^Success/);
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 15_000 });
  });

  test('history errors are reported separately', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open({ scenario: 'history-error' });
    await expect(page.getByTestId('ranking-table')).toBeVisible();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.tabPanel.getByRole('alert')).toContainText('Could not load the match history', {
      timeout: 15_000,
    });
    await expect(app.tabPanel.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('keeps earlier data when a background refresh fails', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG);
    await app.open();
    await expect(page.getByTestId('ranking-table')).toBeVisible();
    await app.chooseScenario(/Server error/);
    await expect(app.tabPanel.getByRole('alert')).toContainText('Showing earlier data', { timeout: 15_000 });
    await expect(page.getByTestId('ranking-table')).toBeVisible();
  });

  test('reports connection failures and timeouts', async ({ app, page }) => {
    app.allowConsoleErrors(HTTP_ERROR_LOG, /net::ERR_FAILED/);
    await app.open({ scenario: 'network-error' });
    await expect(app.tabPanel.getByRole('alert')).toContainText('Could not reach the server', { timeout: 15_000 });

    await app.chooseScenario(/^Timeout The server never/);
    await page.getByRole('tab', { name: 'Match History' }).click();
    // Three attempts of 6 s each before giving up.
    await expect(app.tabPanel.getByRole('alert')).toContainText('took too long', { timeout: 30_000 });
  });
});
