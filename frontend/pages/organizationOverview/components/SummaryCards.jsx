import { Building2, Landmark, FolderKanban, FileText, Users } from 'lucide-react';
import StatCard from '@/components/common/StatCard';

const SummaryCards = ({ counts, isLoading }) => {
  const tiles = [
    { key: 'totalEntities', title: 'Total Entities', icon: Building2, gradient: 'blue' },
    { key: 'totalBUs', title: 'Total BUs', icon: Landmark, gradient: 'purple' },
    { key: 'totalProjects', title: 'Total Projects', icon: FolderKanban, gradient: 'green' },
    { key: 'totalServicePOs', title: 'Total Service POs', icon: FileText, gradient: 'amber' },
    { key: 'totalUsers', title: 'Total Users', icon: Users, gradient: 'cyan' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <StatCard
          key={tile.key}
          title={tile.title}
          value={counts?.[tile.key] ?? 0}
          icon={tile.icon}
          gradient={tile.gradient}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
};

export default SummaryCards;
