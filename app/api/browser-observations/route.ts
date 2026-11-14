import { allowRateLimit, clientKey, errorResponse, readJsonBody, RequestError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Dimensions = { width: number; height: number };

function parseText(value: unknown, name: string, maximumLength: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || /[\u0000-\u001f\u007f\u2028\u2029]/.test(value)
  ) {
    throw new RequestError(`El campo ${name} no es válido.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) throw new RequestError(`El campo ${name} no es válido.`, 400);
  return normalized;
}

function parseDimensions(value: unknown, name: string): Dimensions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(`El campo ${name} no es válido.`, 400);
  }

  const dimensions = value as Record<string, unknown>;
  const width = dimensions.width;
  const height = dimensions.height;
  if (
    typeof width !== "number"
    || typeof height !== "number"
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 0
    || height < 0
    || width > 32_768
    || height > 32_768
  ) {
    throw new RequestError(`El campo ${name} no es válido.`, 400);
  }
  return { width, height };
}

function parseObservations(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError("El cuerpo de observaciones no es válido.", 400);
  }

  const input = body as Record<string, unknown>;
  const colorScheme = input.colorScheme;
  if (colorScheme !== "Oscuro" && colorScheme !== "Claro" && colorScheme !== "No disponible") {
    throw new RequestError("La preferencia de color no es válida.", 400);
  }

  return {
    languages: parseText(input.languages, "languages", 200),
    timeZone: parseText(input.timeZone, "timeZone", 64),
    screen: parseDimensions(input.screen, "screen"),
    viewport: parseDimensions(input.viewport, "viewport"),
    colorScheme,
  };
}

export async function POST(request: Request) {
  if (!allowRateLimit(`browser-observations:${clientKey(request)}`, 20, 60_000)) {
    return errorResponse(new RequestError("Se alcanzó el límite de solicitudes.", 429));
  }

  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new RequestError("Se requiere contenido JSON.", 415);
    }

    const observations = parseObservations(await readJsonBody(request, 1_024));
    console.info(`[browser-observations] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...observations,
    })}`);
    return Response.json(
      { logged: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
