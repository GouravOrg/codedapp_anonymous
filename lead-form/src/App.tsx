import { useMemo, useState, useEffect, useRef } from 'react';
import { UiPath } from '@uipath/uipath-typescript/core';
import { Entities } from '@uipath/uipath-typescript/entities';

// SDK instance with connection info only — no auth credentials.
// Token is injected asynchronously via sdk.updateToken() before the form renders.
const sdk = new UiPath({
  orgName: import.meta.env.VITE_UIPATH_ORG_NAME,
  tenantName: import.meta.env.VITE_UIPATH_TENANT_NAME,
  baseUrl: import.meta.env.VITE_UIPATH_BASE_URL,
});

const ENTITY_ID = import.meta.env.VITE_CONTACT_ENTITY_ID as string;
const TOKEN_URL = import.meta.env.VITE_AZURE_TOKEN_URL as string;

type AppState = 'loading' | 'ready' | 'error';
type FormState = 'idle' | 'submitting' | 'success' | 'error';

function LeadForm() {
  const entities = useMemo(() => new Entities(sdk), []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('submitting');
    setErrorMsg('');
    try {
      await entities.insertRecordById(ENTITY_ID, { name, email, phone });
      setFormState('success');
      setName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed');
      setFormState('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">Contact Information</h1>
        <p className="text-sm text-gray-500 mb-6">Fill in your details below.</p>

        {formState === 'success' && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Your information has been submitted successfully.
          </div>
        )}
        {formState === 'error' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={formState === 'submitting'}
            className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {formState === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [tokenError, setTokenError] = useState('');
  const didFetch = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (didFetch.current) return;
    didFetch.current = true;

    if (!TOKEN_URL) {
      setTokenError('VITE_AZURE_TOKEN_URL is not configured');
      setAppState('error');
      return;
    }

    (async () => {
      try {
        const res = await fetch(TOKEN_URL);
        if (!res.ok) throw new Error(`Token proxy returned HTTP ${res.status}`);

        const data = (await res.json()) as {
          access_token: string;
          expires_at?: number;  // absolute Unix ms (our proxy format)
          expires_in?: number;  // seconds from now (standard OAuth format)
        };

        // Support both absolute (expires_at) and relative (expires_in) expiry
        const expiresAt = data.expires_at
          ? new Date(data.expires_at)
          : data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined;

        sdk.updateToken({
          token: data.access_token,
          type: 'oauth',
          expiresAt,
        });

        setAppState('ready');
      } catch (err) {
        setTokenError(err instanceof Error ? err.message : 'Unknown error fetching token');
        setAppState('error');
      }
    })();
  }, []);

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <p className="font-medium mb-1">Unable to initialize form</p>
          <p>{tokenError}</p>
        </div>
      </div>
    );
  }

  return <LeadForm />;
}

export default App;
