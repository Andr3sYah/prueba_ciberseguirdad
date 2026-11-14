import {
  createSessionToken,
  isAuthConfigured,
  matchesSecret,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";
import { allowRateLimit, clientKey, errorResponse, readJsonBody, RequestError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json({ error: "Falta configurar la autenticación del dashboard." }, { status: 503 });
  }
  if (!allowRateLimit(`login:${clientKey(request)}`, 8, 15 * 60_000)) {
    return Response.json(
      { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  try {
    const body = await readJsonBody(request);
    const password = body && typeof body === "object" ? (body as { password?: unknown }).password : undefined;
    if (!matchesSecret(password, process.env.DASHBOARD_PASSWORD!)) {
      return Response.json({ error: "La contraseña no es válida." }, { status: 401 });
    }

    const token = createSessionToken(process.env.SESSION_SECRET!);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return Response.json(
      { authenticated: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof RequestError) return errorResponse(error);
    return Response.json({ error: "No se pudo iniciar sesión." }, { status: 503 });
  }
}