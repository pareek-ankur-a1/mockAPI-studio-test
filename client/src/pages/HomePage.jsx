import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import Button from '../components/shared/Button.jsx';
import CreateProjectModal from '../components/projects/CreateProjectModal.jsx';
import { useToast } from '../components/shared/Toast.jsx';

export default function HomePage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    api.projects.list()
      .then((res) => setProjects(res.data ?? []))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(project) {
    setProjects((prev) => [project, ...prev]);
  }

  async function handleDelete(e, projectId, projectName) {
    e.stopPropagation(); // Don't navigate to project page
    if (!window.confirm(`Delete project "${projectName}" and ALL its resources?`)) return;
    try {
      await api.projects.delete(projectId);
      setProjects((prev) => prev.filter((p) => p._id !== projectId));
      toast.success(`Project "${projectName}" deleted.`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each project gets a unique URL prefix for its mock endpoints.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setShowCreate(true)}>
          + New Project
        </Button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚀</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">No projects yet</h2>
          <p className="text-sm text-gray-500 mb-6">Create your first project to get a mock API URL in seconds.</p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>Create your first project</Button>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project._id}
              onClick={() => navigate(`/projects/${project._id}`)}
              className="group bg-white border border-gray-100 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-brand-200 transition-all"
            >
              {/* Project header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors truncate">
                    {project.name}
                  </h2>
                  {project.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{project.description}</p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(e, project._id, project.name)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Prefix badge */}
              <div className="mt-3">
                <code className="text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md font-mono border border-gray-200">
                  {project.prefix}
                </code>
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {new Date(project.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
                <span className="text-xs font-medium text-brand-600 group-hover:text-brand-700">
                  Open →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateProjectModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
