import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Download, UploadCloud, FileSpreadsheet, X, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useImportServicePOs } from '@/hooks/useServicePOs';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { NO_COMPANY_ROLES } from '@/constants/roleHierarchy';
import { downloadServicePoSample, servicePoSampleColumns } from '@/utils/servicePoSample';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { formatFileSize } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const REQUIRED_COLUMNS = [
  'Service PO Name', 'Client Name', 'Service Type', 'PO Value', 'Start Date', 'End Date',
];

const ServicePOImport = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();
  const { hasRole, businessUnits, activeBuId } = useAuth();

  // Cosmetic only — this picks which template/copy to show. The backend independently re-derives
  // the actor's role and enforces BU authorization on every row.
  const isCompanyLessActor = hasRole(...NO_COMPANY_ROLES);
  const sampleColumns = servicePoSampleColumns(isCompanyLessActor);
  const activeBuName = businessUnits.find((bu) => bu.id === activeBuId)?.name ?? null;

  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null); // { total, imported, skipped, errorRows } — all-or-nothing: skipped > 0 means nothing was inserted

  const importMutation = useImportServicePOs();

  // ── Dropzone ────────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setSelectedFile(accepted[0]);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxSize: MAX_SIZE,
    multiple: false,
    onDropRejected: (rejections) => {
      const first = rejections[0]?.errors?.[0];
      if (first?.code === 'file-too-large') {
        showError('File exceeds 10 MB limit.');
      } else {
        showError(first?.message ?? 'Invalid file. Please upload .xlsx or .csv.');
      }
    },
  });

  // ── Import (single step — backend imports immediately) ─────────────────────
  const handleImport = () => {
    if (!selectedFile) return;
    importMutation.mutate(selectedFile, {
      onSuccess: (data) => {
        const total     = data?.total    ?? 0;
        const imported  = data?.imported ?? 0;
        const skipped   = data?.skipped  ?? 0;
        const errorRows = data?.error_rows ?? [];

        setResult({ total, imported, skipped, errorRows });

        if (skipped > 0) {
          showError(`Import aborted — ${skipped} row(s) failed validation. No rows were inserted.`);
        } else {
          success(`${imported} of ${total} row(s) imported successfully.`);
        }
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import Service POs"
        description="Bulk-import Service POs from an Excel or CSV file"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadServicePoSample(isCompanyLessActor)}>
              <Download className="mr-1.5 h-4 w-4" />
              Download Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.SERVICE_POS)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Service POs
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        {/* Expected format hint */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Expected Column Headers</CardTitle>
            <CardDescription>Your file must have these columns (order doesn't matter):</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {sampleColumns.map((col) => (
                <Badge key={col} variant="secondary" className="font-mono text-xs">{col}</Badge>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Required columns: {REQUIRED_COLUMNS.map((c, i) => (
                <span key={c}><strong>{c}</strong>{i < REQUIRED_COLUMNS.length - 1 ? ', ' : '.'}</span>
              ))}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              A Service PO Number/Code is always auto-generated — no column for it is needed.{' '}
              <strong>Client Name</strong> and <strong>Service Type</strong> must match an existing record
              exactly (case-insensitive) — a PO is marked billable based on the matched Service Type's
              category, not a column in the sheet. <strong>Status</strong> defaults to "pending" if left blank.
              Dates accept <strong>YYYY-MM-DD</strong> or <strong>DD/MM/YYYY</strong>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Project Name</strong>, <strong>Hierarchy Parent</strong> and{' '}
              <strong>Hierarchy Child</strong> are shown for reference only — they are not read by this
              import; set PO hierarchy from the Service POs list after import.
            </p>
            {isCompanyLessActor ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <strong>BU Name</strong> is required on every row — it must exactly match one of your own
                Business Units, and each imported Service PO is created under the Business Unit named on
                its row. A row with a blank or unrecognized BU Name is rejected.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Every imported Service PO will be created under your currently-active Business Unit
                {activeBuName ? <> — <strong>{activeBuName}</strong></> : null}. No <strong>BU Name</strong>{' '}
                column is needed; switch your active Business Unit before importing if you meant a
                different one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Drop zone */}
        <Card>
          <CardContent className="p-6">
            <div
              {...getRootProps()}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <input {...getInputProps()} />
              <UploadCloud
                className={cn(
                  'mb-3 h-10 w-10 transition-colors',
                  isDragActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              {isDragActive ? (
                <p className="text-sm font-medium text-primary">Drop it here…</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Drag &amp; drop your file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click to browse — .xlsx or .csv, max 10 MB
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Selected file preview */}
        {selectedFile && !result && (
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedFile(null)}
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {!result && (
          <div className="flex justify-end">
            <Button
              onClick={handleImport}
              disabled={!selectedFile || importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        )}

        {/* Result summary */}
        {result && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
                  <span className="text-xs text-muted-foreground">Total rows:</span>
                  <span className="font-mono text-xs font-semibold">{result.total}</span>
                </div>
                <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {result.imported} imported
                </Badge>
                {result.skipped > 0 && (
                  <Badge variant="destructive" className="gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {result.skipped} failed validation
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Import Another File
                </Button>
                <Button size="sm" onClick={() => navigate(ROUTES.SERVICE_POS)}>
                  View Service POs
                </Button>
              </div>
            </div>

            {/* Failed rows — import is all-or-nothing, so any failure aborts the whole file */}
            {result.skipped > 0 && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Import Aborted — {result.skipped} Row{result.skipped !== 1 ? 's' : ''} Failed Validation
                  </CardTitle>
                  <CardDescription>
                    No rows were inserted. Fix the errors below in your file and re-upload the entire file again.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                        <TableRow className="bg-destructive/5">
                          <TableHead className="w-20">Row #</TableHead>
                          <TableHead>Service PO Name</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errorRows.map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-destructive/5 align-top">
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.row_number ?? row.rowNumber ?? idx + 1}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {row.row_data?.service_po_name ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.row_data?.client_name ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm text-destructive">
                              <ul className="list-disc pl-4 space-y-0.5">
                                {(row.errors ?? []).map((msg, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                    <span>{msg}</span>
                                  </li>
                                ))}
                              </ul>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ServicePOImport;
