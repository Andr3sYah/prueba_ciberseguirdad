"use client";

import { useEffect, useState } from "react";

type BrowserObservations = {
  languages: string;
  timeZone: string;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  colorScheme: string;
};

export function BrowserObservations() {
  const [observations, setObservations] = useState<BrowserObservations | null>(null);
  const [logStatus, setLogStatus] = useState<"sending" | "sent" | "error">("sending");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const colorScheme = typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "Oscuro" : "Claro"
        : "No disponible";
      const currentObservations = {
        languages: navigator.languages.slice(0, 5).join(", ") || navigator.language || "No informado",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "No informado",
        screen: { width: window.screen.width, height: window.screen.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        colorScheme,
      };
      setObservations(currentObservations);
      void fetch("/api/browser-observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify(currentObservations),
      }).then((response) => {
        if (!response.ok) throw new Error("No se pudieron registrar las observaciones.");
        setLogStatus("sent");
      }).catch(() => setLogStatus("error"));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="browser-observations" aria-labelledby="browser-observations-title">
      <h2 id="browser-observations-title">Datos que JavaScript puede leer</h2>
      <p>
        Sin pedir permisos especiales, un script de esta página puede leer estos
        valores del navegador. Al cargar, esta demostración los envía al servidor y
        los escribe con nivel info en los logs de función de Vercel; no los guarda en
        la base de datos.
      </p>
      <dl className="access-log-list">
        <div><dt>Idiomas del navegador</dt><dd>{observations?.languages ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Zona horaria</dt><dd>{observations?.timeZone ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Tamaño de pantalla</dt><dd>{observations ? `${observations.screen.width} × ${observations.screen.height}` : "Cargando desde este navegador…"}</dd></div>
        <div><dt>Tamaño de ventana</dt><dd>{observations ? `${observations.viewport.width} × ${observations.viewport.height}` : "Cargando desde este navegador…"}</dd></div>
        <div><dt>Preferencia de color</dt><dd>{observations?.colorScheme ?? "Cargando desde este navegador…"}</dd></div>
      </dl>
      <p className="access-log-notice" aria-live="polite">
        {logStatus === "sent"
          ? "Enviado a Vercel como Info: busca la etiqueta [browser-observations]."
          : logStatus === "error"
            ? "No se pudieron enviar las observaciones a los logs del servidor."
            : "Enviando observaciones a los logs de Vercel…"}
      </p>
      <p className="access-log-notice">
        Combinados, estos detalles pueden ayudar a distinguir un navegador. Esta demo
        no genera una huella ni un identificador persistente. El navegador también
        transmite cookies aplicables a solicitudes normales, pero este envío las omite.
      </p>
      <p className="access-log-notice">
        Una base GeoIP puede estimar país, región, ciudad o proveedor a partir de la IP,
        pero no una dirección postal fiable; VPN, proxies y redes móviles reducen su
        precisión. Esta demo no envía la IP a servicios de geolocalización. La ubicación
        GPS precisa y el acceso a cámara o micrófono requieren permisos del navegador.
      </p>
    </section>
  );
}
