import { cookies } from "next/headers";
import { Dashboard, LoginPanel } from "@/app/workspace";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getStorageMode, listEvents, type StorageMode, type TelemetryEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const authenticated = verifySessionToken(session, process.env.SESSION_SECRET);

  if (!authenticated) return <LoginPanel />;

  let initialEvents: TelemetryEvent[] = [];
  let initialStorage: StorageMode | undefined;
  let initialError = "";
  try {
    initialStorage = getStorageMode();
    if (initialStorage !== "unconfigured") initialEvents = await listEvents();
  } catch {
    initialError = "No se pudieron cargar los eventos. Comprueba la conexión de persistencia.";
  }

  return (
    <Dashboard
      initialError={initialError}
      initialEvents={initialEvents}
      initialStorage={initialStorage}
    />
  );
}
