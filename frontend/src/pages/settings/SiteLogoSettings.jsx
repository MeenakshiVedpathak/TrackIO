import { useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, UploadCloud } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import EmptyState from '@/components/common/EmptyState';
import { DEFAULT_LOGO_SRC } from '@/components/common/SiteLogo';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivateSiteLogo, useSiteLogos, useUploadSiteLogo } from '@/hooks/useSiteLogo';
import { resolveSiteLogoUrl } from '@/api/siteLogo.api';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDateTime, formatFileSize } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif'];

// Transparent PNGs would be invisible on plain white — a checkerboard shows their edges.
const CHECKERBOARD = {
  backgroundColor: '#fff',
  backgroundImage: 'conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
};

const validateFile = (file) => {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => name.endsWith(ext)) || (file.type && !ALLOWED_MIME.includes(file.type))) {
    return 'Only JPG, PNG or GIF images can be uploaded.';
  }
  if (file.size > MAX_BYTES) {
    return `This file is ${formatFileSize(file.size)}. The maximum allowed size is ${MAX_MB} MB.`;
  }
  return null;
};

const LogoPreview = ({ src }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On light background</p>
      <div className="flex h-24 items-center justify-center rounded-lg border bg-white p-4">
        <img src={src} alt="Logo preview on light background" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On sidebar / login (navy)</p>
      <div className="flex h-24 items-center justify-center rounded-lg border bg-sidebar p-4">
        <img src={src} alt="Logo preview on navy background" className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  </div>
);

const LogoCard = ({ logo, isPreviewed, onPreview, onUse }) => {
  const src = resolveSiteLogoUrl(logo.image_path);
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow',
        logo.is_active ? 'border-primary ring-2 ring-primary/30' : 'hover:shadow-sm',
        isPreviewed && !logo.is_active && 'border-primary/50',
      )}
    >
      <button
        type="button"
        onClick={onPreview}
        className="flex h-28 items-center justify-center p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={CHECKERBOARD}
        aria-label={`Preview ${logo.file_name}`}
      >
        <img src={src} alt={logo.file_name} loading="lazy" className="max-h-full max-w-full object-contain" />
      </button>
      <div className="flex flex-1 flex-col gap-2 border-t p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={logo.file_name}>{logo.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(logo.file_size)} · {logo.created_at ? formatDateTime(logo.created_at) : '—'}
          </p>
          {logo.uploaded_by_name && (
            <p className="truncate text-xs text-muted-foreground">by {logo.uploaded_by_name}</p>
          )}
        </div>
        <div className="mt-auto">
          {logo.is_active ? (
            <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={onUse}>Use this logo</Button>
          )}
        </div>
      </div>
    </div>
  );
};

const SiteLogoSettings = () => {
  const { success, error: showError } = useNotification();
  const { data: logos = [], isPending, isError, error: loadError } = useSiteLogos();
  const uploadMutation = useUploadSiteLogo();
  const activateMutation = useActivateSiteLogo();

  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [confirmLogo, setConfirmLogo] = useState(null);

  const activeLogo = logos.find((l) => l.is_active) ?? null;
  const previewLogo = logos.find((l) => l.id === previewId) ?? activeLogo;
  const previewSrc = resolveSiteLogoUrl(previewLogo?.image_path) ?? DEFAULT_LOGO_SRC;

  const handleFile = (file) => {
    if (!file || uploadMutation.isPending) return;
    const problem = validateFile(file);
    setFileError(problem);
    if (problem) return;
    setProgress(0);
    uploadMutation.mutate(
      { file, onUploadProgress: setProgress },
      {
        onSuccess: (created) => {
          success(`"${created?.file_name ?? file.name}" uploaded. Choose "Use this logo" to make it live.`);
          if (created?.id != null) setPreviewId(created.id);
        },
        onError: (err) => setFileError(extractApiError(err)),
      },
    );
  };

  const handleActivate = () => {
    if (!confirmLogo) return;
    activateMutation.mutate(confirmLogo.id, {
      onSuccess: () => {
        success(`"${confirmLogo.file_name}" is now the site logo.`);
        setPreviewId(null);
        setConfirmLogo(null);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setConfirmLogo(null);
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-[clamp(0.75rem,1.2vw,1rem)] overflow-y-auto">
      <PageHeader
        title="Site Logo"
        description="Upload logos and choose which one appears on the login page and in the sidebar for everyone."
      />

      <div className="grid gap-[clamp(0.75rem,1.2vw,1rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">Upload a new logo</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              disabled={uploadMutation.isPending}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70',
                dragOver ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/60 hover:bg-muted/40',
              )}
            >
              <UploadCloud className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">
                {uploadMutation.isPending ? 'Uploading…' : 'Click to choose a file, or drag it here'}
              </span>
              <span className="text-xs text-muted-foreground">JPG, PNG or GIF · up to {MAX_MB} MB · transparent PNG works best</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {uploadMutation.isPending && <Progress value={progress} aria-label="Upload progress" />}
            {fileError && <p role="alert" className="text-xs text-destructive">{fileError}</p>}
            <p className="text-xs text-muted-foreground">Uploading does not change the live logo until you pick it below.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Preview</p>
              <span className="text-xs text-muted-foreground">
                {previewLogo
                  ? `${previewLogo.file_name}${previewLogo.is_active ? ' (active)' : ' (not active yet)'}`
                  : 'Default Trackio logo (none selected)'}
              </span>
            </div>
            <LogoPreview src={previewSrc} />
            {previewLogo && !previewLogo.is_active && (
              <Button size="sm" onClick={() => setConfirmLogo(previewLogo)}>Use this logo</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Uploaded logos {logos.length > 0 && <span className="font-normal text-muted-foreground">({logos.length})</span>}</p>
        {isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : isError ? (
          <p className="rounded-lg border p-6 text-center text-sm text-destructive">{extractApiError(loadError)}</p>
        ) : logos.length === 0 ? (
          <div className="rounded-lg border">
            <EmptyState
              icon={ImagePlus}
              title="No logos uploaded yet"
              description="The default Trackio logo is shown until you upload one and choose it."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {logos.map((logo) => (
              <LogoCard
                key={logo.id}
                logo={logo}
                isPreviewed={previewLogo?.id === logo.id}
                onPreview={() => setPreviewId(logo.id)}
                onUse={() => setConfirmLogo(logo)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmLogo}
        onOpenChange={(open) => !activateMutation.isPending && !open && setConfirmLogo(null)}
        title="Use this logo?"
        description={confirmLogo ? `"${confirmLogo.file_name}" will replace the current logo on the login page and sidebar for every user.` : undefined}
        confirmLabel="Use this logo"
        variant="default"
        onConfirm={handleActivate}
        isLoading={activateMutation.isPending}
      />
    </div>
  );
};

export default SiteLogoSettings;
