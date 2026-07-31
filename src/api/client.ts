/**
 * Typed fetch client for the Yot REST API (`docs/api-spec.md`).
 *
 * Everything below `/api` needs `Authorization: Bearer <key>` except the five
 * public routes (`/health`, `/doc`, `/ui`, `/auth/pair`, `/auth/logout`). The
 * README is emphatic that native clients must use the header and never the
 * `?key=` query param — query strings leak into proxy and server logs — so
 * this module has no code path that puts a key in a URL.
 */

import {
  type ApiErrorCode,
  type ApiErrorEnvelope,
  type AskRequest,
  type AskResponse,
  type Calendar,
  type EventPatch,
  type ListEventsQuery,
  type PairRequest,
  type PairResponse,
  type Scope,
  type SessionResponse,
  type YotEvent,
  isApiErrorEnvelope,
} from './types';
import { clearSession, loadScope, loadSession, saveScope, saveSession } from './session';

/* ------------------------------------------------------------------ errors */

/** Anything the server (or the network) refused, in one throwable shape. */
export class ApiError extends Error {
  /** Envelope code, or a synthetic one: `network_error` / `timeout`. */
  readonly code: ApiErrorCode;
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number;
  /** Zod issues from a `validation_error`. */
  readonly details?: unknown[];

  constructor(code: ApiErrorCode, message: string, status = 0, details?: unknown[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    // Restores the prototype chain for `instanceof` after TS downlevelling.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** The key is missing, invalid, or revoked. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** No response at all — offline, wrong host, TLS refusal, timeout. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/* ------------------------------------------------------- injectable plumbing */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike | null = null;

/** Swap the transport (tests). Pass `null` to go back to the global `fetch`. */
export function setFetchImplementation(impl: FetchLike | null): void {
  fetchImpl = impl;
}

function currentFetch(): FetchLike {
  // Resolved per call so a test that assigns `global.fetch` is picked up.
  return fetchImpl ?? (globalThis.fetch as FetchLike);
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Register what happens when an authenticated call comes back 401 — the app
 * layer routes to onboarding. Called before the {@link ApiError} is thrown.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/** Default per-request ceiling; the health probe uses its own, shorter one. */
export const DEFAULT_TIMEOUT_MS = 15000;
/** `GET /events` rejects anything above this (§3.4). */
export const MAX_EVENT_LIMIT = 500;

/* -------------------------------------------------------- URL normalization */

const LOCAL_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::1', '[::1]']);
const LOCAL_TLDS = ['.local', '.lan', '.home', '.internal', '.localdomain'];

/** True for loopback, RFC1918, link-local, `*.local`, and bare single labels. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (LOCAL_HOSTNAMES.has(host)) return true;
  if (LOCAL_TLDS.some((tld) => host.endsWith(tld))) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^fe80:/.test(host) || /^fd/.test(host)) return true;
  // "raspberrypi", "yot-box" — a hostname with no dot can only be on the LAN.
  if (!host.includes('.') && !host.includes(':')) return true;
  return false;
}

/**
 * Turn whatever the user typed into ordered base-URL candidates.
 *
 * The onboarding field accepts a bare host (`cal.example.com`,
 * `192.168.1.10:4010`). HTTPS is always tried first — the key is a bearer
 * secret in transit — and plain HTTP is offered as a second candidate only for
 * hosts that cannot leave the local network ({@link isLocalHostname}).
 *
 * An explicit port used to be enough to add the http candidate, on the theory
 * that nobody types `:4010` for a public deployment. Plenty of people do
 * (`cal.example.com:8443`), and the cost of being wrong is the whole security
 * model: one flaky TLS probe and the very next request POSTs the pairing PIN in
 * cleartext to a public host. A user who genuinely wants plain HTTP off-LAN can
 * type the scheme, which is still honoured verbatim.
 *
 * An explicit scheme is respected verbatim: one candidate, no guessing.
 * Returns `[]` for input that cannot be a URL.
 */
export function normalizeBaseUrl(input: string): string[] {
  const raw = (input ?? '').trim();
  if (raw === '') return [];

  let scheme: string | null = null;
  let rest = raw;

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(raw);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return [];
    rest = raw.slice(schemeMatch[0].length);
  } else if (raw.includes('://')) {
    return [];
  }

  // Trailing slashes, and a trailing `/api` — the client appends that itself,
  // and pasting the address out of a browser's URL bar often includes it.
  rest = rest.replace(/\/+$/, '');
  rest = rest.replace(/\/api$/i, '');
  rest = rest.replace(/\/+$/, '');
  if (rest === '' || /\s/.test(rest)) return [];

  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '' : rest.slice(slash);
  if (authority === '') return [];

  // `[::1]:4010` vs `host:4010` vs bare IPv6 `::1`. Only the hostname matters —
  // the port is stripped so `isLocalHostname` sees the host on its own.
  let hostname = authority;
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority);
  if (bracketed) {
    hostname = bracketed[1];
  } else {
    const withPort = /^([^:]+):(\d+)$/.exec(authority);
    if (withPort) hostname = withPort[1];
  }
  if (hostname === '') return [];
  if (!bracketed && /[^A-Za-z0-9._:-]/.test(hostname)) return [];

  const base = `${authority}${path}`;
  if (scheme) return [`${scheme}://${base}`];

  const candidates = [`https://${base}`];
  if (isLocalHostname(hostname)) candidates.push(`http://${base}`);
  return candidates;
}

/* ------------------------------------------------------------- low-level IO */

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Bearer key. `undefined` -> take it from the stored session. */
  key?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Skip the 401 handler (public routes, and logout, which expects 401s). */
  skipUnauthorizedHandler?: boolean;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text().catch(() => '');
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFromBody(status: number, body: unknown): ApiError {
  if (isApiErrorEnvelope(body)) {
    const { code, message, details } = (body as ApiErrorEnvelope).error;
    return new ApiError(code, message || `Request failed (${status})`, status, details);
  }
  if (typeof body === 'string' && body.trim() !== '') {
    return new ApiError('http_error', body.slice(0, 200), status);
  }
  return new ApiError('http_error', `Request failed (${status})`, status);
}

/**
 * One HTTP round-trip against an explicit base URL, with the error envelope
 * already unwrapped. `T` is trusted, not validated — the server owns the
 * schema and a runtime validator here would only duplicate it.
 */
async function requestAt<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, key, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await currentFetch()(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    const aborted = controller.signal.aborted;
    throw new ApiError(
      aborted ? 'timeout' : 'network_error',
      aborted
        ? `Request timed out after ${timeoutMs}ms`
        : cause instanceof Error && cause.message
          ? cause.message
          : 'Network request failed',
      0,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  const parsed = await readBody(response);

  if (!response.ok) {
    const error = errorFromBody(response.status, parsed);
    if (error.status === 401 && !options.skipUnauthorizedHandler) onUnauthorized?.();
    throw error;
  }

  return parsed as T;
}

/** Same as {@link requestAt}, but resolves the base URL and key from storage. */
async function authed<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = await loadSession();
  if (!session) {
    const error = new ApiError('unauthorized', 'Not paired with a server', 401);
    if (!options.skipUnauthorizedHandler) onUnauthorized?.();
    throw error;
  }
  return requestAt<T>(session.baseUrl, path, { ...options, key: session.key });
}

/** Authenticated streaming request used by endpoints that return SSE. */
async function authedStream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const session = await loadSession();
  if (!session) {
    const error = new ApiError('unauthorized', 'Not paired with a server', 401);
    onUnauthorized?.();
    throw error;
  }

  // Streaming requests may spend an unbounded amount of time in Hermes MCP
  // tools before the first token. Do not impose a client-side deadline.
  const controller = new AbortController();
  let response: Response;
  try {
    response = await currentFetch()(`${session.baseUrl}/api${path}`, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: 'Bearer ' + session.key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    throw new ApiError(
      controller.signal.aborted ? 'timeout' : 'network_error',
      controller.signal.aborted
        ? `Request timed out after ${timeoutMs}ms`
        : cause instanceof Error && cause.message
          ? cause.message
          : 'Network request failed',
      0,
    );
  }

  if (!response.ok) {
    const error = errorFromBody(response.status, await readBody(response));
    if (error.status === 401) onUnauthorized?.();
    throw error;
  }
  if (!response.body) throw new ApiError('http_error', 'Streaming response has no body', 200);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const event = JSON.parse(data) as unknown;
      if (typeof event === 'object' && event !== null && !Array.isArray(event)) {
        onEvent(event as Record<string, unknown>);
      }
    } catch {
      throw new ApiError('http_error', 'Invalid streaming response', 200);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer) consume(buffer);
  } finally {
    // Release the reader when the stream ends; there is intentionally no timer.
    reader.releaseLock();
  }
}

