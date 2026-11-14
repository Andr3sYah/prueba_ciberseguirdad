import { randomUUID } from "node:crypto";

export type EventSource = "sdk" | "simulation";
export type StorageMode = "supabase" | "memory" | "unconfigured";

export type TelemetryEvent = {
  id: string;
  eventName: string;
  page: string;
  sessionId: string | null;
  properties: Record<string, string | number | boolean>;
  occurredAt: string;
  receivedAt: string;
  source: EventSource;
};

export class InputError extends Error {}
export class StorageError extends Error {}

const allowedPropertyNames = new Set([
  "plan",
  "region",
  "variant",
]);
// ponytail: memory is for local runs only; production requires external persistence.
const developmentEvents: TelemetryEvent[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEvent(value: unknown, source: EventSource = "sdk"): TelemetryEvent {
  if (!isRecord(value)) throw new InputError("El evento debe ser un objeto JSON.");

  const { eventName, page, sessionId, occurredAt, properties } = value;
  if (
    typeof eventName !== "string" ||
    !/^[a-z][a-z0-9_.-]{1,63}$/.test(eventName)
  ) {
    throw new InputError("eventName no tiene un formato válido.");
  }
  if (
    typeof page !== "string" ||
    page.length > 200 ||
    !page.startsWith("/") ||
    page.startsWith("//") ||
    page.includes("?") ||
    page.includes("#")
  ) {
    throw new InputError("page debe ser una ruta local sin parámetros.");
  }
  if (
    sessionId !== undefined &&
    sessionId !== null &&
    (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId))
  ) {
    throw new InputError("sessionId no tiene un formato válido.");
  }

  let normalizedOccurredAt = new Date().toISOString();
  if (occurredAt !== undefined) {
    if (typeof occurredAt !== "string" || !Number.isFinite(Date.parse(occurredAt))) {
      throw new InputError("occurredAt debe ser una fecha ISO válida.");
    }
    const timestamp = Date.parse(occurredAt);
    if (timestamp > Date.now() + 5 * 60_000 || timestamp < Date.now() - 30 * 86_400_000) {
      throw new InputError("occurredAt está fuera del intervalo permitido.");
    }
    normalizedOccurredAt = new Date(timestamp).toISOString();
  }

  const normalizedProperties: TelemetryEvent["properties"] = {};
  if (properties !== undefined) {
    if (!isRecord(properties) || Object.keys(properties).length > 4) {
      throw new InputError("properties debe contener como máximo cuatro campos permitidos.");
    }
    for (const [key, property] of Object.entries(properties)) {
      if (!allowedPropertyNames.has(key)) {
        throw new InputError(`La propiedad ${key} no está permitida.`);
      }
      if (
        typeof property === "string" && property.length <= 80 ||
        typeof property === "boolean" ||
        typeof property === "number" && Number.isFinite(property)
      ) {
        normalizedProperties[key] = property;
      } else {
        throw new InputError(`La propiedad ${key} no tiene un valor válido.`);
      }
    }
  }

  return {
    id: randomUUID(),
    eventName,
    page,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    properties: normalizedProperties,
    occurredAt: normalizedOccurredAt,
    receivedAt: new Date().toISOString(),
    source,
  };
}

export function createSyntheticEvents(): TelemetryEvent[] {
  const samples = [
    ["page_view", "/", "home", "Northstar"],
    ["product_view", "/catalog", "starter", "Northstar"],
    ["cta_click", "/catalog", "control", "Southridge"],
    ["page_view", "/docs", "desktop", "Southridge"],
    ["signup_start", "/signup", "variant-b", "Northstar"],
    ["signup_complete", "/welcome", "starter", "Westhaven"],
    ["checkout_start", "/checkout", "desktop", "Westhaven"],
    ["page_view", "/pricing", "control", "Southridge"],
  ] as const;

  return samples.map(([eventName, page, plan, region], index) => {
    const event = parseEvent(
      {
        eventName,
        page,
        sessionId: `demo_${randomUUID().slice(0, 12)}`,
        occurredAt: new Date(Date.now() - index * 4 * 60_000).toISOString(),
        properties: { plan, region },
      },
      "simulation",
    );
    return event;
  });
}

type SupabaseRow = {
  id: string;
  event_name: string;
  page: string;
  session_id: string | null;
  properties: TelemetryEvent["properties"];
  occurred_at: string;
  received_at: string;
  source: EventSource;
};

function getStorageConfig():
  | { mode: "supabase"; url: string; key: string }
  | { mode: "memory" }
  | { mode: "unconfigured" } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url || key) {
    if (!url || !key) throw new StorageError("La configuración de persistencia está incompleta.");
    try {
      const parsedUrl = new URL(url);
      const localDevelopment =
        process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
      if (parsedUrl.protocol !== "https:" && !localDevelopment) {
        throw new Error("Invalid protocol");
      }
      if (!localDevelopment && !parsedUrl.hostname.endsWith(".supabase.co")) {
        throw new Error("Invalid host");
      }
      return { mode: "supabase", url: parsedUrl.origin, key };
    } catch {
      throw new StorageError("La configuración de persistencia no es válida.");
    }
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return { mode: "unconfigured" };
  }
  return { mode: "memory" };
}

export function getStorageMode(): StorageMode {
  return getStorageConfig().mode;
}

function toSupabaseRow(event: TelemetryEvent): SupabaseRow {
  return {
    id: event.id,
    event_name: event.eventName,
    page: event.page,
    session_id: event.sessionId,
    properties: event.properties,
    occurred_at: event.occurredAt,
    received_at: event.receivedAt,
    source: event.source,
  };
}

function fromSupabaseRow(row: SupabaseRow): TelemetryEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    page: row.page,
    sessionId: row.session_id,
    properties: row.properties,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    source: row.source,
  };
}

async function supabaseRequest(
  config: { url: string; key: string },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new StorageError("El servicio de persistencia no está disponible.");
  }
}

export async function saveEvents(events: TelemetryEvent[]): Promise<void> {
  const config = getStorageConfig();
  if (config.mode === "unconfigured") {
    throw new StorageError("Configura Supabase antes de guardar eventos en producción.");
  }
  if (config.mode === "memory") {
    developmentEvents.unshift(...events);
    developmentEvents.length = Math.min(developmentEvents.length, 10_000);
    return;
  }

  const response = await supabaseRequest(config, "telemetry_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(events.map(toSupabaseRow)),
  });
  if (!response.ok) throw new StorageError("No se pudieron guardar los eventos.");
}

export async function listEvents(limit = 200): Promise<TelemetryEvent[]> {
  const config = getStorageConfig();
  if (config.mode === "unconfigured") {
    throw new StorageError("Configura Supabase antes de consultar eventos en producción.");
  }
  if (config.mode === "memory") return developmentEvents.slice(0, limit);

  const query = new URLSearchParams({
    select: "id,event_name,page,session_id,properties,occurred_at,received_at,source",
    order: "received_at.desc",
    limit: String(limit),
  });
  const response = await supabaseRequest(config, `telemetry_events?${query}`);
  if (!response.ok) throw new StorageError("No se pudieron consultar los eventos.");
  try {
    const rows = (await response.json()) as SupabaseRow[];
    return rows.map(fromSupabaseRow);
  } catch {
    throw new StorageError("La respuesta del servicio de persistencia no es válida.");
  }
}