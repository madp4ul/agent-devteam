import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export function useLatestRefresh<Result>(
  read: () => Promise<Result>,
  apply: (result: Result) => void,
): () => Promise<void> {
  const callbacks = useRef({ read, apply });
  const mounted = useRef(false);
  const sequence = useRef(0);
  callbacks.current = { read, apply };

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  return useCallback(async (): Promise<void> => {
    const requestSequence = ++sequence.current;
    try {
      const result = await callbacks.current.read();
      if (mounted.current && requestSequence === sequence.current) callbacks.current.apply(result);
    } catch (error) {
      if (mounted.current && requestSequence === sequence.current) throw error;
    }
  }, []);
}

export function usePolling(
  refresh: () => Promise<void>,
  intervalMilliseconds: number | undefined,
  onError: (error: unknown) => void,
): void {
  const callbacks = useRef({ refresh, onError });
  callbacks.current = { refresh, onError };

  useEffect(() => {
    if (intervalMilliseconds === undefined) return;
    let active = true;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      try {
        await callbacks.current.refresh();
      } catch (error) {
        if (active) callbacks.current.onError(error);
      } finally {
        if (active) timer = window.setTimeout(() => void poll(), intervalMilliseconds);
      }
    };
    timer = window.setTimeout(() => void poll(), intervalMilliseconds);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [intervalMilliseconds]);
}
