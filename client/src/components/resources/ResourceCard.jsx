import { useState } from 'react';
import Button from '../shared/Button.jsx';
import Modal from '../shared/Modal.jsx';
import EndpointSandbox from '../sandbox/EndpointSandbox.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../shared/Toast.jsx';

/**
 * ResourceCard — one card per resource shown on the ProjectPage.
 *
 * Shows:
 *  - Resource name + record count badge
 *  - Schema properties summary (first 4 properties)
 *  - Endpoint Sandbox (URL + copy + live GET)
 *  - Seed button (opens inline seed panel)
 *  - Delete button
 */
export default function ResourceCard({ resource, projectPrefix, onDeleted }) {
  const [showSeed, setShowSeed] = useState(false);
  const [seedCount, setSeedCount] = useState(10);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [recordCount, setRecordCount] = useState(resource.recordCount ?? 0);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  // ── Schema preview ─────────────────────────────────────────────────────────
  const properties = Object.entries(
    resource.schemaDefinition?.properties ?? {}
  ).slice(0, 5);

  const typeColor = {
    string: 'bg-blue-100 text-blue-700',
    number: 'bg-amber-100 text-amber-700',
    integer: 'bg-amber-100 text-amber-700',
    boolean: 'bg-purple-100 text-purple-700',
    object: 'bg-green-100 text-green-700',
    array: 'bg-rose-100 text-rose-700',
  };

  // ── Seed handler ───────────────────────────────────────────────────────────
  async function handleSeed() {
    if (seedCount < 1 || seedCount > 500) {
      toast.error('Count must be between 1 and 500.'); return;
    }
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await api.seed(resource._id, Number(seedCount));
      setSeedResult(res);
      setRecordCount((c) => c + res.stats.inserted);
      toast.success(`Seeded ${res.stats.inserted} records into "${resource.resourceName}".`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm(`Delete resource "${resource.resourceName}" and ALL its data?`)) return;
    setDeleting(true);
    try {
      await api.resources.delete(resource._id);
      toast.success(`Resource "${resource.resourceName}" deleted.`);
      onDeleted(resource._id);
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      {/* Card header */}
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 font-mono text-sm">
                /{resource.resourceName}
              </h3>
              <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {recordCount} records
              </span>
              {resource.isSeeded && (
                <span className="text-[10px] font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                  seeded
                </span>
              )}
            </div>
            {resource.description && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{resource.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant="secondary" onClick={() => setShowSeed((v) => !v)}>
              {showSeed ? '▲ Seed' : '⚡ Seed'}
            </Button>
            <Button size="sm" variant="danger" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Schema preview pills */}
      {properties.length > 0 && (
        <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-gray-50">
          {properties.map(([key, def]) => {
            const type = def.type ?? 'any';
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${typeColor[type] ?? 'bg-gray-100 text-gray-600'}`}
              >
                <span className="font-mono">{key}</span>
                <span className="opacity-60">:{type}</span>
                {def.format && <span className="opacity-60 italic">&nbsp;({def.format})</span>}
              </span>
            );
          })}
          {Object.keys(resource.schemaDefinition?.properties ?? {}).length > 5 && (
            <span className="text-[10px] text-gray-400 self-center">
              +{Object.keys(resource.schemaDefinition.properties).length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Seed panel */}
      {showSeed && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-medium text-amber-800 mb-2">
            ⚡ Seed fake data using Faker.js
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1} max={500}
              value={seedCount}
              onChange={(e) => setSeedCount(e.target.value)}
              className="w-20 border border-amber-200 bg-white rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-xs text-amber-700">records</span>
            <Button size="sm" variant="primary" loading={seeding} onClick={handleSeed}>
              Generate
            </Button>
          </div>

          {/* Seed preview */}
          {seedResult && (
            <div className="mt-3">
              <p className="text-xs text-amber-700 mb-1.5 font-medium">
                ✓ Inserted {seedResult.stats.inserted} records in {seedResult.stats.elapsedMs}ms — Preview:
              </p>
              <pre className="text-[10px] font-mono bg-gray-900 text-green-300 rounded-lg p-2.5 overflow-auto max-h-36 custom-scrollbar leading-relaxed">
                {JSON.stringify(seedResult.preview, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Endpoint Sandbox */}
      <div className="p-4">
        <EndpointSandbox prefix={projectPrefix} resourceName={resource.resourceName} />
      </div>
    </div>
  );
}
