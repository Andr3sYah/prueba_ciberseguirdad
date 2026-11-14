import { isIP } from "node:net";
import Link from "next/link";
import { headers } from "next/headers";
import { BrowserObservations } from "@/app/browser-observations";

export const dynamic = "force-dynamic";

function headerValue(value: string | null, maximumLength: number): string {
  return value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximumLength) || "No informado";
}

function refererOrigin(value: string | null): string {
  if (!value || value.length > 2_048) return "No informado";

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "No informado";
  } catch {
    return "No informado";
  }
}

function clientIp(requestHeaders: Headers): string {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedIp && isIP(forwardedIp) ? forwardedIp : "No disponible";
}

export default async function AccessDemo({ path }: { path: "/" | "/participate" }) {
  const requestHeaders = await headers();
  const accessLog = {
    timestamp: new Date().toISOString(),
    method: "GET",
    path,
    ip: clientIp(requestHeaders),
    host: headerValue(requestHeaders.get("host"), 255),
    platform: headerValue(requestHeaders.get("sec-ch-ua-platform"), 80),
    userAgent: headerValue(requestHeaders.get("user-agent"), 500),
    accept: headerValue(requestHeaders.get("accept"), 200),
    acceptLanguage: headerValue(requestHeaders.get("accept-language"), 200),
    refererOrigin: refererOrigin(requestHeaders.get("referer")),
    fetchSite: headerValue(requestHeaders.get("sec-fetch-site"), 40),
    fetchMode: headerValue(requestHeaders.get("sec-fetch-mode"), 40),
    fetchDest: headerValue(requestHeaders.get("sec-fetch-dest"), 40),
    dnt: headerValue(requestHeaders.get("dnt"), 10),
    gpc: headerValue(requestHeaders.get("sec-gpc"), 10),
  };

  console.info(`[access-log] ${JSON.stringify(accessLog)}`);

  return (
    <main className="participate-shell">
      <header className="participate-header">
        <Link className="brand-lockup" href="/" aria-label="Signal Desk, inicio">
          <span className="brand-mark" aria-hidden="true">SD</span>
          <span className="brand-name">Signal Desk <span>/ PARTICIPACIÓN</span></span>
        </Link>
        <Link className="secondary-button" href="/dashboard">Acceso del equipo</Link>
      </header>

      <div className="participate-main">
        <section className="participate-card" aria-labelledby="participate-title">
          <div className="eyebrow"><span className="eyebrow-dot" /> DEMO UNIVERSITARIA · REGISTRO DEL SERVIDOR</div>
          <h1 id="participate-title">Datos visibles en esta solicitud</h1>
          <p>
            Estos valores llegan al servidor como parte de la solicitud, antes de
            interactuar con un aviso. No se consulta información adicional del
            dispositivo ni se guardan estos datos en la base de datos de la aplicación.
          </p>
          <dl className="access-log-list">
            <div><dt>Hora del registro</dt><dd><time dateTime={accessLog.timestamp}>{accessLog.timestamp}</time></dd></div>
            <div><dt>Método y ruta</dt><dd>{accessLog.method} {accessLog.path}</dd></div>
            <div><dt>IP reportada por el proxy</dt><dd>{accessLog.ip}</dd></div>
            <div><dt>Host solicitado</dt><dd>{accessLog.host}</dd></div>
            <div><dt>Plataforma reportada</dt><dd>{accessLog.platform}</dd></div>
            <div><dt>User-Agent recibido</dt><dd>{accessLog.userAgent}</dd></div>
            <div><dt>Tipos de contenido aceptados</dt><dd>{accessLog.accept}</dd></div>
            <div><dt>Idiomas preferidos</dt><dd>{accessLog.acceptLanguage}</dd></div>
            <div><dt>Origen de referencia</dt><dd>{accessLog.refererOrigin}</dd></div>
            <div><dt>Contexto de navegación</dt><dd>{accessLog.fetchSite} / {accessLog.fetchMode} / {accessLog.fetchDest}</dd></div>
            <div><dt>Señales de privacidad</dt><dd>DNT: {accessLog.dnt} / GPC: {accessLog.gpc}</dd></div>
          </dl>
          <p className="access-log-notice">
            El registro también se envía a la salida de logs del servidor. La IP depende
            de las cabeceras del proxy y puede no estar disponible o ser falsificada si
            no se confía en el proxy. El User-Agent, idioma y contexto son declarados
            por el navegador y pueden ser inexactos. Solo se muestra el origen del
            referente, no su ruta ni parámetros. No se registran cookies, formularios
            ni parámetros de esta URL; el proveedor de alojamiento podría conservar
            sus propios logs.
          </p>
          <BrowserObservations />
          <Link className="primary-button participate-home-link" href="/dashboard" prefetch={false}>Entrar al dashboard privado</Link>
        </section>
      </div>
    </main>
  );
}