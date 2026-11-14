// ponytail: per-process limits stay dependency-free; Vercel scale needs a distributed limiter.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || "unknown";
}

export function allowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 5_000) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
      while (rateBuckets.size > 5_000) {
        const oldestKey = rateBuckets.keys().next().value;
        if (oldestKey === undefined) break;
        rateBuckets.delete(oldestKey);
      }
    }
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export async function readJsonBody(request: Request, maximumBytes = 8_192): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) throw new RequestError("La solicitud es demasiado grande.", 413);

  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Se requiere un cuerpo JSON.", 400);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new RequestError("La solicitud es demasiado grande.", 413);
      }
      chunks.push(value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    );
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RequestError("El cuerpo no contiene JSON válido.", 400);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("El cuerpo no contiene JSON válido.", 400);
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) return jsonError(error.message, error.status);
  return jsonError("No se pudo completar la solicitud.", 503);
}