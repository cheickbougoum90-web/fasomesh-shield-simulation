import { useMemo } from 'react';
import type { PermissionAction } from '../domain/permissions';
import { can } from '../domain/permissions';
import { useApp } from './store';

/** Permission de l'utilisateur courant (mémoïsée pour éviter les rendus inutiles). */
export function usePermission(action: PermissionAction): boolean {
  const users = useApp((s) => s.users);
  const currentUserId = useApp((s) => s.currentUserId);
  const me = useMemo(() => users.find((u) => u.id === currentUserId), [users, currentUserId]);
  return can(me?.role, action);
}

export function useCurrentUser() {
  const users = useApp((s) => s.users);
  const currentUserId = useApp((s) => s.currentUserId);
  return useMemo(() => users.find((u) => u.id === currentUserId) ?? null, [users, currentUserId]);
}
