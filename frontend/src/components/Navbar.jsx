// frontend/src/components/Navbar.jsx
// App navigation header

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authState';
import { Layers, User, LogOut, ArrowRightLeft } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="nav-brand">
          <div className="nav-brand-icon">
            <ArrowRightLeft size={18} strokeWidth={2.5} />
          </div>
          <span>SettleUp<span style={{ color: 'var(--accent)' }}>Expenses</span></span>
        </Link>

        {user ? (
          <nav className="nav-menu">
            <Link
              to="/dashboard"
              className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
            >
              <Layers size={17} />
              <span>Groups</span>
            </Link>

            <Link
              to="/profile"
              className={`nav-link ${location.pathname === '/profile' ? 'active' : ''}`}
            >
              <User size={17} />
              <span>{user.name}</span>
            </Link>

            <button
              onClick={handleLogout}
              className="btn btn-outline btn-sm"
              title="Logout"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </nav>
        ) : (
          <nav className="nav-menu">
            <Link to="/login" className="btn btn-secondary btn-sm">
              Log in
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm">
              Sign up
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
