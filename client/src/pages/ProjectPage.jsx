import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { backendUrl } from '../api/config.js';
import Button from '../components/shared/Button.jsx';
import ResourceCard from '../components/resources/ResourceCard.jsx';
import CreateResourceModal from '../components/resources/CreateResourceModal.jsx';
import { useToast } from '../components/shared/Toast.jsx';

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // ── Fetch project + resources ──────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [projRes, resRes] = await Promise.all([
          api.projects.get(projectId),
          api.resources.list(projectId),
        ]);
        setProject(projRes.data);
        setResources(resRes.data ?? []);
      } catch (err) {
        toast.error(err.message);
        if (err.status === 404) navigate('/', { replace: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  function handleCreated(resource) {
    setResources((prev) => [resource, ...prev]);
  }

  function handleDeleted(resourceId) {
    setResources((prev) => prev.filter((r) => r._id !== resourceId));
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
        <div className="h-4 bg-gray-100 rounded w-72 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 mt-8">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <Link to="/" className="text-sm text-gray-400 hover:text-brand-600 transition-colors flex items-center gap-1 mb-6 w-fit">
        ← All Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
            <code className="text-xs bg-gray-900 text-green-400 px-3 py-1 rounded-full font-mono border border-gray-700">
              {project?.prefix}
            </code>
          </div>
          {project?.description && (
            <p className="text-sm text-gray-500 mt-1">{project.description}</p>
          )}

          {/* Base URL hint */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Base URL:</span>
            <code className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-mono border border-gray-200">
              {backendUrl(`/api/mock/${project?.prefix}/`)}
              <span className="text-brand-600">{'{'}resource{'}'}</span>
            </code>
          </div>
        </div>

        <Button variant="primary" size="lg" onClick={() => setShowCreate(true)} className="flex-shrink-0">
          + New Resource
        </Button>
      </div>

      {/* Resources */}
      {resources.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
          <span className="text-4xl mb-3 block">📦</span>
          <h2 className="text-base font-semibold text-gray-800 mb-1">No resources yet</h2>
          <p className="text-sm text-gray-500 mb-5">
            Create a resource with a JSON Schema to start mocking an endpoint.
          </p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Create your first resource
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resource count summary */}
          <p className="text-sm text-gray-500">
            {resources.length} resource{resources.length !== 1 ? 's' : ''} · {' '}
            {resources.reduce((acc, r) => acc + (r.recordCount ?? 0), 0)} total records
          </p>

          {resources.map((resource) => (
            <ResourceCard
              key={resource._id}
              resource={resource}
              projectPrefix={project?.prefix}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Create resource modal */}
      <CreateResourceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        projectId={projectId}
      />
    </div>
  );
}
