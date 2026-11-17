import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { backendUrl } from '../../api/config.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  // Avatar initials from user's name
  const initials = user?.name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-500 text-white font-bold text-sm">
            M
          </span>
          <span className="text-white font-semibold text-sm tracking-wide">
            MockAPI <span className="text-brand-500">Studio</span>
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <a
            href={backendUrl('/health')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-green-400 transition-colors flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            API Health
          </a>

          {/* User menu */}
          {user && (
            <div className="flex items-center gap-3">
              {/* Avatar + name */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-medium text-white leading-tight">{user.name}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{user.email}</p>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-gray-800 border border-gray-700"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
