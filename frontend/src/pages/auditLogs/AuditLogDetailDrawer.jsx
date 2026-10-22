import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, FileText, User, Database, Globe, Clock, Layers } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLog } from '@/hooks/useAuditLogs';
import { formatDateTime } from '@/utils/formatters';
import { extractApiError } from '@/services/apiClient';
import { cn } from '@/utils/cn';

export const getActionBadgeClass = (action) => {
  const a = String(action || '').toUpperCase();
  // Checked ahead of the generic LOGIN/REJECT buckets below — LOGIN_FAILED would otherwise match
  // the plain LOGIN check (slate) and ACCESS_DENIED has no other bucket to fall into at all.
  if (a.includes('LOGIN_FAILED')) {
    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
  }
  if (a.includes('ACCESS_DENIED')) {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  if (a.includes('CREATE') || a.includes('INSERT')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (a.includes('UPDATE') || a.includes('EDIT') || a.includes('MODIFY')) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (a.includes('DELETE') || a.includes('REMOVE')) {
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
  }
  if (a.includes('APPROVE') || a.includes('RESUBMIT')) {
    return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800';
  }
  if (a.includes('REJECT')) {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  if (a.includes('LOGIN') || a.includes('LOGOUT') || a.includes('AUTH')) {
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
  return 'bg-muted text-muted-foreground border-border';
};

// Field Changes shows plain date fields (end_date/start_date etc.) — the "after" side often comes
// back as a full ISO timestamp (e.g. "2026-10-30T00:00:00.000Z") while "before" is a bare date
// string, so trimming at "T" keeps both sides showing just the date instead of one growing a
// midnight timestamp that carries no real information.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

const formatValueDisplay = (val) => {
  if (val === null || val === undefined) return <span className="text-muted-foreground italic">null</span>;
  if (typeof val === 'boolean') return <span className="font-mono text-purple-600 dark:text-purple-400">{String(val)}</span>;
  if (typeof val === 'object') return <pre className="font-mono text-xs">{JSON.stringify(val)}</pre>;
  const str = String(val);
  if (ISO_DATE_TIME.test(str)) return <span>{str.slice(0, 10)}</span>;
  return <span>{str}</span>;
};

const DetailSection = ({ title, icon: Icon, children }) => (
  <div className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{title}</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {children}
    </div>
  </div>
);

const DetailField = ({ label, value, subValue, colSpan }) => (
  <div className={cn('flex flex-col space-y-0.5', colSpan === 'full' && 'sm:col-span-2')}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="font-medium text-foreground">{value || '—'}</div>
    {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
  </div>
);

const AuditLogDetailDrawer = ({ logId, initialRecord, isOpen, onClose, onFilterBySession }) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const { data, isPending, isError, error } = useAuditLog(logId);

  // The endpoint may return envelope { data: record } or the record directly
  const record = data?.data ?? data ?? initialRecord;
  const changes = Array.isArray(record?.changes) ? record.changes : [];
  const oldValues = record?.old_values ?? null;
  const newValues = record?.new_values ?? null;

  const errorMessage = isError ? extractApiError(error) : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-6">
        <SheetHeader className="mb-4 text-left">
          <div className="flex items-center justify-between gap-2 pr-6">
            <SheetTitle className="text-lg font-bold">Audit Log Details</SheetTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              {record?.new_device && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800">
                  Signed in from a NEW device
                </span>
              )}
              {record?.action && (
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', getActionBadgeClass(record.action))}>
                  {record.action_label || record.action}
                </span>
              )}
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            {record?.when ? formatDateTime(record.when) : 'Event details'}
          </SheetDescription>
        </SheetHeader>

        {errorMessage && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isPending && !record ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : record ? (
          <div className="space-y-5">
            {/* What happened summary */}
            {record.summary && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">What Happened</div>
                <p className="text-sm text-foreground">{record.summary}</p>
              </div>
            )}

            {/* Event Overview */}
            <DetailSection title="Event Info" icon={Clock}>
              <DetailField label="Timestamp" value={formatDateTime(record.when)} />
              <DetailField label="Action" value={record.action_label || record.action} />
              <DetailField
                label="Device"
                value={record.device_id ? (
                  <div className="space-y-0.5">
                    {record.device_name && <div>{record.device_name}</div>}
                    <span className="block font-mono text-xs text-muted-foreground" title={record.device_id}>
                      {record.device_id}
                    </span>
                  </div>
                ) : null}
              />
              <DetailField
                label="Session"
                value={record.session_id ? (
                  onFilterBySession ? (
                    <button
                      type="button"
                      onClick={() => onFilterBySession(record.session_id)}
                      className="font-mono text-xs text-primary hover:underline"
                      title={record.session_id}
                    >
                      {record.session_id.slice(0, 8)}
                    </button>
                  ) : (
                    <span className="font-mono text-xs" title={record.session_id}>{record.session_id.slice(0, 8)}</span>
                  )
                ) : null}
              />
              <DetailField label="Login IP" value={record.login_ip} />
              <DetailField label="Browser" value={record.login_browser} />
            </DetailSection>

            {/* Actor Information */}
            <DetailSection title="Actor (Who)" icon={User}>
              <DetailField
                label="User"
                value={record.actor_name}
                subValue={record.actor_code ? `Code: ${record.actor_code}` : (record.actor_id ? `ID: ${record.actor_id}` : undefined)}
              />
              <DetailField label="Role" value={record.actor_role} />
              <DetailField label="User's BU" value={record.actor_bu} />
              <DetailField label="User's Sub-BU" value={record.actor_sub_bu} />
            </DetailSection>

            {/* Record / Target Information */}
            <DetailSection title="Affected Record (What)" icon={Database}>
              <DetailField
                label="Record Type"
                value={record.entity_type_label || record.entity_type}
                subValue={record.entity_id != null ? `ID: ${record.entity_id}` : undefined}
              />
              <DetailField label="Record Name" value={record.entity_name} />
              <DetailField label="Record's BU" value={record.record_bu} />
              <DetailField label="Record's Sub-BU" value={record.record_sub_bu} />
            </DetailSection>

            {/* Before / After Table from changes */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span>Field Changes</span>
                {changes.length > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-semibold">
                    {changes.length}
                  </span>
                )}
              </div>

              {changes.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                      <tr>
                        <th className="p-2.5">Field</th>
                        <th className="p-2.5">Before</th>
                        <th className="p-2.5">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {changes.map((ch, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="p-2.5 font-medium text-foreground align-top whitespace-nowrap">
                            {ch.field || '—'}
                          </td>
                          <td className="p-2.5 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 align-top max-w-[200px] break-words">
                            {formatValueDisplay(ch.from)}
                          </td>
                          <td className="p-2.5 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 align-top max-w-[200px] break-words">
                            {formatValueDisplay(ch.to)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-1">
                  No individual field-level changes recorded for this event.
                </p>
              )}
            </div>

            {/* Collapsible raw JSON block */}
            {(oldValues != null || newValues != null) && (
              <div className="border-t pt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowRawJson((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Raw Payload (Old / New Values JSON)</span>
                  </div>
                  {showRawJson ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {showRawJson && (
                  <div className="space-y-3 pt-1">
                    {oldValues != null && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground">Old Values (Before):</span>
                        <pre className="p-3 bg-muted/60 rounded-md text-[11px] font-mono overflow-x-auto max-h-60 border">
                          {typeof oldValues === 'string' ? oldValues : JSON.stringify(oldValues, null, 2)}
                        </pre>
                      </div>
                    )}
                    {newValues != null && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground">New Values (After):</span>
                        <pre className="p-3 bg-muted/60 rounded-md text-[11px] font-mono overflow-x-auto max-h-60 border">
                          {typeof newValues === 'string' ? newValues : JSON.stringify(newValues, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

export default AuditLogDetailDrawer;
