import { Inbox, LayoutList, Shield, Users, UserPlus, GitPullRequest } from 'lucide-react';

/** @typedef {{ to: string, label: string, icon: import('react').ComponentType<{className?: string}>, adminOnly?: boolean, showIfNoManager?: boolean }} NavItem */

/** @param {{ role: string, managerId?: string | null }} user */
export function getMainNavItems(user) {
  /** @type {NavItem[]} */
  const items = [
    { to: '/app/my-requests', label: 'My Requests', icon: LayoutList },
    { to: '/app/inbox', label: 'Inbox', icon: Inbox },
  ];

  if (user?.role === 'ADMIN') {
    items.push(
      { to: '/app/admin', label: 'Admin overview', icon: Shield },
      { to: '/app/admin/users', label: 'User management', icon: Users },
      { to: '/app/admin/manager-requests', label: 'Manager requests', icon: GitPullRequest }
    );
  }

  if (user && !user.managerId) {
    items.push({ to: '/app/request-manager', label: 'Request manager', icon: UserPlus, showIfNoManager: true });
  }

  return items;
}
