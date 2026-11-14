import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const CONSENT_VERSION = "2026-10-22-v1";
export const CONSENT_RETENTION_DAYS = 30;

export const consentPurposes = [
  "class_demo",
  "feedback",
  "follow_up",
  "other",
] as const;

export type ConsentPurpose = (typeof consentPurposes)[number];
export type ConsentStorageMode = "neon" | "memory" | "unconfigured";

export type ConsentSubmission = {
  id: string;
  displayName: string | null;
  email: string | null;
  purpose: ConsentPurpose;
  message: string | null;
  contactConsent: boolean;
  consentAccepted: true;
  consentVersion: string;
  consentedAt: string;
};

type NewConsentSubmission = Pick<
  ConsentSubmission,
  "displayName" | "email" | "purpose" | "message" | "contactConsent"
>;

export class ConsentInputError extends Error {}
export class ConsentStorageError extends Error {}

const memorySubmissions: ConsentSubmission[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ConsentInputError(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ConsentInputError(`${field} supera el máximo de ${maximum} caracteres.`);
  }
  return normalized || null;
}

export function parseConsentSubmission(value: unknown): NewConsentSubmission {
  if (!isRecord(value)) throw new ConsentInputError("El formulario no es válido.");
  const allowedFields = new Set([
    "consent",
    "displayName",
    "email",
    "purpose",
    "message",
    "contactConsent",
  ]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new ConsentInputError("El formulario contiene campos no admitidos.");
  }
  if (value.consent !== true) {
    throw new ConsentInputError("Debes aceptar el aviso de consentimiento antes de enviar.");
  }
  if (typeof value.purpose !== "string" || !consentPurposes.includes(value.purpose as ConsentPurpose)) {
    throw new ConsentInputError("Selecciona un motivo válido.");
  }
  if (value.contactConsent !== undefined && typeof value.contactConsent !== "boolean") {
    throw new ConsentInputError("El permiso de contacto no es válido.");
  }

  const displayName = optionalText(value.displayName, "El alias", 80);
  const message = optionalText(value.message, "El mensaje", 500);
  const contactConsent = value.contactConsent === true;
  if (value.purpose === "follow_up" && !contactConsent) {
    throw new ConsentInputError("Para solicitar contacto, activa el permiso separado.");
  }
  let email: string | null = null;

  if (contactConsent) {
    const suppliedEmail = optionalText(value.email, "El correo", 254);
    if (
      !suppliedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)
    ) {
      throw new ConsentInputError("Para autorizar el contacto, escribe un correo válido.");
    }
    email = suppliedEmail;
  }

  return {
    displayName,
    email,
    purpose: value.purpose as ConsentPurpose,
    message,
    contactConsent,
  };
}

function storageConfig():
  | { mode: "neon"; connectionString: string }
  | { mode: "memory" }
  | { mode: "unconfigured" } {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    try {
      const parsed = new URL(connectionString);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !parsed.hostname.endsWith(".neon.tech") ||
        !parsed.searchParams.has("sslmode")
      ) {
        throw new Error("Invalid Neon connection string");
      }
      return { mode: "neon", connectionString };
    } catch {
      throw new ConsentStorageError("La configuración de Neon no es válida.");
    }
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return { mode: "unconfigured" };
  }
  return { mode: "memory" };
}

export function getConsentStorageMode(): ConsentStorageMode {
  return storageConfig().mode;
}

function createSubmission(input: NewConsentSubmission): ConsentSubmission {
  return {
    id: randomUUID(),
    ...input,
    consentAccepted: true,
    consentVersion: CONSENT_VERSION,
    consentedAt: new Date().toISOString(),
  };
}

export async function saveConsentSubmission(
  input: NewConsentSubmission,
): Promise<ConsentSubmission> {
  const config = storageConfig();
  if (config.mode === "unconfigured") {
    throw new ConsentStorageError("La persistencia no está configurada.");
  }

  const submission = createSubmission(input);
  if (config.mode === "memory") {
    memorySubmissions.unshift(submission);
    memorySubmissions.length = Math.min(memorySubmissions.length, 1_000);
    return submission;
  }

  try {
    const sql = neon(config.connectionString);
    await sql`DELETE FROM public.consent_submissions WHERE expires_at <= NOW()`;
    await sql`
      INSERT INTO public.consent_submissions (
        id, display_name, email, purpose, message,
        contact_consent, consent_accepted, consent_version, consented_at, expires_at
      ) VALUES (
        ${submission.id}::uuid,
        ${submission.displayName},
        ${submission.email},
        ${submission.purpose},
        ${submission.message},
        ${submission.contactConsent},
        ${submission.consentAccepted},
        ${submission.consentVersion},
        ${submission.consentedAt}::timestamptz,
        ${new Date(Date.now() + CONSENT_RETENTION_DAYS * 86_400_000).toISOString()}::timestamptz
      )
    `;
    return submission;
  } catch {
    throw new ConsentStorageError("No se pudo guardar el registro en Neon.");
  }
}

type ConsentDatabaseRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  purpose: ConsentPurpose;
  message: string | null;
  contact_consent: boolean;
  consent_accepted: true;
  consent_version: string;
  consented_at: string | Date;
};

function mapRow(row: ConsentDatabaseRow): ConsentSubmission {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    purpose: row.purpose,
    message: row.message,
    contactConsent: row.contact_consent,
    consentAccepted: row.consent_accepted,
    consentVersion: row.consent_version,
    consentedAt: new Date(row.consented_at).toISOString(),
  };
}

export async function listConsentSubmissions(limit = 200): Promise<ConsentSubmission[]> {
  const config = storageConfig();
  if (config.mode === "unconfigured") {
    throw new ConsentStorageError("La persistencia no está configurada.");
  }
  if (config.mode === "memory") return memorySubmissions.slice(0, limit);

  try {
    const sql = neon(config.connectionString);
    await sql`DELETE FROM public.consent_submissions WHERE expires_at <= NOW()`;
    const rows = (await sql`
      SELECT
        id::text, display_name, email, purpose, message,
        contact_consent, consent_accepted, consent_version, consented_at
      FROM public.consent_submissions
      WHERE expires_at > NOW()
      ORDER BY consented_at DESC
      LIMIT ${limit}
    `) as unknown as ConsentDatabaseRow[];
    return rows.map(mapRow);
  } catch {
    throw new ConsentStorageError("No se pudieron consultar los registros en Neon.");
  }
}