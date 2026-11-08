import { Outlet, Navigate, NavLink, useNavigate } from 'react-router-dom';

export default function App() {
  const authed = !!localStorage.getItem('cs_token');
  const navigate = useNavigate();
  if (!authed) return <Navigate to="/login" replace />;

  const logout = () => {
    localStorage.removeItem('cs_token');
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">🛡️</span> CodeSentinel<span className="accent">AI</span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            📊 Overview
          </NavLink>
        </nav>
        <button className="btn ghost logout" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
