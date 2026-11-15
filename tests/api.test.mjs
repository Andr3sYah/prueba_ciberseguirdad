import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { join } from "node:path";

const root = process.cwd();
const rows = [];
let databaseFailure = false;
let databaseConnectionFailure = false;
let databaseServer;
let appServer;
let baseUrl;
let databaseUrl;
let sessionCookie;
let serverOutput = "";

async function reservePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startDatabase() {
  const port = await reservePort();
  databaseServer = createServer(async (request, response) => {
    if (databaseConnectionFailure) {
      request.socket.destroy();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    if (databaseFailure) {
      response.writeHead(503, { "Content-Type": "text/plain" });
      response.end("private database diagnostic");
      return;
    }
    if (request.method === "POST") {
      rows.unshift(...JSON.parse(body));
      response.writeHead(201);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(rows));
  });
  databaseServer.listen(port, "127.0.0.1");
  await once(databaseServer, "listening");
  databaseUrl = `http://127.0.0.1:${port}`;
}

async function startApp(withSecrets) {
  const port = await reservePort();
  const env = { ...process.env, NODE_ENV: "development", PORT: String(port) };
  for (const name of ["DASHBOARD_PASSWORD", "SESSION_SECRET", "TELEMETRY_WRITE_KEY", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    delete env[name];
  }
  if (withSecrets) {
    Object.assign(env, {
      DASHBOARD_PASSWORD: "test-dashboard-passphrase-2026",
      SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789abcdef",
      TELEMETRY_WRITE_KEY: "test-telemetry-write-key-0123456789",
      SUPABASE_URL: databaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: "test-supabase-service-role-key",
    });
  }
  const nextEntry = join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextEntry, "dev", "-p", String(port)], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer = child;
  serverOutput = "";
  child.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-8_000); });
  child.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-8_000); });
  baseUrl = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next terminó al iniciar:\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Next no respondió antes del timeout:\n${serverOutput}`);
}

async function stopApp() {
  if (!appServer || appServer.exitCode !== null) return;
  const child = appServer;
  child.kill();
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  appServer = undefined;
}

before(async () => {
  await startDatabase();
  await startApp(true);
});

after(async () => {
  await stopApp();
  if (databaseServer?.listening) await new Promise((resolve) => databaseServer.close(resolve));
});

test("the public home logs a visit while the dashboard and event reads require a session", async () => {
  const publicPage = await fetch(baseUrl);
  const publicHtml = await publicPage.text();
  assert.equal(publicPage.status, 200);
  assert.match(publicHtml, /Lo que una visita puede revelar/);
  assert.match(publicHtml, /collage-01\.jpg/);
  assert.match(publicHtml, /collage-02\.jpg/);
  assert.match(publicHtml, /collage-03\.jpg/);
  assert.match(publicHtml, /collage-04\.jpg/);
  assert.doesNotMatch(publicHtml, /Datos visibles en esta solicitud|IP reportada por el proxy/);
  assert.doesNotMatch(publicHtml, /<h2 id="login-title">Entrar al dashboard|type="password"/);
  assert.match(serverOutput, /\[access-log\].*"path":"\/"/);

  const browserObservations = await fetch(`${baseUrl}/api/browser-observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      languages: "es-419,es",
      timeZone: "America/Bogota",
      screen: { width: 1920, height: 1080 },
      viewport: { width: 1365, height: 768 },
      colorScheme: "Claro",
      cookie: "must-not-be-logged",
    }),
  });
  assert.equal(browserObservations.status, 202);
  const browserLogLine = serverOutput.match(/\[browser-observations\].*/)?.[0] ?? "";
  assert.match(browserLogLine, /"timeZone":"America\/Bogota"/);
  assert.match(browserLogLine, /"screen":\{"width":1920,"height":1080\}/);
  assert.doesNotMatch(browserLogLine, /must-not-be-logged/);

  const invalidObservations = await fetch(`${baseUrl}/api/browser-observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      languages: "es",
      timeZone: "America/Bogota\nforged-log-line",
      screen: { width: 1920, height: 1080 },
      viewport: { width: 1365, height: 768 },
      colorScheme: "Claro",
    }),
  });
  assert.equal(invalidObservations.status, 400);

  const loginPage = await fetch(`${baseUrl}/dashboard`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Entrar al dashboard/);

  const events = await fetch(`${baseUrl}/api/events`);
  assert.equal(events.status, 401);

  const storedRowsBeforeVisit = rows.length;
  const participation = await fetch(`${baseUrl}/participate?token=do-not-log`, {
    headers: {
      "sec-ch-ua-platform": "\"Windows\"",
      "user-agent": "University Lab Browser/1.0",
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "es-419,es;q=0.9,en;q=0.8",
      "referer": "https://course.example.test/lesson?student=private",
      "sec-fetch-site": "same-origin",
      "sec-fetch-dest": "document",
      "dnt": "1",
      "sec-gpc": "1",
      "x-real-ip": "203.0.113.42",
      "cookie": "session=do-not-log",
    },
  });
  const participationHtml = await participation.text();
  const accessLogHtml = participationHtml.match(/<dl class="access-log-list">([\s\S]*?)<\/dl>/)?.[1]?.replace(/<!--.*?-->/g, "") ?? "";
  assert.equal(participation.status, 200);
  assert.match(participationHtml, /Datos visibles en esta solicitud/);
  assert.match(participationHtml, /203\.0\.113\.42/);
  assert.match(participationHtml, /University Lab Browser\/1\.0/);
  assert.match(participationHtml, /Windows/);
  assert.match(participationHtml, /text\/html,application\/xhtml\+xml/);
  assert.match(participationHtml, /es-419,es;q=0\.9,en;q=0\.8/);
  assert.match(participationHtml, /https:\/\/course\.example\.test/);
  assert.doesNotMatch(participationHtml, /student=private/);
  assert.doesNotMatch(accessLogHtml, /do-not-log|student=private/);
  assert.match(accessLogHtml, /GET \/participate/);
  assert.match(accessLogHtml, /same-origin \/ cors \/ document/);
  assert.match(accessLogHtml, /DNT: 1 \/ GPC: 1/);
  assert.doesNotMatch(participationHtml, /<form|Tú decides qué compartir|Motivo de participación/);
  assert.equal(rows.length, storedRowsBeforeVisit);
  assert.match(serverOutput, /\[access-log\].*"ip":"203\.0\.113\.42".*"userAgent":"University Lab Browser\/1\.0".*"acceptLanguage":"es-419,es;q=0\.9,en;q=0\.8".*"refererOrigin":"https:\/\/course\.example\.test"/);
  assert.doesNotMatch(serverOutput.match(/\[access-log\].*/)?.[0] ?? "", /student=private/);
  assert.doesNotMatch(serverOutput.match(/\[access-log\].*/)?.[0] ?? "", /do-not-log/);
  assert.doesNotMatch(serverOutput.match(/\[access-log\].*"path":"\/".*/)?.[0] ?? "", /timeZone|viewport|screen/);
});

test("ingestion rejects missing credentials and invalid event payloads", async () => {
  const event = { eventName: "page_view", page: "/catalog" };
  const unauthorized = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...event, page: "//external.example" }),
  });
  assert.equal(invalid.status, 400);

  const malformed = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: "{invalid-json",
  });
  assert.equal(malformed.status, 400);

  const oversized = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...event, page: `/${"x".repeat(9_000)}` }),
  });
  assert.equal(oversized.status, 413);

  const deviceData = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...event, properties: { deviceClass: "desktop" } }),
  });
  assert.equal(deviceData.status, 400);
});

test("valid ingestion persists, simulation appears in the protected dashboard", async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-dashboard-passphrase-2026" }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  sessionCookie = setCookie.split(";")[0];

  const empty = await fetch(`${baseUrl}/api/events`, { headers: { Cookie: sessionCookie } });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).events, []);

  const accepted = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventName: "page_view", page: "/catalog", sessionId: "test_session" }),
  });
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).accepted, 1);

  const simulation = await fetch(`${baseUrl}/api/simulate`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  assert.equal(simulation.status, 201);
  assert.equal((await simulation.json()).generated, 8);

  const dashboardEvents = await fetch(`${baseUrl}/api/events`, { headers: { Cookie: sessionCookie } });
  const result = await dashboardEvents.json();
  assert.equal(dashboardEvents.status, 200);
  assert.equal(result.storage, "supabase");
  assert.equal(result.events.length, 9);
  assert.equal(result.events.filter((event) => event.source === "simulation").length, 8);
  assert.ok(result.events.some((event) => event.eventName === "page_view" && event.source === "sdk"));

  const privatePage = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: sessionCookie } });
  const privateHtml = await privatePage.text();
  assert.match(privateHtml, /Eventos recibidos/);
  assert.match(privateHtml, /sintético/);
  assert.match(privateHtml, /signup_complete/);
});

test("consent is required, contact permission is separate, and records are private", async () => {
  const unauthorizedList = await fetch(`${baseUrl}/api/consent`);
  assert.equal(unauthorizedList.status, 401);

  const noConsent = await fetch(`${baseUrl}/api/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "feedback", consent: false, message: "must not persist" }),
  });
  assert.equal(noConsent.status, 400);

  const noContactEmail = await fetch(`${baseUrl}/api/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "follow_up", consent: true, contactConsent: true }),
  });
  assert.equal(noContactEmail.status, 400);

  const accepted = await fetch(`${baseUrl}/api/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consent: true,
      displayName: "Demo learner",
      purpose: "follow_up",
      message: "Consent flow test only.",
      contactConsent: true,
      email: "demo@example.test",
    }),
  });
  assert.equal(accepted.status, 201);
  const acknowledgement = await accepted.json();
  assert.equal(acknowledgement.storage, "memory");
  assert.ok(acknowledgement.id);
  assert.equal("email" in acknowledgement, false);

  const protectedList = await fetch(`${baseUrl}/api/consent`, {
    headers: { Cookie: sessionCookie },
  });
  const result = await protectedList.json();
  assert.equal(protectedList.status, 200);
  assert.equal(result.submissions.length, 1);
  assert.equal(result.submissions[0].displayName, "Demo learner");
  assert.equal(result.submissions[0].email, "demo@example.test");
  assert.equal(result.submissions[0].contactConsent, true);
  assert.equal(result.submissions[0].consentAccepted, true);

  const privatePage = await fetch(`${baseUrl}/dashboard/participants`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(privatePage.status, 200);
  assert.match(await privatePage.text(), /Participaciones voluntarias/);

  const publicPage = await fetch(`${baseUrl}/dashboard/participants`, { redirect: "manual" });
  assert.equal(publicPage.status, 307);
  assert.ok(publicPage.headers.get("location")?.endsWith("/dashboard"));
});

test("HTTP and connection failures do not leak service diagnostics", async () => {
  databaseFailure = true;
  const sendEvent = () => fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-telemetry-write-key-0123456789",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventName: "checkout_start", page: "/checkout" }),
  });
  const response = await sendEvent();
  const body = await response.text();
  databaseFailure = false;
  assert.equal(response.status, 503);
  assert.doesNotMatch(body, /private database diagnostic|service-role-key/i);

  databaseConnectionFailure = true;
  const connectionResponse = await sendEvent();
  const connectionBody = await connectionResponse.text();
  databaseConnectionFailure = false;
  assert.equal(connectionResponse.status, 503);
  assert.doesNotMatch(connectionBody, /private database diagnostic|service-role-key/i);
});

test("login rate limit and logout behavior are enforced", async () => {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
  }
  const limited = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" }),
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});

test("missing secrets fail closed", async () => {
  await stopApp();
  await startApp(false);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "anything" }),
  });
  assert.equal(login.status, 503);
  assert.match((await login.json()).error, /configurar/);

  const ingestion = await fetch(`${baseUrl}/api/events`, { method: "POST" });
  assert.equal(ingestion.status, 503);
});