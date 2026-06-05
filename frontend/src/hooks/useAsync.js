import { useCallback, useEffect, useState } from 'react';

/**
 * Runs an async fetcher and exposes { data, error, loading, reload }.
 * Re-runs whenever a value in `deps` changes.
 */
export function useAsync(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const run = useCallback(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fetcher)
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((err) => active && setState({ data: null, error: err.message, loading: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  return { ...state, reload: run };
}
