import { Building2, Landmark, FolderKanban, FileText, Users, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';

const ICON_STYLES = {
  orange: { bg: '#fff1e6', color: '#ea6c20' },
  blue: { bg: '#e9f0ff', color: '#4f6ef7' },
  purple: { bg: '#f3ebff', color: '#7c3aed' },
  green: { bg: '#e8f9ef', color: '#22a05a' },
  amber: { bg: '#fff6e0', color: '#d97706' },
  cyan: { bg: '#e5f8fc', color: '#0891b2' },
};

const SummaryCards = ({ counts, isLoading }) => {
  const tiles = [
    // Sourced from GET /platform-admin/total-admins (see OrganizationOverview.jsx), independent
    // of the Entities/BUs/Projects/Service POs/Users counts below, which all derive from the one
    // shared org-overview API call — Admins were never part of that endpoint's response.
    { key: 'totalAdmins', title: 'Total Admins', icon: UserPlus, color: 'orange' },
    { key: 'totalEntities', title: 'Total Entities', icon: Building2, color: 'blue' },
    { key: 'totalBUs', title: 'Total BUs', icon: Landmark, color: 'purple' },
    { key: 'totalProjects', title: 'Total Projects', icon: FolderKanban, color: 'green' },
    { key: 'totalServicePOs', title: 'Total Service POs', icon: FileText, color: 'amber' },
    { key: 'totalUsers', title: 'Total Users', icon: Users, color: 'cyan' },
  ];

  return (
    <div className="flex flex-wrap items-center rounded-xl border bg-white px-2 py-3 sm:flex-nowrap sm:px-4">
      {tiles.map((tile, i) => {
        const style = ICON_STYLES[tile.color];
        const Icon = tile.icon;
        return (
          <div
            key={tile.key}
            className={cn('flex flex-1 items-center gap-3 px-4 py-1.5', i > 0 && 'sm:border-l')}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: style.bg, color: style.color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{tile.title}</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-5 w-10" />
              ) : (
                <p className="text-lg font-semibold leading-tight text-foreground">{counts?.[tile.key] ?? 0}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SummaryCards;
