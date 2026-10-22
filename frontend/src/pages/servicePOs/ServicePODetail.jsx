import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Users, XCircle, CheckCircle2, Building2, FolderKanban, Tag, Layers,
  IndianRupee, Clock, CalendarDays, Gauge, ChevronRight,
} from 'lucide-react';
import { useServicePO, useServicePOUtilisation, useCloseServicePO } from '@/hooks/useServicePOs';
import { useCanWrite } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_NAMES } from '@/constants/roleHierarchy';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import { useActiveServiceCategories } from '@/hooks/useServiceCategories';
import { useActiveServiceTypes } from '@/hooks/useServiceTypes';
import { formatCurrency, formatDate, formatHours, formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getAncestors, getLevel } from '@/utils/servicePOHierarchy';

const DetailSkeleton = () => (
  <div className="space-y-5">
    <Skeleton className="h-10 w-72" />
    <Card className="border-slate-200">
      <CardContent className="pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);

const TILE_ACCENTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-600',
};

// Icon-led "stat tile" — the modernised replacement for the old plain label/value InfoRow.
// border-slate-200 (not -100) — the lighter shade read as no border at all against this tile's
// own white background, confirmed live.
const InfoTile = ({ icon: Icon, label, value, accent = 'slate' }) => (
  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60">
    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE_ACCENTS[accent])}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-800" title={typeof value === 'string' ? value : undefined}>
        {value ?? '—'}
      </p>
    </div>
  </div>
);

