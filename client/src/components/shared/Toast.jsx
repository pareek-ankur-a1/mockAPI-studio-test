import { createContext, useCallback, useContext, useState } from 'react';

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

/**
 * useToast — hook to trigger toasts from anywhere in the component tree.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('Project created!');
 *   toast.error('Something went wrong.');
 */
export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto-dismiss after 3.5 seconds
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Toast Item ───────────────────────────────────────────────────────────────

const STYLES = {
  success: 'bg-gray-900 border-green-500 text-green-400',
  error: 'bg-gray-900 border-red-500 text-red-400',
  info: 'bg-gray-900 border-blue-500 text-blue-400',
};

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

function ToastItem({ toast, onDismiss }) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border-l-4 shadow-xl animate-slide-up min-w-[260px] max-w-sm ${STYLES[toast.type]}`}
    >
      <span className="font-bold text-sm flex-shrink-0">{ICONS[toast.type]}</span>
      <p className="text-white text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 text-xs"
      >
        ✕
      </button>
    </div>
  );
}
