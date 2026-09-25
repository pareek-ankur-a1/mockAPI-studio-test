import { useState } from 'react';
import { useToast } from '../shared/Toast.jsx';
import { api } from '../../api/client.js';
import { backendUrl } from '../../api/config.js';
import Button from '../shared/Button.jsx';

/**
 * EndpointSandbox — shows the mock URL, copy button, and a live GET tester.
 *
 * Props:
 *   prefix       : string  (e.g. "proj_8f72k")
 *   resourceName : string  (e.g. "products")
 */
export default function EndpointSandbox({ prefix, resourceName }) {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const mockUrl = backendUrl(`/api/mock/${prefix}/${resourceName}`);

  // ── Copy URL to clipboard ──────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(mockUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Clipboard access denied.');
    }
  }

  // ── Live GET request ───────────────────────────────────────────────────────
  async function handleGet() {
    setLoading(true);
    setResponse(null);
    try {
      const data = await api.mock.getAll(prefix, resourceName, 10);
      setResponse({ ok: true, data });
    } catch (err) {
      setResponse({ ok: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  // ── Clear all records ──────────────────────────────────────────────────────
  async function handleClear() {
    if (!window.confirm(`Delete ALL records from "${resourceName}"?`)) return;
    try {
      const res = await api.mock.deleteAll(prefix, resourceName);
      toast.success(res.message);
      setResponse(null);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100">
        {/* Method badge */}
        <span className="text-[10px] font-bold text-white bg-emerald-500 px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
          GET
        </span>

        {/* URL */}
        <code className="flex-1 text-xs text-gray-700 font-mono truncate">
          {mockUrl}
        </code>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleCopy}
            title="Copy URL"
            className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors font-medium"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>

          <Button size="sm" variant="primary" onClick={handleGet} loading={loading}>
            Send
          </Button>
        </div>
      </div>

      {/* Response area */}
      {response && (
        <div className="p-3">
          {response.ok ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">200 OK</span>
                  <span className="text-xs text-gray-500">
                    {response.data?.meta?.total ?? '?'} total records
                  </span>
                </div>
                <button
                  onClick={handleClear}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all records
                </button>
              </div>
              <pre className="text-xs font-mono text-gray-700 bg-gray-900 text-green-300 rounded-lg p-3 overflow-auto max-h-52 custom-scrollbar leading-relaxed">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-xs text-red-600 font-mono">{response.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Hint when no response yet */}
      {!response && !loading && (
        <p className="text-xs text-gray-400 px-3 py-2.5 text-center">
          Press <strong>Send</strong> to preview live data from your mock endpoint.
        </p>
      )}
    </div>
  );
}
