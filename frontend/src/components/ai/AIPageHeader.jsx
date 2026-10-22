import { Link } from 'react-router-dom';
import { ArrowLeft, Bot } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

// Shared header for the new AI Copilot pages (root cause, executive report, forecast,
// recommendations, what-if, project health, employee profile) — keeps them visually
// consistent with each other and with the AI Insights / AI Copilot widget branding.
const AIPageHeader = ({ title, description, actions, backTo = ROUTES.DASHBOARD, backLabel = 'Back to Dashboard' }) => (
  <div className="mb-6">
    <Link to={backTo} className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" /> {backLabel}
    </Link>
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5 55%, #2563eb)' }}
        >
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  </div>
);

export default AIPageHeader;
