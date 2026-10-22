import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
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
  'PO Number', 'Service PO Name', 'Client Name', 'Project Name', 'Service Type',
  'Start Date', 'End Date',
];

const ServicePOImport = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();
  const { hasRole, businessUnits, activeBuId } = useAuth();

  // Cosmetic only — picks which help copy to show (the template itself is now the same for every
  // role). The backend independently re-derives the actor's role and enforces BU/Sub-BU
  // authorization on every row: "BU Name" only ever matches a BU this actor owns (Admin/Entity
  // Admin/Platform Admin) or is mapped to (BU-scoped roles, their own Sub-BUs included).
  const isCompanyLessActor = hasRole(...NO_COMPANY_ROLES);
  const sampleColumns = servicePoSampleColumns();
  const activeBuName = businessUnits.find((bu) => bu.id === activeBuId)?.name ?? null;

  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null); // { total, imported, skipped, errorRows } — all-or-nothing: skipped > 0 means nothing was inserted
  // Client-side-parsed rows from the dropped file, shown as a preview table before the actual
  // Import call — same "see what you're about to upload" pattern ClientList.jsx/EmployeeList.jsx
  // already use for their own imports. This is read-only/cosmetic: it's just `xlsx` parsing the
  // file locally to show the user their own data back; the actual import still uploads the raw
  // file to the backend unchanged (see handleImport below), so this can never disagree with what
  // the backend actually reads.
  const [previewData, setPreviewData] = useState(null); // sheet_to_json({header:1}) rows, [0] = header
  const [previewLimit, setPreviewLimit] = useState(5);

  const importMutation = useImportServicePOs();

  // ── Dropzone ────────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const file = accepted[0];
    setSelectedFile(file);
    setResult(null);
    setPreviewData(null);
    setPreviewLimit(5);

    // .csv can't be read by XLSX's default 'binary' type — read those as plain text instead, same
    // distinction FileReader itself draws (readAsBinaryString vs readAsText). Preview-only: parse
    // failures here are silently ignored (the file still uploads fine either way, it just won't
    // show a preview) rather than blocking the actual import over a client-side-only concern.
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target.result;
        const wb = isCsv
          ? XLSX.read(raw, { type: 'string' })
          : XLSX.read(raw, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length > 0) setPreviewData(data);
      } catch {
        // No preview — the Import button below is still enabled off `selectedFile` alone.
      }
    };
    if (isCsv) reader.readAsText(file);
    else reader.readAsBinaryString(file);
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

        if (errorRows.length > 0) {
          showError(`Import aborted — ${errorRows.length} row(s) failed validation. No rows were inserted.`);
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
    setPreviewData(null);
    setPreviewLimit(5);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import Service POs"
        description="Bulk-import Service POs from an Excel or CSV file"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadServicePoSample()}>
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
              Required columns (*): {REQUIRED_COLUMNS.map((c, i) => (
                <span key={c}><strong>{c}*</strong>{i < REQUIRED_COLUMNS.length - 1 ? ', ' : '.'}</span>
              ))}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Client Name</strong> and <strong>Service Type</strong> must match an existing record
              exactly (case-insensitive) — a PO is marked billable based on the matched Service Type's
              category, not a column in the sheet. <strong>Status</strong> defaults to "pending" if left blank.
              Dates accept <strong>YYYY-MM-DD</strong> or <strong>DD/MM/YYYY</strong>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>PO Number</strong> is required for each new Service PO and must be unique in its
              Business Unit. To add hierarchy rows to an existing PO, repeat its{' '}
              <strong>Service PO Name</strong> (and <strong>PO Number</strong>, or leave it blank).
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Service Description</strong>, <strong>Invoice Frequency</strong> and{' '}
              <strong>Status</strong> are optional.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              To add Modules/Tasks, use one row per Module → Task pair and repeat the{' '}
              <strong>PO Number</strong> + <strong>Service PO Name</strong> — see the "Hierarchy
              Guide" sheet in the sample.
            </p>
            {isCompanyLessActor ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <strong>BU Name</strong> is required on every row — one of your own Business Units.{' '}
                <strong>Entity Name</strong> is only needed when two of your Business Units share the
                same name. <strong>Sub BU</strong> is required when that Business Unit has Sub-BUs, and
                must be left blank when it has none.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Leave <strong>BU Name</strong> blank to use your active Business Unit
                {activeBuName ? <> (<strong>{activeBuName}</strong>)</> : null}, or name another Business
                Unit you're mapped to. <strong>Entity Name</strong> is only needed when two of your
                Business Units share the same name. <strong>Sub BU</strong> is required when that
                Business Unit has Sub-BUs.
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
                onClick={handleReset}
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Preview of the file's own rows, parsed client-side — the actual Import call below still
            uploads the raw file to the backend unchanged; this is purely "see what you're about to
            upload" before committing, same pattern ClientList.jsx/EmployeeList.jsx already use for
            their own imports. */}
        {selectedFile && previewData && previewData.length > 0 && !result && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-sm">Preview ({previewData.length - 1} row{previewData.length - 1 === 1 ? '' : 's'})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[min(400px,50vh)]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {previewData[0]?.map((header, i) => (
                        <TableHead key={i} className="whitespace-nowrap font-semibold sticky top-0 bg-muted/50">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(1, previewLimit + 1).map((row, i) => (
                      <TableRow key={i}>
                        {previewData[0].map((_, colIndex) => (
                          <TableCell key={colIndex} className="whitespace-nowrap py-2.5 text-sm">
                            {row[colIndex] != null ? row[colIndex].toString() : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {previewData.length > previewLimit + 1 && (
                      <TableRow>
                        <TableCell colSpan={previewData[0].length} className="text-center bg-muted/10 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => setPreviewLimit((prev) => Math.min(prev + 10, previewData.length - 1))}
                          >
                            Show more rows ({previewData.length - previewLimit - 1} remaining)
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
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
                {result.errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {result.errorRows.length} failed validation
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

            {/* Shown whenever any row errored, independent of `skipped` — import is all-or-nothing,
                so any failure aborts the whole file regardless of how many rows actually errored. */}
            {result.errorRows.length > 0 && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Import Aborted — {result.errorRows.length} Row{result.errorRows.length !== 1 ? 's' : ''} Failed Validation
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
