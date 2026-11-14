import { isAuthConfigured, matchesSecret, requestHasSession } from "@/lib/auth";
import { allowRateLimit, clientKey, errorResponse, readJsonBody, RequestError } from "@/lib/http";
import { getStorageMode, InputError, listEvents, parseEvent, saveEvents, StorageError } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthConfigured()) return errorResponse(new RequestError("La autenticación no está configurada.", 503));
  if (!requestHasSession(request)) return errorResponse(new RequestError("Se requiere una sesión válida.", 401));
  try {
    const storage = getStorageMode();
    if (storage === "unconfigured") {
      return Response.json(
        { events: [], storage },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { events: await listEvents(), storage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const expectedKey = process.env.TELEMETRY_WRITE_KEY;
  if (!expectedKey || expectedKey.length < 24) {
    return errorResponse(new RequestError("La ingesta no está configurada.", 503));
  }
  const authorization = request.headers.get("authorization");
  const suppliedKey = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!matchesSecret(suppliedKey, expectedKey)) {
    return errorResponse(new RequestError("Se requiere una clave de ingesta válida.", 401));
  }
  if (!allowRateLimit(`events:${clientKey(request)}`, 60, 60_000)) {
    return errorResponse(new RequestError("Se alcanzó el límite de solicitudes.", 429));
  }

  try {
    const body = await readJsonBody(request);
    const entries = Array.isArray(body) ? body : [body];
    if (entries.length < 1 || entries.length > 20) {
      throw new RequestError("Envía entre 1 y 20 eventos por solicitud.", 400);
    }
    const events = entries.map((entry) => parseEvent(entry));
    await saveEvents(events);
    return Response.json(
      { accepted: events.length },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof InputError) return errorResponse(new RequestError(error.message, 400));
    if (error instanceof StorageError) return errorResponse(new RequestError(error.message, 503));
    return errorResponse(error);
  }
}