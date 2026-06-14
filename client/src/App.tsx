import { NavLink, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { Dashboard } from './pages/Dashboard';
import { DriverDay } from './pages/DriverDay';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Team } from './pages/Team';

export default function App() {
  return (
    <SessionProvider>
      <div className="flex min-h-full flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-day" element={<DriverDay />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/team" element={<Team />} />
          </Routes>
        </main>
      </div>
    </SessionProvider>
  );
}

function TopBar() {
  const { role, setRole, employees, employeeId, setEmployeeId, provider } = useSession();
  return (
    <header className="sticky top-0 z-[500] border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            DF
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Dee Field Scheduler</div>
            <div className="text-[11px] text-slate-400">Measure & install routing</div>
          </div>
        </div>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          <NavTab to="/" label="Schedule" />
          <NavTab to="/my-day" label="My Day" />
          <NavTab to="/projects" label="Projects" />
          <NavTab to="/team" label="Team" />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`hidden rounded-full px-2 py-0.5 text-xs sm:inline ${
              provider === 'google' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
            title={
              provider === 'google'
                ? 'Live traffic-aware drive times via Google Maps'
                : 'Estimated drive times — add a Google Maps key for live traffic'
            }
          >
            {provider === 'google' ? '🟢 Google traffic' : '◷ Estimated times'}
          </span>

          <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button
              onClick={() => setRole('coordinator')}
              className={`rounded-md px-3 py-1 ${role === 'coordinator' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
            >
              Coordinator
            </button>
            <button
              onClick={() => setRole('driver')}
              className={`rounded-md px-3 py-1 ${role === 'driver' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
            >
              Driver
            </button>
          </div>

          {role === 'driver' && (
            <select
              value={employeeId ?? ''}
              onChange={(e) => setEmployeeId(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </header>
  );
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 font-medium ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`
      }
    >
      {label}
    </NavLink>
  );
}