/* ------------------------------------------------------------ health & pair */

export type ProbeResult =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: 'unreachable' | 'invalid_url' };

/**
 * Try each candidate from {@link normalizeBaseUrl} against `GET /api/health`
 * and return the first that answers. `timeoutMs` is per candidate, so a bare
 * LAN host costs at most 2× it before reporting `unreachable`.
 */
export async function probeHealth(
  input: string,
  { timeoutMs = 4000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ProbeResult> {
  const candidates = normalizeBaseUrl(input);
  if (candidates.length === 0) return { ok: false, reason: 'invalid_url' };

  for (const baseUrl of candidates) {
    if (signal?.aborted) break;
    try {
      // A 200 with any body is enough; some proxies rewrite `{status:"ok"}`.
      await requestAt<unknown>(baseUrl, '/health', { timeoutMs, signal });
      return { ok: true, baseUrl };
    } catch {
      // `/health` is public, so a non-2xx answer means this address is not a
      // Yot server (a proxy, a router admin page) — same as unreachable for
      // onboarding's purposes. Fall through to the next candidate.
      continue;
    }
  }

  return { ok: false, reason: 'unreachable' };
}

export type PairFailureReason =
  | 'invalid_pin'
  | 'rate_limited'
  | 'unreachable'
  | 'no_key'
  | 'server_error';

export type PairResult =
  | { ok: true; scope: Scope; key: string }
  | { ok: false; reason: PairFailureReason; message: string };

/**
 * Redeem a 6-digit PIN for an API key. Returns a result union rather than
 * throwing: onboarding has to render "wrong PIN" and "too many attempts"
 * differently, and both are expected outcomes, not exceptions.
 *
 * Does not persist anything — call {@link saveSession} (or use
 * {@link completePairing}) once the caller is happy with the scope.
 */
export async function pair(
  baseUrl: string,
  pin: string,
  deviceName?: string,
): Promise<PairResult> {
  const body: PairRequest = { pin, client: 'native' };
  if (deviceName) body.device_name = deviceName.slice(0, 64);

  try {
    const response = await requestAt<PairResponse>(baseUrl, '/auth/pair', {
      method: 'POST',
      body,
      skipUnauthorizedHandler: true,
    });

    if (!response?.key) {
      return {
        ok: false,
        reason: 'no_key',
        message: 'Server did not return an API key for this device.',
      };
    }
    return { ok: true, scope: response.scope ?? 'write', key: response.key };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) {
      return { ok: false, reason: 'invalid_pin', message: 'That PIN is invalid or expired.' };
    }
    if (error.status === 429) {
      return { ok: false, reason: 'rate_limited', message: 'Too many attempts. Try again shortly.' };
    }
    if (error.isNetwork) {
      return { ok: false, reason: 'unreachable', message: "Couldn't reach the server." };
    }
    return { ok: false, reason: 'server_error', message: error.message };
  }
}

/**
 * {@link pair}, then persist the session on success — **including the scope**,
 * which the pair response carries and which nothing else can recover offline.
 * A `read` key must not be offered Edit/Delete, and finding that out from a 403
 * after the user has typed an edit is not good enough.
 */
export async function completePairing(
  baseUrl: string,
  pin: string,
  deviceName?: string,
): Promise<PairResult> {
  const result = await pair(baseUrl, pin, deviceName);
  if (result.ok) await saveSession({ baseUrl, key: result.key, scope: result.scope });
  return result;
}

/**
 * Revoke this device's key server-side, then drop it locally. The local clear
 * happens even if the request fails — the user asked to disconnect, and a
 * key we can no longer reach is not worth keeping.
 */
export async function logout(): Promise<void> {
  const session = await loadSession();
  if (session) {
    try {
      await requestAt<{ ok: true }>(session.baseUrl, '/auth/logout', {
        method: 'POST',
        key: session.key,
        timeoutMs: 5000,
        skipUnauthorizedHandler: true,
      });
    } catch {
      // Best effort.
    }
  }
  await clearSession();
}

/* ------------------------------------------------------- response validation */

/**
 * A 200 whose body is not the shape the endpoint promises.
 *
 * `requestAt` trusts `T` because the server owns the schema — but "the server"
 * is not always who answered. A captive portal, a corporate proxy or a
 * misconfigured reverse proxy happily returns `200 text/html`, and
 * {@link readBody} hands that back as a plain string. Left unchecked it flowed
 * all the way into the store: `listAllEvents` saw a non-array, broke its paging
 * loop, returned `[]`, and `sync()` accepted the emptiness as the truth for the
 * whole window and *persisted* it — a login page silently wiped the cache.
 *
 * So collection and record payloads are shape-checked at the edge and a bad one
 * throws like any other failure. The status is the real 200, which keeps it out
 * of the 401 and `isNetwork` paths.
 */
const BAD_PAYLOAD_MESSAGE =
  'The server returned an unexpected response. Check the address, or whether a proxy or captive portal is in the way.';

function expectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new ApiError('http_error', BAD_PAYLOAD_MESSAGE, 200);
  return value as T[];
}

