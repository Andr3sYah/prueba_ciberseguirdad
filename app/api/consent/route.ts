import { isAuthConfigured, requestHasSession } from "@/lib/auth";
import { allowRateLimit, clientKey, errorResponse, readJsonBody, RequestError } from "@/lib/http";
import {
  ConsentInputError,
  ConsentStorageError,
  getConsentStorageMode,
  listConsentSubmissions,
  parseConsentSubmission,
  saveConsentSubmission,
} from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originIsAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!originIsAllowed(request)) {
    return errorResponse(new RequestError("Origen de solicitud no permitido.", 403));
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse(new RequestError("Se requiere contenido JSON.", 415));
  }
  if (!allowRateLimit(`consent:${clientKey(request)}`, 10, 60_000)) {
    return errorResponse(new RequestError("Espera antes de enviar otro registro.", 429));
  }

  try {
    const input = parseConsentSubmission(await readJsonBody(request, 4_096));
    const submission = await saveConsentSubmission(input);
    return Response.json(
      { accepted: true, id: submission.id, storage: getConsentStorageMode() },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ConsentInputError) {
      return errorResponse(new RequestError(error.message, 400));
    }
    if (error instanceof ConsentStorageError) {
      return errorResponse(new RequestError(error.message, 503));
    }
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  if (!isAuthConfigured()) {
    return errorResponse(new RequestError("La autenticación no está configurada.", 503));
  }
  if (!requestHasSession(request)) {
    return errorResponse(new RequestError("Se requiere una sesión válida.", 401));
  }

  try {
    return Response.json(
      { submissions: await listConsentSubmissions(), storage: getConsentStorageMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ConsentStorageError) {
      return errorResponse(new RequestError(error.message, 503));
    }
    return errorResponse(error);
  }
}