// Structured JSON logging for the pipeline.
//
// All log lines are emitted as a single-line JSON object so Vercel /
// any downstream log shipper can parse them without regex. Always include
// `feature` (high-level area) and `step` (specific action) so filters can
// pivot on either axis. `reportId` ties events to a single pipeline run
// for replay; `durationMs` is the wall-clock cost of the step.
//
// The helper accepts an unknown `error` and normalises it to a stable
// shape: `errorMessage` (string) and optional `stack`. Callers can also
// add arbitrary extra fields via the index signature — keep them flat
// (no nested objects) so they surface as top-level keys in the log JSON.

interface LogContext {
  feature: string;
  step?: string;
  reportId?: string;
  durationMs?: number;
  error?: unknown;
  [key: string]: unknown;
}

export function logEvent(name: string, context: LogContext): void {
  const error = context.error;
  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : undefined;
  const stack = error instanceof Error ? error.stack : undefined;

  // Strip the raw `error` field before serialising — we replace it with
  // the normalised `errorMessage` / `stack` to avoid `[object Object]`.
  const { error: _drop, ...rest } = context;
  void _drop;

  console.log(
    JSON.stringify({
      event: name,
      timestamp: new Date().toISOString(),
      ...rest,
      ...(errorMessage ? { errorMessage } : {}),
      ...(stack ? { stack } : {}),
    })
  );
}
