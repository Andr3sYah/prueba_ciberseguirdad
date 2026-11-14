"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StorageMode, TelemetryEvent } from "@/lib/telemetry";

type LoginResponse = { error?: string; authenticated?: boolean };
type EventsResponse = { events?: TelemetryEvent[]; storage?: StorageMode; error?: string };

function Brand() {
  return (
    <div className="brand-lockup" aria-label="Signal Desk">
      <div className="brand-mark" aria-hidden="true">SD</div>
      <div className="brand-name">Signal Desk <span>/ WEB TELEMETRY</span></div>
    </div>
  );
}

export function LoginPanel() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as LoginResponse;
      if (!response.ok) throw new Error(result.error ?? "No se pudo iniciar sesión.");
      setPassword("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-screen">
      <aside className="login-aside">
        <Brand />
        <div className="login-intro">
          <div className="eyebrow"><span className="eyebrow-dot" /> Laboratorio de observabilidad</div>
          <h1>Señales claras. Sin vigilancia oculta.</h1>
          <p>Explora eventos de producto autorizados y datos sintéticos en un espacio privado.</p>
        </div>
        <div className="login-meta"><span>TELEMETRY LAB / 01</span><span>PRIVACY FIRST</span></div>
      </aside>
      <section className="login-content" aria-labelledby="login-title">
        <form className="login-form" onSubmit={signIn}>
          <div className="eyebrow"><span className="eyebrow-dot" /> Acceso restringido</div>
          <h2 id="login-title">Entrar al dashboard</h2>
          <p>Este espacio está protegido. Usa la contraseña configurada por el administrador.</p>
          <label className="field-label" htmlFor="dashboard-password">Contraseña</label>
          <input
            autoComplete="current-password"
            className="text-field"
            id="dashboard-password"
            name="password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Verificando…" : "Iniciar sesión"}
          </button>
          <div className="login-footnote">Las credenciales nunca se envían al navegador como configuración ni se guardan en el almacenamiento local.</div>
          <Link className="participate-link" href="/participate" prefetch={false}>Ver datos del registro del servidor</Link>
        </form>
      </section>
    </main>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Dashboard({
  initialEvents,
  initialStorage,
  initialError,
}: {
  initialEvents: TelemetryEvent[];
  initialStorage: StorageMode | undefined;
  initialError: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [storage, setStorage] = useState<StorageMode | undefined>(initialStorage);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"simulate" | "refresh" | "logout" | null>(null);
  const [error, setError] = useState(initialError);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function loadEvents() {
    setPendingAction("refresh");
    setError("");
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const result = (await response.json()) as EventsResponse;
      if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los eventos.");
      setEvents(result.events ?? []);
      setStorage(result.storage);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  }

  async function simulate() {
    setPendingAction("simulate");
    setError("");
    try {
      const response = await fetch("/api/simulate", { method: "POST" });
      const result = (await response.json()) as { error?: string; generated?: number };
      if (!response.ok) throw new Error(result.error ?? "No se pudo ejecutar la simulación.");
      await loadEvents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar con el servidor.");
      setPendingAction(null);
    }
  }

  async function signOut() {
    setPendingAction("logout");
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión.");
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      setPendingAction(null);
    }
  }

  const dayEvents = events.filter((event) => now - Date.parse(event.occurredAt) < 86_400_000);
  const sessions = new Set(dayEvents.flatMap((event) => event.sessionId ? [event.sessionId] : [])).size;
  const simulated = events.filter((event) => event.source === "simulation").length;
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = now - (11 - index) * 60 * 60_000;
    const end = start + 60 * 60_000;
    return events.filter((event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return occurredAt >= start && occurredAt < end;
    }).length;
  });
  const maxBucket = Math.max(1, ...buckets);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Brand />
        <nav className="toolbar" aria-label="Acciones del dashboard">
          <Link aria-label="Registros consentidos" className="secondary-button participants-link" href="/dashboard/participants">Registros</Link>
          <button
            aria-label="Actualizar eventos"
            className="icon-button"
            disabled={pendingAction !== null}
            onClick={() => void loadEvents()}
            title="Actualizar eventos"
            type="button"
          >↻</button>
          <button className="secondary-button" disabled={pendingAction !== null} onClick={() => void signOut()} type="button">
            {pendingAction === "logout" ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </nav>
      </header>

      <div className="dashboard-main">
        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> Resumen de actividad</div>
            <h1>Telemetría web</h1>
            <p>Eventos explícitos de producto y simulación local, sin seguimiento de personas.</p>
          </div>
          <button className="primary-button" disabled={pendingAction !== null} onClick={() => void simulate()} type="button">
            {pendingAction === "simulate" ? "Generando…" : "＋　Generar datos de prueba"}
          </button>
        </section>

        {error && <div className="dashboard-error" role="alert">{error}</div>}

        <div className="stats-grid" aria-live="polite">
          <div className="stat-cell"><div className="stat-label">Eventos · 24 h</div><div className="stat-value">{loading ? "—" : dayEvents.length}</div><div className="stat-foot">Datos recibidos</div></div>
          <div className="stat-cell"><div className="stat-label">Sesiones declaradas</div><div className="stat-value">{loading ? "—" : sessions}</div><div className="stat-foot">IDs aleatorios, sin perfil</div></div>
          <div className="stat-cell"><div className="stat-label">Simulación</div><div className="stat-value">{loading ? "—" : simulated}</div><div className="stat-foot">Eventos sintéticos visibles</div></div>
          <div className="stat-cell"><div className="stat-label">Almacenamiento</div><div className="stat-value" style={{ fontSize: 18, paddingTop: 5 }}>{loading ? "—" : storage === "supabase" ? "SUPABASE" : storage === "memory" ? "LOCAL" : "N/D"}</div><div className="stat-foot">{storage === "memory" ? "Volátil · solo desarrollo" : storage === "supabase" ? "Base de datos conectada" : "Sin persistencia"}</div></div>
        </div>

        <div className="content-grid">
          <section className="panel" aria-labelledby="activity-title">
            <div className="panel-topline">
              <div className="panel-title" id="activity-title">Volumen de eventos</div>
              <div className="panel-kicker">ÚLTIMAS 12 HORAS</div>
            </div>
            <div className="chart-wrap">
              {loading ? <div className="loading-block" role="status">Cargando eventos…</div> : events.length === 0 ? (
                <div className="empty-chart">Aún no hay actividad.<br />Genera eventos de prueba o conecta una fuente autorizada.</div>
              ) : (
                <>
                  <div className="chart-bars" aria-label="Conteo de eventos por hora">
                    {buckets.map((count, index) => <div className="chart-bar" key={index} style={{ height: `${Math.max(3, count / maxBucket * 100)}%` }} title={`${count} eventos`} />)}
                  </div>
                  <div className="chart-axis"><span>−12 h</span><span>−6 h</span><span>Ahora</span></div>
                </>
              )}
            </div>
          </section>

          <div className="side-stack">
            <section className="panel" aria-labelledby="feed-title">
              <div className="panel-topline"><div className="panel-title" id="feed-title">Flujo reciente</div><div className="panel-kicker">{events.length} EVENTOS</div></div>
              <div className="feed-list">
                {loading ? <div className="loading-block" role="status">Cargando…</div> : events.length === 0 ? <div className="empty-feed">El flujo está vacío. Los eventos nuevos aparecerán aquí.</div> : events.slice(0, 6).map((event) => (
                  <div className="feed-item" key={event.id}>
                    <span className="feed-marker" aria-hidden="true" />
                    <span className="feed-name">{event.eventName}</span>
                    <time className="feed-time" dateTime={event.receivedAt}>{formatTime(event.receivedAt)}</time>
                  </div>
                ))}
              </div>
            </section>
            <section className={`storage-note ${storage === "memory" || storage === "unconfigured" ? "warning" : ""}`} aria-live="polite">
              <span aria-hidden="true">{storage === "supabase" ? "●" : "!"}</span>
              <div><strong>{storage === "supabase" ? "Persistencia activa" : storage === "memory" ? "Almacenamiento temporal" : "Persistencia no disponible"}</strong>
                {storage === "supabase" ? "Los eventos se guardan en el proyecto Supabase configurado." : storage === "memory" ? "Los datos viven solo en este proceso y se pierden al reiniciar. Configura Supabase para despliegues." : "Configura Supabase para habilitar la lectura y escritura."}
              </div>
            </section>
          </div>
        </div>

        <section className="panel event-panel" aria-labelledby="events-title">
          <div className="table-heading"><div className="panel-title" id="events-title">Eventos recibidos</div><div className="panel-kicker">ÚLTIMOS 200</div></div>
          {loading ? <div className="loading-block" role="status">Cargando tabla…</div> : (
            <div style={{ overflowX: "auto" }}>
              <table className="event-table">
                <thead><tr><th>Evento</th><th>Ruta</th><th>Origen</th><th>Recibido</th></tr></thead>
                <tbody>
                  {events.length === 0 ? <tr><td className="empty-table" colSpan={4}>Todavía no se han recibido eventos.</td></tr> : events.slice(0, 10).map((event) => (
                    <tr key={event.id}>
                      <td><code>{event.eventName}</code></td>
                      <td>{event.page}</td>
                      <td><span className={`source-tag ${event.source}`}>{event.source === "simulation" ? "sintético" : "ingesta"}</span></td>
                      <td>{formatDate(event.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="page-footer"><span>Signal Desk · datos mínimos y explícitos</span><span>{pendingAction === "refresh" ? "ACTUALIZANDO" : "VISTA PRIVADA"}</span></footer>
      </div>
    </main>
  );
}