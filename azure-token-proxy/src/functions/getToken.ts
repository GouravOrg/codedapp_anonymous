import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// ---------------------------------------------------------------------------
// In-memory token cache (per function instance)
// ---------------------------------------------------------------------------
interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix ms
}

let cachedToken: CachedToken | null = null;

const EXPIRY_BUFFER_MS = 60_000; // refresh 60s before actual expiry

async function fetchFreshToken(): Promise<CachedToken> {
  const tokenUrl = process.env.UIPATH_TOKEN_URL ?? 'https://account.uipath.com/oauth/token';
  const clientId = process.env.UIPATH_CLIENT_ID;
  const clientSecret = process.env.UIPATH_CLIENT_SECRET;
  const scope = process.env.UIPATH_SCOPE ?? 'DataFabric.Schema.Read DataFabric.Data.Write';

  if (!clientId || !clientSecret) {
    throw new Error('UIPATH_CLIENT_ID and UIPATH_CLIENT_SECRET must be set');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`UiPath token endpoint returned ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getOrRefreshToken(): Promise<CachedToken> {
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return cachedToken;
  }
  cachedToken = await fetchFreshToken();
  return cachedToken;
}

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------
function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = process.env.ALLOWED_ORIGIN ?? '*';
  // If wildcard, use it directly. Otherwise only echo back the request origin if it matches.
  const effectiveOrigin = allowed === '*' ? '*' : origin === allowed ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': effectiveOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ---------------------------------------------------------------------------
// HTTP trigger handler
// ---------------------------------------------------------------------------
async function getToken(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const origin = request.headers.get('origin') ?? undefined;
  const headers = corsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return { status: 204, headers };
  }

  try {
    const token = await getOrRefreshToken();

    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token.accessToken,
        expires_at: token.expiresAt,
      }),
    };
  } catch (err) {
    context.error('Token fetch failed:', err);
    return {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to obtain access token' }),
    };
  }
}

app.http('getToken', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'token',
  handler: getToken,
});
