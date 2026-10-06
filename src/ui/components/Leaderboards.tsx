import { useState, type ReactNode } from 'react';
import type { MatchSettings, Page } from '../../api/contracts';
import { describeApiError } from '../../api/errors';
import { useMatchHistory, useRanking } from '../../api/queries';
import { END_REASON_LABEL, formatClock, formatDate } from '../format';

const PAGE_SIZE = 5;

interface PagedQuery<T> {
  data: Page<T> | undefined;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
}

/**
 * Shared shell for a paginated list: loading, empty, error (with retry),
 * background refresh and stale-data states, plus the pager.
 */
function PagedList<T>({
  name,
  query,
  page,
  onPage,
  empty,
  renderTable,
}: {
  name: string;
  query: PagedQuery<T>;
  page: number;
  onPage: (page: number) => void;
  empty: string;
  renderTable: (items: T[]) => ReactNode;
}) {
  const { data, error, isPending, isFetching, isError, isPlaceholderData, refetch } = query;

  if (isPending) {
    return (
      <p className="list-state" role="status">
        Loading {name}…
      </p>
    );
  }

  if (!data) {
    return (
      <div className="list-state list-state--error" role="alert">
        <p>
          Could not load the {name}. {describeApiError(error).message}
        </p>
        <button type="button" className="text-button" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const totalPages = data.totalPages;
  return (
    <div className="paged-list" aria-busy={isFetching}>
      {isError ? (
        <div className="list-note list-note--warning" role="alert">
          Showing earlier data: the latest refresh failed. {describeApiError(error).message}{' '}
          <button type="button" className="text-button" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <p className="list-note" role="status">
          {isPlaceholderData ? `Loading page ${page}…` : isFetching ? `Updating ${name}…` : ''}
        </p>
      )}

      {data.items.length === 0 ? <p className="list-state">{empty}</p> : renderTable(data.items)}

      {totalPages > 1 && (
        <nav className="pager" aria-label={`${name} pages`}>
          <button
            type="button"
            className="text-button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1 || isPlaceholderData}
            aria-label={`Previous ${name} page`}
          >
            ‹ Previous
          </button>
          {/* Reflects the page actually shown; while the next one loads, the previous stays visible. */}
          <span data-testid="pager-status">
            Page {data.page} of {totalPages}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages || isPlaceholderData}
            aria-label={`Next ${name} page`}
          >
            Next ›
          </button>
        </nav>
      )}
    </div>
  );
}

export function RankingList({ settings, playerId }: { settings: MatchSettings; playerId: string }) {
  const [page, setPage] = useState(1);
  const query = useRanking(settings, page, PAGE_SIZE);

  return (
    <>
      <p className="list-caption">
        Matches played with {settings.sessionDurationSec} s sessions and a spawn every {settings.enemySpawnIntervalSec}{' '}
        s.
      </p>
      <PagedList
        name="ranking"
        query={query}
        page={page}
        onPage={setPage}
        empty="No matches recorded with these settings yet. Be the first!"
        renderTable={(items) => (
          <table className="data-table" data-testid="ranking-table">
            <caption className="visually-hidden">Ranking, page {page}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Score</th>
                <th scope="col">Time</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const mine = entry.playerId === playerId;
                return (
                  <tr key={entry.matchId} className={mine ? 'data-table__row--mine' : undefined}>
                    <td>{entry.rank}</td>
                    <th scope="row">
                      {entry.playerName}
                      {mine && <span className="badge">You</span>}
                    </th>
                    <td>{entry.score}</td>
                    <td>{formatClock(entry.durationSec)}</td>
                    <td>{formatDate(entry.endedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      />
    </>
  );
}

export function MatchHistoryList({ playerId }: { playerId: string }) {
  const [page, setPage] = useState(1);
  const query = useMatchHistory(playerId, page, PAGE_SIZE);

  return (
    <PagedList
      name="match history"
      query={query}
      page={page}
      onPage={setPage}
      empty="No recorded matches yet. Play one!"
      renderTable={(items) => (
        <table className="data-table" data-testid="history-table">
          <caption className="visually-hidden">Match history, page {page}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Score</th>
              <th scope="col">Duration</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {items.map((record) => (
              <tr key={record.matchId}>
                <th scope="row">{formatDate(record.endedAt)}</th>
                <td>{record.score}</td>
                <td>{formatClock(record.durationSec)}</td>
                <td>{END_REASON_LABEL[record.endReason]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
