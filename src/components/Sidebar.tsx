// apps/web/src/components/Sidebar.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();

  // Do not render employee sidebar for Admin or on /admin routes
  if (user?.role === 'ADMIN' || pathname.startsWith('/admin')) {
    return null;
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleLogout = () => { logout(); router.replace('/login'); };

  const employeeNav = [
    { href: '/dashboard', icon: '⏱', label: 'Clock In/Out' },
    { href: '/timesheet', icon: '📋', label: 'Timesheet' },
    { href: '/salary',    icon: '💰', label: 'Salary' },
  ];

  return (
    <>
      {/* Desktop Sidebar for Employees */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Image src="/calcicore.png" alt="Calicore" width={34} height={34} style={{ objectFit: 'contain' }} />
          </div>
          <span className="sidebar-brand-name">Calicore</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {employeeNav.map(n => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-item${pathname === n.href ? ' active' : ''}`}
            >
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name ?? 'User'}
              </div>
              <div className="user-role">{user?.role?.toLowerCase()}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Sign out">⎋</button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-nav">
        <div className="mobile-nav-items">
          {employeeNav.map(n => (
            <Link
              key={n.href}
              href={n.href}
              className={`mobile-nav-item${pathname === n.href ? ' active' : ''}`}
            >
              <span className="mobile-nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
