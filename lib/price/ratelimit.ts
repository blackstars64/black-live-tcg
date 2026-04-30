// ─── Rate limiter + circuit breaker Cardmarket ───────────────────
// Max 1 requête/seconde. Circuit breaker après 5 erreurs consécutives.
// Retry exponentiel : 3 tentatives, délai de base 2s.

// ─── Rotation User-Agent ─────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Circuit breaker ─────────────────────────────────────────────
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000;

let consecutiveErrors = 0;
let circuitOpenedAt: number | null = null;

export function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) return false;
  if (Date.now() - circuitOpenedAt >= CIRCUIT_RESET_MS) {
    consecutiveErrors = 0;
    circuitOpenedAt = null;
    return false;
  }
  return true;
}

export function recordSuccess(): void {
  consecutiveErrors = 0;
  circuitOpenedAt = null;
}

export function recordFailure(): void {
  consecutiveErrors += 1;
  if (consecutiveErrors >= CIRCUIT_THRESHOLD) {
    circuitOpenedAt = Date.now();
  }
}

// ─── Queue rate-limitée ───────────────────────────────────────────
const RATE_LIMIT_MS = 1100;
const MAX_QUEUE_SIZE = 20;

interface QueueEntry {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let queueRunning = false;
const queue: QueueEntry[] = [];
let lastRequestTime = 0;

async function runQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;

    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - elapsed);
    }
    lastRequestTime = Date.now();

    try {
      const result = await entry.fn();
      entry.resolve(result);
    } catch (err) {
      entry.reject(err);
    }
  }

  queueRunning = false;
}

export function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  if (queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error('File d\'attente Cardmarket pleine'));
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    runQueue();
  });
}

// ─── Retry exponentiel ────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ScraperError extends Error {
  constructor(
    message: string,
    public readonly code: 'RATE_LIMITED' | 'BLOCKED' | 'PARSE_ERROR' | 'NETWORK_ERROR'
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

export { ScraperError };

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof ScraperError && err.code === 'BLOCKED') {
        throw err; // Pas de retry sur blocage explicite
      }

      if (attempt < maxAttempts - 1) {
        const isRateLimited = err instanceof ScraperError && err.code === 'RATE_LIMITED';
        const delay = isRateLimited ? 5000 : baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
