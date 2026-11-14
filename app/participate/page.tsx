import { isIP } from "node:net";
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function headerValue(value: string | null, maximumLength: number): string {
  return value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximumLength) || "No informado";
}

function clientIp(requestHeaders: Headers): string {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedIp && isIP(forwardedIp) ? forwardedIp : "No disponible";
}

export default async function ParticipatePage() {
  const requestHeaders = await headers();
  const accessLog = {
    timestamp: new Date().toISOString(),
    ip: clientIp(requestHeaders),
    platform: headerValue(requestHeaders.get("sec-ch-ua-platform"), 80),
    userAgent: headerValue(requestHeaders.get("user-agent"), 500),
  };

  console.info(`[access-log] ${JSON.stringify(accessLog)}`);

  return (
    <main className="participate-shell">
      <header className="participate-header">
        <Link className="brand-lockup" href="/" aria-label="Signal Desk, inicio">
          <span className="brand-mark" aria-hidden="true">SD</span>
          <span className="brand-name">Signal Desk <span>/ PARTICIPACIÓN</span></span>
        </Link>
        <Link className="secondary-button" href="/">Acceso del equipo</Link>
      </header>

      <div className="participate-main">
        <section className="participate-card" aria-labelledby="participate-title">
          <div className="eyebrow"><span className="eyebrow-dot" /> DEMO UNIVERSITARIA · REGISTRO DEL SERVIDOR</div>
          <h1 id="participate-title">Datos visibles en esta solicitud</h1>
          <p>
            Estos valores provienen de las cabeceras HTTP recibidas por el servidor.
            No se consulta información adicional del dispositivo ni se guardan estos
            datos en la base de datos de la aplicación.
          </p>
          <dl className="access-log-list">
            <div><dt>Hora del registro</dt><dd><time dateTime={accessLog.timestamp}>{accessLog.timestamp}</time></dd></div>
            <div><dt>IP reportada por el proxy</dt><dd>{accessLog.ip}</dd></div>
            <div><dt>Plataforma reportada</dt><dd>{accessLog.platform}</dd></div>
            <div><dt>User-Agent recibido</dt><dd>{accessLog.userAgent}</dd></div>
          </dl>
          <p className="access-log-notice">
            El registro también se envía a la salida de logs del servidor. La IP depende
            de las cabeceras del proxy y puede no estar disponible; el User-Agent es
            información declarada por el navegador y puede ser inexacta. El proveedor
            de alojamiento podría conservar sus propios logs.
          </p>
          <Link className="primary-button participate-home-link" href="/" prefetch={false}>Ir al panel principal</Link>
        </section>
      </div>
    </main>
  );
}