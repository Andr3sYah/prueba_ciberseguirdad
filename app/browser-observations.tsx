"use client";

import { useEffect, useState } from "react";

type BrowserObservations = {
  languages: string;
  timeZone: string;
  screen: string;
  viewport: string;
  colorScheme: string;
};

export function BrowserObservations() {
  const [observations, setObservations] = useState<BrowserObservations | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const colorScheme = typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "Oscuro" : "Claro"
        : "No disponible";

      setObservations({
        languages: navigator.languages.slice(0, 5).join(", ") || navigator.language || "No informado",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "No informado",
        screen: `${window.screen.width} × ${window.screen.height}`,
        viewport: `${window.innerWidth} × ${window.innerHeight}`,
        colorScheme,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="browser-observations" aria-labelledby="browser-observations-title">
      <h2 id="browser-observations-title">Datos que JavaScript puede leer</h2>
      <p>
        Sin pedir permisos especiales, un script de esta página puede leer estos
        valores del navegador. Esta demostración solo los muestra aquí: no los envía
        al servidor ni los guarda.
      </p>
      <dl className="access-log-list">
        <div><dt>Idiomas del navegador</dt><dd>{observations?.languages ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Zona horaria</dt><dd>{observations?.timeZone ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Tamaño de pantalla</dt><dd>{observations?.screen ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Tamaño de ventana</dt><dd>{observations?.viewport ?? "Cargando desde este navegador…"}</dd></div>
        <div><dt>Preferencia de color</dt><dd>{observations?.colorScheme ?? "Cargando desde este navegador…"}</dd></div>
      </dl>
      <p className="access-log-notice">
        Combinados, estos detalles pueden ayudar a distinguir un navegador. Esta demo
        no genera una huella ni un identificador persistente.
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
