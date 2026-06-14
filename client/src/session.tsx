import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, useAsync } from './api';
import type { Employee, Scope } from './types';

export type Role = 'coordinator' | 'driver';

interface Session {
  role: Role;
  employeeId: number | null;
  employees: Employee[];
  scopes: Scope[];
  provider: string;
  setRole: (r: Role) => void;
  setEmployeeId: (id: number | null) => void;
  reloadEmployees: () => void;
  currentEmployee?: Employee;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: employees, reload: reloadEmployees } = useAsync(() => api.employees(), []);
  const { data: scopes } = useAsync(() => api.scopes(), []);
  const { data: health } = useAsync(() => api.health(), []);
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('role') as Role) || 'coordinator');
  const [employeeId, setEmployeeId] = useState<number | null>(() => {
    const v = localStorage.getItem('employeeId');
    return v ? Number(v) : null;
  });

  useEffect(() => localStorage.setItem('role', role), [role]);
  useEffect(() => {
    if (employeeId != null) localStorage.setItem('employeeId', String(employeeId));
  }, [employeeId]);

  // default the driver selection to the first field tech
  useEffect(() => {
    if (role === 'driver' && employeeId == null && employees?.length) {
      setEmployeeId(employees[0].id);
    }
  }, [role, employeeId, employees]);

  const value = useMemo<Session>(
    () => ({
      role,
      employeeId,
      employees: employees ?? [],
      scopes: scopes ?? [],
      provider: health?.travelTimeProvider ?? 'heuristic',
      setRole,
      setEmployeeId,
      reloadEmployees,
      currentEmployee: employees?.find((e) => e.id === employeeId),
    }),
    [role, employeeId, employees, scopes, health, reloadEmployees],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside provider');
  return c;
}