// Green while there's healthy headroom left, amber once it's running close to the expected
// hours, red once it's met or gone over — same thresholds whether driving the badge or the bar.
const UTILISATION_TONES = {
  emerald: { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  red: { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
};

const ServicePODetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { success, error: showError } = useNotification();

  const [confirmClose, setConfirmClose] = useState(false);

  const { data: po, isPending: isLoadingPO } = useServicePO(id);
  const { data: utilisation } = useServicePOUtilisation(id);
  const { data: serviceCategories = [] } = useActiveServiceCategories();
  const { data: serviceTypes = [] } = useActiveServiceTypes();
  // A PO stores only service_type_id; the category is reached through the type.
  const serviceType = serviceTypes.find((t) => String(t.id) === String(po?.service_type_id ?? po?.serviceType?.id));
  const serviceTypeName = po?.serviceType?.service_type_name ?? serviceType?.service_type_name;
  const serviceCategoryId = serviceType?.service_category_id ?? po?.serviceType?.service_category_id;
  const serviceCategoryName =
    po?.serviceType?.serviceCategory?.name ??
    serviceCategories.find((c) => String(c.id) === String(serviceCategoryId))?.name;

  const closeMutation = useCloseServicePO();

  const ancestors = getAncestors(po);
  const level = getLevel(po);

  const { hasRole } = useAuth();
  // hasRole() is an exact match, not hierarchy-aware — Platform Admin has to be listed
  // explicitly alongside Admin or it fails this check despite outranking it.
  const isAdminActor = hasRole(ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN);
  const canWrite = useCanWrite();
  // Map Employees stays open to any write-capable role on any PO, centralised included — only
  // edit/close (Admin-managed for a centralised PO) narrow further below. See
  // ServicePOList.jsx's matching Edit-button gating for the full rationale.
  const canManageResources = canWrite;
  const canEditCentralised = isAdminActor || !po?.is_centralised;
  const canClose = canWrite && canEditCentralised;
  const canEdit = canWrite && canEditCentralised;

  // Utilisation progress
  const loggedHours = Number(utilisation?.total_hours_logged ?? utilisation?.hours_logged ?? 0);
  const expectedHours = Number(po?.expected_man_hours ?? 0);
  const utilisationPct = expectedHours > 0 ? Math.min((loggedHours / expectedHours) * 100, 100) : 0;
  const rawUtilisationPct = expectedHours > 0 ? (loggedHours / expectedHours) * 100 : 0;
  const utilisationTone = rawUtilisationPct >= 100 ? 'red' : rawUtilisationPct >= 80 ? 'amber' : 'emerald';

  const handleClose = () => {
    closeMutation.mutate(id, {
      onSuccess: () => {
        success('Service PO closed successfully.');
        setConfirmClose(false);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setConfirmClose(false);
      },
    });
  };

  if (isLoadingPO) return <DetailSkeleton />;

  if (!po) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Service PO not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(ROUTES.SERVICE_POS)}>
          Back to Service POs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <PageHeader
        title={po.service_po_name}
        description="View and manage PO resources"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.SERVICE_POS)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            {canManageResources && (
              <Button
                variant="outline"
                size="sm"
                // `from` tells the mapping screen's Back button to come back here rather than
                // assuming this page as every caller's origin (the list links there too).
                onClick={() => navigate(
                  buildPath(ROUTES.SERVICE_PO_MAP_EMPLOYEES, { id }),
                  { state: { from: buildPath(ROUTES.SERVICE_PO_DETAIL, { id }) } }
                )}
              >
                <Users className="mr-1.5 h-4 w-4" />
                Map Employees
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(buildPath(ROUTES.SERVICE_PO_EDIT, { id }))}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            )}
            {canClose && po.status === 'active' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmClose(true)}
                disabled={closeMutation.isPending}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Close PO
              </Button>
            )}
          </div>
        }
      />

      {/* PO Overview card */}
      <Card className="overflow-hidden border-slate-200">
        <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-white font-mono text-xs">
              {po.service_po_code}
            </Badge>
            <StatusBadge status={po.status} />
            {po.is_billable && (
              <Badge className="gap-1 bg-emerald-100 text-xs text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Billable
              </Badge>
            )}
            {po.is_centralised && (
              <Badge className="gap-1 bg-violet-100 text-xs text-violet-700 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400">
                <Building2 className="h-3 w-3" />
                Centralised
              </Badge>
            )}
            <Badge variant="outline" className="bg-white text-xs">Level {level}</Badge>
          </div>
          {ancestors.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {ancestors.map((a, i) => (
                <span key={a.id ?? i} className="flex items-center gap-1">
                  <span>{a.name}</span>
                  <ChevronRight className="h-3 w-3" />
                </span>
              ))}
              <span className="font-semibold text-slate-700">{po.service_po_name}</span>
            </div>
          )}
        </div>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <InfoTile icon={Building2} label="Client" value={po.client_name ?? po.client?.client_name} accent="blue" />
            <InfoTile icon={FolderKanban} label="Project" value={po.project_name ?? po.project?.project_name} accent="violet" />
            <InfoTile icon={Tag} label="Service Category" value={serviceCategoryName} accent="amber" />
            <InfoTile icon={Layers} label="Service Type" value={serviceTypeName} accent="slate" />
            <InfoTile icon={IndianRupee} label="PO Value" value={po.po_value != null ? formatCurrency(po.po_value) : null} accent="emerald" />
            <InfoTile icon={Clock} label="Expected Hours" value={po.expected_man_hours != null ? formatHours(po.expected_man_hours) : null} accent="blue" />
            <InfoTile icon={CalendarDays} label="Start Date" value={formatDate(po.start_date)} accent="slate" />
            <InfoTile icon={CalendarDays} label="End Date" value={formatDate(po.end_date)} accent="slate" />
          </div>
        </CardContent>
      </Card>

      {/* Utilisation card */}
      {(po.expected_man_hours != null || utilisation) && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Utilisation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-2xl font-bold text-slate-800">
                {formatHours(loggedHours)}
                {expectedHours > 0 && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    of {formatHours(expectedHours)} expected
                  </span>
                )}
              </p>
              {expectedHours > 0 && (
                <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', UTILISATION_TONES[utilisationTone].badge)}>
                  {formatPercentage(utilisationPct)}
                </span>
              )}
            </div>
            {expectedHours > 0 && (
              <Progress
                value={utilisationPct}
                className="h-2.5"
                indicatorClassName={UTILISATION_TONES[utilisationTone].bar}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm close PO */}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={(open) => !open && setConfirmClose(false)}
        title="Close Service PO?"
        description="This action will close the PO. It cannot be re-opened. Are you sure?"
        confirmLabel="Close PO"
        onConfirm={handleClose}
        isLoading={closeMutation.isPending}
      />
    </div>
  );
};

export default ServicePODetail;
