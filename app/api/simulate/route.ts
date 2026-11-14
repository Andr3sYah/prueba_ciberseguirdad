import { isAuthConfigured, requestHasSession } from "@/lib/auth";
import { allowRateLimit, clientKey, errorResponse, RequestError } from "@/lib/http";
import { createSyntheticEvents, saveEvents, StorageError } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthConfigured()) return errorResponse(new RequestError("La autenticación no está configurada.", 503));
  if (!requestHasSession(request)) return errorResponse(new RequestError("Se requiere una sesión válida.", 401));
  if (!allowRateLimit(`simulate:${clientKey(request)}`, 6, 60_000)) {
    return errorResponse(new RequestError("Espera antes de generar otra simulación.", 429));
  }

  try {
    const events = createSyntheticEvents();
    await saveEvents(events);
    return Response.json(
      { generated: events.length, source: "simulation" },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StorageError) return errorResponse(new RequestError(error.message, 503));
    return errorResponse(error);
  }
}