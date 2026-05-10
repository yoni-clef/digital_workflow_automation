import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useDashboard } from '../contexts/DashboardContext';
import { getMainNavItems } from '../constants/navigation';
import Toast from '../components/Toast';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { toast, dismissToast } = useDashboard();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = getMainNavItems(user);

  return (
    <>
      <div
        className={`app-wrapper${mobileNavOpen ? ' sidebar-mobile-open' : ''}`}
      >
        <header className="topbar">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
          <NavLink to="/app/my-requests" className="topbar-brand" onClick={() => setMobileNavOpen(false)} end>
            <span className="brand-icon">W</span>
            <span>Workflow</span>
          </NavLink>
          <div className="topbar-right">
            <div className="user-chip">
              <span className="user-avatar" aria-hidden>
                {(user.displayName || '?').slice(0, 1).toUpperCase()}
              </span>
              <span>
                {user.displayName}
                <span className="text-[var(--text-3)] ml-1">· {user.role}</span>
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <aside className="sidebar" aria-label="Main navigation">
          <div className="nav-label">Navigate</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon className="nav-icon shrink-0" aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
        </aside>

        {mobileNavOpen ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close navigation menu"
            tabIndex={-1}
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
    </>
  );
}
