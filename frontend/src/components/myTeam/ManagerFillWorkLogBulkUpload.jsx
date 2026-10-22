import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertCircle, AlertTriangle, XCircle, BadgeCheck, Download } from 'lucide-react';
import { useImportMyTeamMonthlyWorkLog } from '@/hooks/useMyTeam';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatFileSize } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const TEMPLATE_COLUMNS = ['Employee Code', 'Employee Name', 'Service PO Name', 'Hours', 'Description'];
const REQUIRED_COLUMNS = ['Employee Code', 'Employee Name', 'Service PO Name', 'Hours'];

// Every 422 the bulk-upload endpoint can return is one whole-file validation gate rejecting the
// entire file — nothing is ever partially saved — grouped under a heading that names which gate
// failed. 'format' comes first (missing/unreadable columns) since a file failing that gate never
// even reaches the ownership/service_po checks.
const PHASE_HEADING = {
  format: 'Fix these formatting issues and re-upload',
  ownership: 'Some employees could not be validated',
  service_po: "These Service POs aren't mapped to the employee in that row",
};

// Exported so the parent page can put the trigger button up in its own toolbar (next to Search),
// instead of inside this panel's body.
export const downloadTemplate = () => {
  const wsData = [
    TEMPLATE_COLUMNS,
    ['EMP1023', 'Jane Doe', 'Client Alpha - Support', 40, 'Sprint work (optional)'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 10 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Work Log');
  XLSX.writeFile(wb, 'log_work_for_my_team_template.xlsx');
};

// Local to this component's own result screen — one-off export of the backend's `skipped[]` rows,
// not reused anywhere else.
const downloadSkippedRows = (skipped) => {
  const header = ['Row', 'Employee Code', 'Employee Name', 'Service PO', 'Reason'];
  const rows = skipped.map((row, idx) => [
    row.row ?? idx + 1,
    row.employee_code ?? '',
    row.employee_name ?? '',
    row.service_po_name ?? row.service_po ?? '',
    row.reason ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Skipped Rows');
  XLSX.writeFile(wb, 'skipped_rows.xlsx');
};

// Bulk Upload mode of "Log Work for My Team" — one file covering many Employees at once, as an
// alternative to the per-Employee drawer (Manual Entry mode). Month/Year is NOT picked here; it's
// the same value selected at the top of the screen (see ManagerFillWorkLog.jsx), passed down as
// props so both modes always act on the same period.
const ManagerFillWorkLogBulkUpload = ({ monthYear, monthLabel }) => {
  const { error: showError, success: showSuccess, warning: showWarning } = useNotification();
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);

  const importMutation = useImportMyTeamMonthlyWorkLog();

  // A result/selection from a previous Month/Year is stale and could be misread as belonging to
  // the newly picked one — clear both whenever the shared picker changes.
  useEffect(() => {
    setSelectedFile(null);
    setResult(null);
  }, [monthYear?.month, monthYear?.year]);

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

  const handleImport = () => {
    if (!selectedFile || !monthYear) return;
    importMutation.mutate(
      { file: selectedFile, month: monthYear.month, year: monthYear.year },
      {
        onSuccess: (data) => {
          const payload = data?.data ?? data;
          setResult({ type: 'success', data: payload });
          if (payload?.warning) {
            showWarning(payload?.message ?? 'Imported with warnings — some rows were skipped.');
          } else {
            showSuccess(payload?.message ?? 'Work log imported successfully.');
          }
        },
        onError: (err) => {
          const body = err.response?.data;
          if (err.response?.status === 422 && body?.success === false && Array.isArray(body?.errors)) {
            setResult({ type: 'validation', phase: body.phase, message: body.message, errors: body.errors });
          } else {
            // 400 (no file, unreadable file, or a file with no data rows) and 409 (some employee's
            // month in this file already synced to the official Timesheet) both land here as a
            // simple toast — the whole file is rejected either way (no partial-failure reporting
            // yet), so there's no per-row breakdown to show for these.
            showError(extractApiError(err));
          }
        },
      }
    );
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expected Column Headers</CardTitle>
          <CardDescription>
            Your file must have these columns (order doesn&apos;t matter; header matching is case/spacing-insensitive):
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_COLUMNS.map((col) => (
              <Badge key={col} variant="secondary" className="font-mono text-xs">{col}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Required columns: {REQUIRED_COLUMNS.map((c, i) => (
              <span key={c}><strong>{c}</strong>{i < REQUIRED_COLUMNS.length - 1 ? ', ' : '.'}</span>
            ))}{' '}<strong>Description</strong> is optional.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            You can upload for employees you are the <strong>Primary Manager</strong> of, and for
            employees mapped to Service POs where you are the <strong>Project Manager</strong>{' '}
            (only those POs&apos; rows are imported; other rows are skipped with a warning).{' '}
            <strong>BU Admins</strong> can upload for any employee in their Business Unit(s).
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            For Project Manager imports, only rows for their own POs are replaced; hours from the
            employee&apos;s other POs remain safe.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            A single invalid row rejects the entire file — nothing is saved partially. Entries that
            do get saved are approved immediately, the same as Manual Entry.
          </p>
        </CardContent>
      </Card>

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
              className={cn('mb-3 h-10 w-10 transition-colors', isDragActive ? 'text-primary' : 'text-muted-foreground')}
            />
            {isDragActive ? (
              <p className="text-sm font-medium text-primary">Drop it here…</p>
            ) : (
              <>
                <p className="text-sm font-medium">Drag &amp; drop your file here</p>
                <p className="mt-1 text-xs text-muted-foreground">or click to browse — .xlsx or .csv, max 10 MB</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedFile(null)} title="Remove file">
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {!result && (
        <div className="flex justify-end">
          <Button onClick={handleImport} disabled={!selectedFile || importMutation.isPending}>
            {importMutation.isPending ? 'Uploading…' : `Upload for ${monthLabel}`}
          </Button>
        </div>
      )}

      {result?.type === 'success' && (() => {
        // employees_failed/failures are always present on a success response (0/[] when nothing
        // failed) — the backend now processes every employee independently instead of rejecting
        // the whole file on one write-time conflict (e.g. an employee's month already synced to
        // the official Timesheet). This is still success: true/200, never routed through the
        // error-toast path above — only a per-employee detail to surface inline.
        const employeesFailed = result.data?.employees_failed ?? 0;
        const employeesProcessed = result.data?.employees_processed ?? 0;
        const failures = Array.isArray(result.data?.failures) ? result.data.failures : [];
        const hasFailures = employeesFailed > 0;
        // New fields (rows_skipped/skipped[]/warning) cover a different axis than
        // employees_failed/failures above: a Project Manager's upload can partially succeed per
        // ROW (only that PM's own Service PO rows are imported; everyone else's rows in the same
        // file are skipped with a reason) rather than failing a whole Employee outright.
        const rowsSkipped = result.data?.rows_skipped ?? 0;
        const skipped = Array.isArray(result.data?.skipped) ? result.data.skipped : [];
        const hasRowsSkipped = rowsSkipped > 0;
        const totalRows = result.data?.total_rows ?? 0;
        // Every row in the file got skipped — nothing was actually saved, so the normal
        // success/failure badge (which talks about employees updated) would be misleading here.
        const allRowsSkipped = hasRowsSkipped && employeesProcessed === 0;

        return (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {allRowsSkipped ? (
                  <Badge variant="warning" className="gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No rows were imported
                  </Badge>
                ) : hasFailures ? (
                  <Badge variant="warning" className="gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {employeesProcessed} of {employeesProcessed + employeesFailed} employees imported successfully, {employeesFailed} failed
                  </Badge>
                ) : (
                  <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {employeesProcessed} employees updated, {totalRows} entries saved and approved
                  </Badge>
                )}
                {!allRowsSkipped && hasRowsSkipped && (
                  <Badge variant="warning" className="gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Imported with warnings
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                Upload Another File
              </Button>
            </div>

            {!allRowsSkipped && hasRowsSkipped && (
              <p className="text-xs text-muted-foreground">
                {totalRows} entries saved, {rowsSkipped} rows skipped.
              </p>
            )}

            {!allRowsSkipped && (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                Every entry from this file is approved immediately — no employee approval needed.
              </div>
            )}

            {hasRowsSkipped && (
              <Card className="border-warning/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    {rowsSkipped} row(s) skipped
                  </CardTitle>
                  <CardDescription>
                    These rows weren&apos;t imported — see the reason for each below. Everything
                    else in this file was saved and approved.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                        <TableRow className="bg-warning/5">
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Service PO</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skipped.map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-warning/5 align-top">
                            <TableCell className="font-mono text-xs text-muted-foreground">{row.row ?? idx + 1}</TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">{row.employee_code ?? '—'}</div>
                              <div className="text-xs text-muted-foreground">{row.employee_name ?? ''}</div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.service_po_name ?? row.service_po ?? '—'}</TableCell>
                            <TableCell className="text-sm text-warning">
                              <span className="flex items-start gap-1.5">
                                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{row.reason ?? 'Unknown reason'}</span>
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
                <CardContent className="flex justify-end pt-0">
                  <Button variant="outline" size="sm" onClick={() => downloadSkippedRows(skipped)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download skipped rows
                  </Button>
                </CardContent>
              </Card>
            )}

            {hasFailures && (
              <Card className="border-warning/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    {employeesFailed} employee{employeesFailed !== 1 ? 's' : ''} failed — everyone else above was saved
                  </CardTitle>
                  <CardDescription>
                    These employees weren&apos;t updated. Fix the issue below (e.g. re-upload after
                    the month is reopened) and submit just their rows separately — the rest of this
                    file is already saved and approved.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                        <TableRow className="bg-warning/5">
                          <TableHead>Employee Code</TableHead>
                          <TableHead>Employee Name</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {failures.map((row, idx) => (
                          <TableRow key={row.employee_id ?? idx} className="hover:bg-warning/5 align-top">
                            <TableCell className="text-sm font-medium">{row.employee_code ?? '—'}</TableCell>
                            <TableCell className="text-sm">{row.employee_name ?? '—'}</TableCell>
                            <TableCell className="text-sm text-warning">
                              <span className="flex items-start gap-1.5">
                                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{row.error ?? 'Unknown error'}</span>
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {Array.isArray(result.data?.results) && result.data.results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Results</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                        <TableRow>
                          <TableHead>Employee Code</TableHead>
                          <TableHead>Entries Saved</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.data.results.map((row, idx) => (
                          <TableRow key={row.employee_id ?? idx}>
                            <TableCell className="text-sm font-medium">{row.employee_code ?? '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.entry_count ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        );
      })()}

      {result?.type === 'validation' && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {PHASE_HEADING[result.phase] ?? result.message ?? 'Import Aborted — Validation Failed'}
            </CardTitle>
            <CardDescription>
              Nothing was saved. Fix the errors below and re-upload the entire file — you can&apos;t
              resubmit just the bad rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                  <TableRow className="bg-destructive/5">
                    <TableHead className="w-20">Row #</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errors.map((row, idx) => (
                    <TableRow key={idx} className="hover:bg-destructive/5 align-top">
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.row ?? idx + 1}</TableCell>
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
          <CardContent className="flex justify-end pt-0">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Try Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ManagerFillWorkLogBulkUpload;
