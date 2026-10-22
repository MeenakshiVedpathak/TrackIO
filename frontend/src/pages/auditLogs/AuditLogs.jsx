import { useState, useCallback } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuditLogsActivityTab from './AuditLogsActivityTab.jsx';
import AuditLogsSessionsTab from './AuditLogsSessionsTab.jsx';
import AuditLogsDevicesTab from './AuditLogsDevicesTab.jsx';

// Orchestrates the three tabs and the cross-tab navigation between them: a Sessions row click
// jumps to Activity filtered by that session_id, a Devices row click jumps to Activity filtered
// by that device_id + the owning user. Each tab is its own component with its own filter/
// pagination state, mounted only while active — switching tabs intentionally resets a tab's own
// filters (matching every other list page in the app), EXCEPT the one preset handed to Activity
// right at the moment of the cross-tab jump.
const AuditLogs = () => {
  const [activeTab, setActiveTab] = useState('activity');
  // `nonce` increments on every jump so clicking the exact same session/device row a second time
  // still re-applies the preset even though its sessionId/deviceId/search values are unchanged.
  const [preset, setPreset] = useState(null);
  const [toolbarSlot, setToolbarSlot] = useState(null);

  const jumpToActivity = useCallback((next) => {
    setPreset((prev) => ({
      sessionId: null,
      deviceId: undefined,
      actorIds: undefined,
      search: undefined,
      ...next,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    setActiveTab('activity');
  }, []);

  const handleOpenSession = useCallback(
    (sessionId) => jumpToActivity({ sessionId }),
    [jumpToActivity]
  );
  const handleOpenDevice = useCallback(
    ({ deviceId, actorId, search }) =>
      jumpToActivity({
        deviceId,
        actorIds: actorId ? [String(actorId)] : undefined,
        search,
      }),
    [jumpToActivity]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Audit Logs"
        description="Track actions, system changes, logins and devices"
        actions={<div ref={setToolbarSlot} className="flex flex-wrap items-center gap-2" />}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 min-h-0 flex-col">
        <TabsList className="mb-3 w-fit bg-slate-100">
          <TabsTrigger value="activity" className="text-xs font-semibold data-[state=active]:bg-white">Activity</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs font-semibold data-[state=active]:bg-white">Sessions</TabsTrigger>
          <TabsTrigger value="devices" className="text-xs font-semibold data-[state=active]:bg-white">Devices</TabsTrigger>
        </TabsList>

        <div className="flex flex-1 min-h-0 flex-col">
          {activeTab === 'activity' && <AuditLogsActivityTab preset={preset} toolbarSlot={toolbarSlot} />}
          {activeTab === 'sessions' && <AuditLogsSessionsTab onOpenSession={handleOpenSession} toolbarSlot={toolbarSlot} />}
          {activeTab === 'devices' && <AuditLogsDevicesTab onOpenDevice={handleOpenDevice} toolbarSlot={toolbarSlot} />}
        </div>
      </Tabs>
    </div>
  );
};

export default AuditLogs;
