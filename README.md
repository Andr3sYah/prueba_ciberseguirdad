This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

# Signal Desk

 Laboratorio de telemetría web para eventos explícitos y autorizados. No incluye rastreo automático, huellas del navegador, geolocalización real ni recopilación de datos personales. La simulación usa nombres de eventos, rutas y regiones ficticias.

 ## Requisitos

 - Node.js 20.9 o posterior.
 - npm 10 o posterior.
- Neon para guardar participaciones consentidas en Vercel.
- Supabase opcional para persistencia de eventos de telemetría. En desarrollo local, sin credenciales, los eventos y las participaciones viven en memoria y se pierden al reiniciar.

 ## Desarrollo local

 ```powershell
 npm ci
 Copy-Item .env.example .env.local
 ```

 Genera un secreto con PowerShell y guarda el resultado como `SESSION_SECRET` en `.env.local`:

 ```powershell
 [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 ```

 Configura `DASHBOARD_PASSWORD` (mínimo 12 caracteres), `SESSION_SECRET` (mínimo 32) y `TELEMETRY_WRITE_KEY` (mínimo 24). No uses los valores de ejemplo en un despliegue. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son opcionales localmente.

 ```powershell
 npm run dev
 ```

 Abre <http://localhost:3000>. El dashboard requiere iniciar sesión. **Generar datos de prueba** guarda ocho eventos sintéticos y los identifica como `simulation`.

 ## Ingesta de eventos

 `POST /api/events` requiere `Authorization: Bearer <TELEMETRY_WRITE_KEY>`. Se aceptan de 1 a 20 eventos por solicitud, con un máximo de 8 KiB:

 ```json
 {
	 "eventName": "page_view",
	 "page": "/catalog",
	 "sessionId": "random_session_id",
	 "properties": { "plan": "starter", "region": "Northstar" }
 }
 ```

 `eventName` debe usar minúsculas y guiones bajos, puntos o guiones. `page` es una ruta local sin query string. `sessionId` es opcional y debe ser aleatorio; las únicas propiedades admitidas son `plan`, `region` y `variant`. No envíes correos, nombres, IPs, datos del dispositivo, identificadores persistentes ni secretos. La clave de ingesta solo se debe usar desde un servidor o entorno de confianza, nunca incrustada en JavaScript público.

 Rutas disponibles:

 - `POST /api/auth/login`: inicia una sesión con cookie HttpOnly, SameSite=Strict y duración de ocho horas.
 - `POST /api/auth/logout`: invalida la cookie del cliente.
 - `GET /api/events`: devuelve los últimos 200 eventos; requiere sesión.
 - `POST /api/events`: ingesta protegida por clave.
 - `POST /api/simulate`: genera eventos ficticios; requiere sesión.
- `GET /participate`: muestra y escribe en los logs del servidor la hora, método y ruta fija, IP reportada por el proxy, host, plataforma, User-Agent, tipos de contenido e idiomas aceptados, origen del referente, contexto de navegación (`Sec-Fetch-*`) y señales de privacidad (`DNT`, `Sec-GPC`) recibidos en esa solicitud. El referente se reduce al origen para no registrar rutas ni parámetros. Estos datos no se guardan en la base de datos de la aplicación.
- `POST /api/consent`: guarda solo después de aceptar el consentimiento requerido.
- `GET /dashboard/participants`: lista las participaciones; requiere sesión válida.

 Los límites de solicitudes viven en memoria del proceso. Son útiles para desarrollo y una barrera básica, pero no son un limitador distribuido entre instancias de Vercel.

## Participaciones consentidas en Neon

El formulario solicita un alias opcional, un motivo obligatorio y un mensaje opcional de hasta 500 caracteres. El correo solo se transmite y guarda cuando la persona activa el permiso de contacto separado. Se guarda la versión y hora del consentimiento; no se registra IP, ubicación, huella del navegador ni historial de navegación en esta aplicación.