function expectRecord<T>(value: unknown): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('http_error', BAD_PAYLOAD_MESSAGE, 200);
  }
  return value as T;
}

/* ---------------------------------------------------------------- resources */

/** Raw `GET /api/auth/session`. Prefer {@link refreshScope}. */
export async function getSessionScope(): Promise<SessionResponse> {
  return expectRecord<SessionResponse>(await authed<unknown>('/auth/session'));
}

/**
 * Re-read the key's scope from the server and persist it, so a key downgraded
 * after pairing stops showing edit affordances on the next launch. Falls back to
 * the stored value when the server cannot be reached — this is a refinement of
 * what pairing already told us, never a gate on using the app.
 */
export async function refreshScope(): Promise<Scope> {
  try {
    const { scope } = await getSessionScope();
    const next: Scope = scope === 'read' ? 'read' : 'write';
    await saveScope(next);
    return next;
  } catch {
    return loadScope();
  }
}

export async function listCalendars(): Promise<Calendar[]> {
  return expectArray<Calendar>(await authed<unknown>('/calendars'));
}

function buildQuery(query: ListEventsQuery): string {
  const params: string[] = [];
  const push = (k: string, v: string | number | undefined) => {
    if (v === undefined || v === '') return;
    params.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  push('from', query.from);
  push('to', query.to);
  push('calendarId', query.calendarId);
  push('tag', query.tag);
  push('q', query.q);
  if (query.limit !== undefined) {
    push('limit', Math.max(1, Math.min(MAX_EVENT_LIMIT, Math.trunc(query.limit))));
  }
  if (query.offset !== undefined) push('offset', Math.max(0, Math.trunc(query.offset)));
  return params.length ? `?${params.join('&')}` : '';
}

/**
 * One page of events. `from`/`to` bound `start_at` inclusively and must be ISO
 * strings; `limit` is clamped to 1–500 (the server 400s outside that) and
 * defaults to the maximum, since the server's own default of 50 would silently
 * truncate a month view.
 */
export async function listEvents(query: ListEventsQuery = {}): Promise<YotEvent[]> {
  const limit = query.limit ?? MAX_EVENT_LIMIT;
  return expectArray<YotEvent>(await authed<unknown>(`/events${buildQuery({ ...query, limit })}`));
}

/**
 * Every event in the range, following `offset` until the server returns a
 * short page. `maxPages` stops a pathological range from paging forever.
 */
export async function listAllEvents(
  query: ListEventsQuery = {},
  { maxPages = 20 }: { maxPages?: number } = {},
): Promise<YotEvent[]> {
  const pageSize = Math.max(1, Math.min(MAX_EVENT_LIMIT, query.limit ?? MAX_EVENT_LIMIT));
  const all: YotEvent[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    // A non-array page now throws inside `listEvents` rather than reaching here
    // and being mistaken for "the range is empty".
    const chunk = await listEvents({ ...query, limit: pageSize, offset: page * pageSize });
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return all;
}

export async function getEvent(id: string): Promise<YotEvent> {
  return expectRecord<YotEvent>(await authed<unknown>(`/events/${encodeURIComponent(id)}`));
}

/**
 * PATCH semantics per §3.4: omitted fields are untouched, and the nullable
 * ones (`description`, `context`, `location`, `url`, `image_path`) are cleared
 * by an explicit `null`. So `undefined` is stripped from the body while `null`
 * is preserved — do not collapse the two.
 */
export async function updateEvent(id: string, patch: EventPatch): Promise<YotEvent> {
  const body: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) body[field] = value;
  }
  return expectRecord<YotEvent>(
    await authed<unknown>(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  );
}

/** 204 on success; a missing event is a 404 `ApiError`. */
export async function deleteEvent(id: string): Promise<void> {
  await authed<void>(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* --------------------------------------------------------------- ask (AI) */

/**
 * POST /api/ask. Sends a natural-language query to the yot-server, which
 * proxies to Hermes API Server. The server handles all calendar context via
 * yot MCP tools.
 *
 * The streaming variant below has no client-side deadline because Hermes may
 * spend an unbounded amount of time invoking MCP tools before its first token.
 */
export async function ask(
  query: string,
  context?: string,
  model?: string,
): Promise<AskResponse> {
  const body: AskRequest = { query };
  if (context) body.context = context;
  if (model) body.model = model;
  return expectRecord<AskResponse>(
    await authed<unknown>('/ask', { method: 'POST', body, timeoutMs: 120_000 }),
  );
}

/** POST /api/ask as Server-Sent Events, delivering each text delta immediately. */
export async function askStream(
  query: string,
  context: string | undefined,
  model: string | undefined,
  onText: (text: string) => void,
): Promise<AskResponse> {
  const body: AskRequest = { query };
  if (context) body.context = context;
  if (model) body.model = model;

  let answer = '';
  let finalResponse: AskResponse | undefined;
  await authedStream('/ask', body, (event) => {
    if (event.type === 'delta' && typeof event.text === 'string') {
      answer += event.text;
      onText(event.text);
    } else if (event.type === 'done') {
      const response = (event.response ?? event) as Partial<AskResponse>;
      if (typeof response.answer === 'string') answer = response.answer;
      if (typeof response.model === 'string') {
        finalResponse = { ...response, answer } as AskResponse;
      }
    } else if (event.type === 'error') {
      throw new ApiError(
        'http_error',
        typeof event.message === 'string' ? event.message : 'Streaming request failed',
        200,
      );
    }
  });

  if (!finalResponse) {
    throw new ApiError('http_error', 'Streaming response ended before completion', 200);
  }
  return finalResponse;
}

/** Response shape for GET /api/ask/models. */
export interface AskModelsResponse {
  models: string[];
  default: string;
}

/** GET /api/ask/models. Returns the server's allowed model list. */
export async function listAskModels(): Promise<AskModelsResponse> {
  return expectRecord<AskModelsResponse>(
    await authed<unknown>('/ask/models', { method: 'GET' }),
  );
}

/* -------------------------------------------------------------- images/misc */

/** Absolute URL for a stored cover image (`Event.image_path`). */
export function imageUrl(baseUrl: string, imagePath: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/img/${encodeURIComponent(imagePath)}`;
}

/**
 * Bearer headers for components that fetch bytes themselves (expo-image).
 * Returns `{}` when there is no key, so it can be spread unconditionally.
 */
export function authHeaders(key: string): Record<string, string>;
export function authHeaders(key?: string | null): Record<string, string>;
export function authHeaders(key?: string | null): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * Ready-made `expo-image` source for an event cover: the URL plus the Bearer
 * header. Never `?key=` — see the README's native-client guidance.
 */
export function imageSource(
  baseUrl: string,
  imagePath: string,
  key?: string | null,
): { uri: string; headers: Record<string, string> } {
  return { uri: imageUrl(baseUrl, imagePath), headers: authHeaders(key) };
}

/** The stored base URL, or `null` when the app is not paired. */
export async function getBaseUrl(): Promise<string | null> {
  const session = await loadSession();
  return session?.baseUrl ?? null;
}
