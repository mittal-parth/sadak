export type RetryOpts = {
  attempts: number;
  baseDelayMs: number;
  /** Status codes worth trying again, transient ones only. */
  retryOn: number[];
};

export const DEFAULT_RETRY_OPTS: RetryOpts = {
  attempts: 3,
  baseDelayMs: 400,
  retryOn: [408, 429, 500, 502, 503, 504],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = DEFAULT_RETRY_OPTS
): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;

      // A 401 or a 400 will fail identically on every retry, fail fast.
      if (status !== undefined && !opts.retryOn.includes(status)) throw err;
      if (i === opts.attempts - 1) break;

      await new Promise((r) => setTimeout(r, opts.baseDelayMs * 2 ** i));
    }
  }

  throw lastErr;
}