La variable `DATABASE_URL` debe contener la cadena de conexión Neon **rotada y nueva**. No reutilices una credencial que haya sido compartida en chats, código o logs. La cadena solo se lee en el servidor y nunca usa el prefijo `NEXT_PUBLIC_`.

La página `/participate` no envía estos datos a Neon ni a Supabase. Muestra y escribe en los logs de la aplicación metadatos de la solicitud HTTP que el servidor recibe normalmente: hora, método/ruta, IP reportada por el proxy, host, tipos de contenido e idiomas aceptados, referente (solo origen), User-Agent, plataforma, contexto `Sec-Fetch-*` y señales `DNT`/`Sec-GPC`. Los valores de cabeceras se limitan y se eliminan caracteres de control antes de registrarse. No se leen cookies, contenido de formularios ni parámetros de URL para este registro. La IP depende de la configuración del proxy y no debe considerarse confiable si los encabezados de proxy pueden ser enviados directamente por clientes; User-Agent, idioma y sugerencias del navegador son valores declarados y pueden ser inexactos. El proveedor de alojamiento puede conservar sus propios logs según su configuración y política de retención.

Crea la tabla en Neon antes de habilitar envíos:

```sql
create table public.consent_submissions (
	id uuid primary key,
	display_name varchar(80),
	email varchar(254),
	purpose text not null check (purpose in ('class_demo', 'feedback', 'follow_up', 'other')),
	message varchar(500),
	contact_consent boolean not null,
	consent_accepted boolean not null check (consent_accepted),
	consent_version text not null,
	consented_at timestamptz not null,
	expires_at timestamptz not null
);

create index consent_submissions_expiry_idx
	on public.consent_submissions (expires_at);
```

Los registros vencen a los 30 días y se purgan al consultar o guardar nuevos registros. Si la base no está configurada en producción, el API no guarda nada y responde con error; en desarrollo sin `DATABASE_URL`, se usa memoria temporal.

 ## Persistencia con Supabase

 Crea esta tabla en Supabase. No añadas políticas para `anon` ni expongas la clave `service_role`; el backend usa esa clave y Row Level Security permanece activa:

 ```sql
 create table public.telemetry_events (
	 id uuid primary key,
	 event_name text not null,
	 page text not null,
	 session_id text,
	 properties jsonb not null default '{}'::jsonb,
	 occurred_at timestamptz not null,
	 received_at timestamptz not null,
	 source text not null check (source in ('sdk', 'simulation'))
 );

 create index telemetry_events_received_at_idx
	 on public.telemetry_events (received_at desc);

 alter table public.telemetry_events enable row level security;
 ```

 Define `SUPABASE_URL` (por ejemplo `https://<project>.supabase.co`) y `SUPABASE_SERVICE_ROLE_KEY` en el entorno del servidor. Si falta uno o el servicio falla, las rutas devuelven un error genérico 503 y no filtran diagnósticos ni credenciales. En producción, la app falla cerrada si no se configura la persistencia.

 ## Pruebas y compilación

 ```powershell
 npm test
 npm run lint
 npm run typecheck
 npm run build
 ```

 `npm test` levanta Next.js y un servidor Supabase HTTP local de prueba; no necesita una cuenta ni toca servicios externos.

 ## Vercel

 1. Importa el repositorio en Vercel; usa la configuración predeterminada de Next.js.
2. Crea la tabla Neon anterior y añade `DATABASE_URL`, `DASHBOARD_PASSWORD`, `SESSION_SECRET` y `TELEMETRY_WRITE_KEY` en Project Settings → Environment Variables. Añade `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo si también activarás persistencia Supabase para eventos. Usa secretos rotados y únicos para producción.
 3. Despliega desde Vercel. El comando de producción es `npm run build`; el almacenamiento no depende del sistema de archivos local.
 4. No configures las variables como `NEXT_PUBLIC_*`; los secretos permanecen en funciones del servidor.

 El proyecto no se ha desplegado desde este entorno. La protección contra fuerza bruta usa límites por proceso; para cargas públicas en Vercel, configura además un proveedor de rate limiting distribuido antes de exponer la ingesta a gran escala.
## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
