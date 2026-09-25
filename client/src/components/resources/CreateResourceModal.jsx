import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import Modal from '../shared/Modal.jsx';
import Button from '../shared/Button.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../shared/Toast.jsx';

// ── Default JSON Schema template shown when the editor first opens ────────────
const DEFAULT_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', format: 'email' },
      age: { type: 'integer', minimum: 0, maximum: 120 },
      isActive: { type: 'boolean' },
      avatar: { type: 'string', format: 'uri' },
      createdAt: { type: 'string', format: 'date-time' },
    },
    required: ['name', 'email'],
    additionalProperties: false,
  },
  null,
  2
);

export default function CreateResourceModal({ isOpen, onClose, onCreated, projectId }) {
  const [resourceName, setResourceName] = useState('');
  const [schemaStr, setSchemaStr] = useState(DEFAULT_SCHEMA);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const editorRef = useRef(null);
  const { toast } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);

    if (!resourceName.trim()) {
      setErrors(['Resource name is required.']); return;
    }

    // Parse the schema JSON from the editor
    let schemaDefinition;
    try {
      schemaDefinition = JSON.parse(schemaStr);
    } catch {
      setErrors(['Schema is not valid JSON. Check the editor for syntax errors.']); return;
    }

    setLoading(true);
    try {
      const res = await api.resources.create(projectId, {
        resourceName: resourceName.trim(),
        schemaDefinition,
        description: description.trim(),
      });
      toast.success(`Resource "${res.data.resourceName}" created!`);
      onCreated(res.data);
      handleClose();
    } catch (err) {
      if (err.details) {
        setErrors(err.details.map((e) => `${e.field}: ${e.message}`));
      } else {
        setErrors([err.message]);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setResourceName(''); setSchemaStr(DEFAULT_SCHEMA);
    setDescription(''); setErrors([]);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Resource" size="xl">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          {/* Resource name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resource Name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. products, blog-posts"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">Lowercase letters, digits and hyphens only.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional note"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Monaco schema editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">
                JSON Schema Definition
              </label>
              <button
                type="button"
                onClick={() => setSchemaStr(DEFAULT_SCHEMA)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Reset to template
              </button>
            </div>

            {/* Editor wrapper */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="ml-2 text-gray-400 text-xs font-mono">schema.json</span>
              </div>
              <Editor
                height="320px"
                language="json"
                value={schemaStr}
                onChange={(val) => setSchemaStr(val ?? '')}
                theme="vs-dark"
                onMount={(editor) => { editorRef.current = editor; }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  formatOnPaste: true,
                  formatOnType: false,
                  tabSize: 2,
                  wordWrap: 'on',
                  padding: { top: 12 },
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              This schema validates every POST / PUT request to your mock endpoint. Uses{' '}
              <a href="https://json-schema.org" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                JSON Schema Draft-07
              </a>.
            </p>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 font-mono">{e}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-xl">
          <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={loading}>Create Resource</Button>
        </div>
      </form>
    </Modal>
  );
}
