/**
 * Simple token bucket rate limiter for upstream requests.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const buckets = new Map<string, TokenBucket>();

/**
 * Get or create a token bucket for a given collection.
 */
export function getUpstreamBucket(
  collectionId: string,
  capacity = 50,
  refillRate = 50,
): TokenBucket {
  let bucket = buckets.get(collectionId);
  if (!bucket) {
    bucket = new TokenBucket(capacity, refillRate);
    buckets.set(collectionId, bucket);
  }
  return bucket;
}
