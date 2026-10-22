import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, FileBarChart2, LineChart, Users, Sliders, HeartPulse, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { ROUTES, buildPath } from '@/constants/routes';

// Launcher for the AI Copilot pages that don't fit inside the floating chat itself
// (Root Cause View, Executive Report, Forecast Dashboard, Resource Recommendations,
// What-If Simulator, Project Health Card, Employee AI Profile). Lives inside the chat
// panel rather than the sidebar — see routes/index.jsx for why these routes are ungated.
const STATIC_TILES = [
  { to: ROUTES.AI_ROOT_CAUSE, icon: AlertCircle, label: 'Root Cause View', description: 'Why is this happening?' },
  { to: ROUTES.AI_EXECUTIVE_REPORT, icon: FileBarChart2, label: 'Executive Report', description: 'Revenue, cost, risks & export' },
  { to: ROUTES.AI_FORECAST, icon: LineChart, label: 'Forecast Dashboard', description: '30/60/90-day projections' },
  { to: ROUTES.AI_RECOMMENDATIONS, icon: Users, label: 'Resource Recommendations', description: 'Who to staff next' },
  { to: ROUTES.AI_WHAT_IF, icon: Sliders, label: 'What-If Simulator', description: 'Model staffing & budget changes' },
  { to: ROUTES.AI_PROJECT_HEALTH, icon: HeartPulse, label: 'Project Health Card', description: 'Budget, timeline & risk score' },
];

const AICopilotHub = ({ onNavigated }) => {
  const navigate = useNavigate();
  const [pickingEmployee, setPickingEmployee] = useState(false);
  const { data: employees = [] } = useActiveEmployees();

  // Close the panel FIRST, navigate on the next tick — not the other way round. Closing and
  // routing in the exact same commit confuses framer-motion's AnimatePresence: chatOpen
  // genuinely flips to false (verified with logging) and the widget stops re-rendering, but
  // the panel's DOM node is never actually removed, leaving it stuck on screen over the new
  // page indefinitely. Letting the close animation start in its own isolated commit, with the
  // route change deferred to a separate tick, avoids the collision.
  const go = (to) => {
    onNavigated?.();
    setTimeout(() => navigate(to), 0);
  };

  return (
    <div className="p-3 space-y-1.5">
      {STATIC_TILES.map((t) => (
        <button
          key={t.to}
          onClick={() => go(t.to)}
          className="w-full flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <t.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{t.label}</p>
            <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}

      {pickingEmployee ? (
        <div className="rounded-xl border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <button onClick={() => setPickingEmployee(false)} className="hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            Employee AI Profile — pick an employee
          </div>
          <SearchableSelect
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
            value=""
            onValueChange={(id) => go(buildPath(ROUTES.EMPLOYEE_AI_PROFILE, { id }))}
            placeholder="Search employees..."
          />
        </div>
      ) : (
        <button
          onClick={() => setPickingEmployee(true)}
          className="w-full flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">Employee AI Profile</p>
            <p className="text-[11px] text-muted-foreground truncate">Projects, utilization & recommendations</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      )}
    </div>
  );
};

export default AICopilotHub;
