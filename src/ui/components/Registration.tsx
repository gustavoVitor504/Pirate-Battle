import { useQueryClient } from '@tanstack/react-query';
import { retryPendingMatches, usePendingMatches, useRegistrationStatus } from '../../api/registration';

/** Result screen line: where this match's submission to the ranking stands. */
export function RegistrationStatusLine({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const status = useRegistrationStatus(matchId);

  const text = {
    recorded: 'Recorded in the ranking',
    submitting: 'Sending to the ranking…',
    failed: 'Not recorded yet',
    queued: 'Waiting to be sent',
  }[status.kind];

  return (
    <div className="registration" data-testid="result-record" data-status={status.kind}>
      <span role="status">{text}</span>
      {status.kind === 'submitting' && status.attempt > 1 && (
        <span className="registration__detail"> (attempt {status.attempt})</span>
      )}
      {status.kind === 'failed' && (
        <>
          <span className="registration__detail" role="alert">
            {status.message} It is saved on this device and will be sent later.
          </span>
          <button type="button" className="text-button" onClick={() => retryPendingMatches(queryClient)}>
            Retry now
          </button>
        </>
      )}
      {status.kind === 'queued' && (
        <button type="button" className="text-button" onClick={() => retryPendingMatches(queryClient)}>
          Send now
        </button>
      )}
    </div>
  );
}

/** Main menu notice for matches still waiting to reach the server. */
export function PendingMatchesNotice() {
  const queryClient = useQueryClient();
  const pending = usePendingMatches();
  if (pending.length === 0) return null;

  return (
    <div className="pending-notice" data-testid="pending-notice">
      <span>
        {pending.length === 1 ? '1 match is' : `${pending.length} matches are`} waiting to be recorded.
      </span>{' '}
      <button type="button" className="text-button" onClick={() => retryPendingMatches(queryClient)}>
        Retry
      </button>
    </div>
  );
}
