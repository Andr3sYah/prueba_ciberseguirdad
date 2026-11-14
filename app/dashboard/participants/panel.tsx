"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConsentStorageMode, ConsentSubmission } from "@/lib/consent";

type ConsentResponse = {
  submissions?: ConsentSubmission[];
  storage?: ConsentStorageMode;
  error?: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ParticipantsPanel() {
  const [submissions, setSubmissions] = useState<ConsentSubmission[]>([]);
  const [storageMode, setStorageMode] = useState<ConsentStorageMode>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/consent", { cache: "no-store" });
          const result = (await response.json()) as ConsentResponse;
          if (!response.ok) throw new Error(result.error ?? "No se pudieron consultar los registros.");
          if (active) {
            setSubmissions(result.submissions ?? []);
            setStorageMode(result.storage);
          }
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "No se pudo conectar con el servidor.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="participants-page">
      <header className="topbar">
        <Link className="brand-lockup" href="/dashboard" aria-label="Signal Desk, dashboard">
          <span className="brand-mark" aria-hidden="true">SD</span>
          <span className="brand-name">Signal Desk <span>/ REGISTROS CONSENTIDOS</span></span>
        </Link>
        <nav className="toolbar" aria-label="Navegación de registros">
          <Link className="secondary-button" href="/participate" prefetch={false}>Ver registro del servidor</Link>
          <Link className="secondary-button" href="/dashboard">Volver al dashboard</Link>
        </nav>
      </header>

      <div className="participants-main">
        <section className="participants-intro">
          <div className="eyebrow"><span className="eyebrow-dot" /> VISTA PRIVADA · SESIÓN REQUERIDA</div>
          <h1>Participaciones voluntarias</h1>
          <p>Solo aparecen los campos enviados después de aceptar el consentimiento. Se eliminan al vencer su plazo de 30 días.</p>
          <div className="status-line"><span className="status-dot" /> ALMACENAMIENTO: {storageMode?.toUpperCase() ?? "CARGANDO"}</div>
        </section>

        {error && <div className="dashboard-error" role="alert">{error}</div>}
        {storageMode === "unconfigured" && <div className="storage-note warning">Configura DATABASE_URL con una conexión Neon nueva para guardar y consultar registros en producción.</div>}

        <section className="panel" aria-labelledby="participants-table-title">
          <div className="table-heading">
            <div className="panel-title" id="participants-table-title">Registros</div>
            <div className="panel-kicker">{loading ? "CARGANDO" : `${submissions.length} · MÁXIMO 200`}</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="event-table participants-table">
              <thead>
                <tr><th>Recibido</th><th>Alias</th><th>Motivo</th><th>Contacto autorizado</th><th>Mensaje</th><th>Consentimiento</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="empty-table" colSpan={6}>Cargando registros…</td></tr>
                ) : submissions.length === 0 ? (
                  <tr><td className="empty-table" colSpan={6}>No hay participaciones guardadas.</td></tr>
                ) : submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td><time dateTime={submission.consentedAt}>{formatDate(submission.consentedAt)}</time></td>
                    <td>{submission.displayName ?? "Sin alias"}</td>
                    <td><code>{submission.purpose}</code></td>
                    <td>{submission.contactConsent ? submission.email : "No autorizado"}</td>
                    <td><div className="participant-message">{submission.message ?? "Sin mensaje"}</div></td>
                    <td><span className="source-tag">{submission.consentVersion}</span><br /><span className="consent-receipt">{submission.id}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}