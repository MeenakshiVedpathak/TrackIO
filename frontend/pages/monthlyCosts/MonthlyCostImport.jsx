import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, X, UploadCloud } from 'lucide-react';
import { useImportMonthlyCosts } from '@/hooks/useMonthlyCosts';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { formatCurrency, formatMonthYear, formatFileSize } from '@/utils/formatters';
import { downloadMonthlyCostSample, fetchAllRecordsForPeriod } from '@/utils/monthlyCostSample';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/common/PageHeader';

// ---------------------------------------------------------------------------
// Column name aliases — maps header spellings to canonical field names
// ---------------------------------------------------------------------------
const COLUMN_MAP = {
  'employee code':         'employee_code',
  'employee_code':         'employee_code',
  'name':                  'employee_name',
  'employee name':         'employee_name',
  'employee_name':         'employee_name',
  'month year':            'month_year',
  'month_year':            'month_year',
  'monthyear':             'month_year',
  'period':                'month_year',
  'salary cost':           'monthly_salary',
  'salary_cost':           'monthly_salary',
  'monthly salary':        'monthly_salary',
  'monthly_salary':        'monthly_salary',
  'ops cost':              'ops_cost_per_employee',
  'ops_cost':              'ops_cost_per_employee',
  'ops cost/employee':     'ops_cost_per_employee',
  'ops_cost_per_employee': 'ops_cost_per_employee',
  'total cost':            'total_cost',
  'total_cost':            'total_cost',
  'billable cost':         'billable_cost',
  'billable_cost':         'billable_cost',
};

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// Accepted formats: Jan 2025 · January 2025 · 01/2025 · 2025-01
// Also handles Excel serial date numbers
const parseMonthYear = (raw) => {
  if (raw == null || raw === '') return null;

  // Excel serial date number
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) return { month: date.m, year: date.y };
    return null;
  }

  const str = String(raw).trim();

  // "Jan 2025" or "January 2025" or "Jan-2025"
  const nameMatch = str.match(/^([A-Za-z]+)[\s-](\d{4})$/);
  if (nameMatch) {
    const m = MONTH_NAMES[nameMatch[1].toLowerCase()];
    const y = parseInt(nameMatch[2], 10);
    if (m && y >= 2000) return { month: m, year: y };
  }

  // "01/2025" or "01-2025"
  const numSlash = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (numSlash) {
    const m = parseInt(numSlash[1], 10);
    const y = parseInt(numSlash[2], 10);
    if (m >= 1 && m <= 12 && y >= 2000) return { month: m, year: y };
  }

  // "2025-01" or "2025/01"
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    if (m >= 1 && m <= 12 && y >= 2000) return { month: m, year: y };
  }

  return null;
};

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

const computeRowErrors = (row) => {
  const errors = [];
  if (!row.employee_name?.trim()) errors.push('Missing Name');
  if (!row.month_year)            errors.push('Missing / unreadable Month Year');
  if (row.monthly_salary == null) errors.push('Missing Salary Cost');
  return errors;
};

const validateRow = (row, index) => {
  const errors = computeRowErrors(row);
  return { ...row, _rowIndex: index + 1, _errors: errors, _valid: errors.length === 0 };
};

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MonthlyCostImport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error: showError } = useNotification();
  const { businessUnits } = useAuth();
  const importMutation = useImportMonthlyCosts();

  const [rows, setRows] = useState([]);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importDone, setImportDone] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  // Rows built from Sync (not an uploaded file) are edited in place, so the file sent to
  // /monthly-costs/import has to be regenerated from `rows` at import time instead of
  // re-sending whatever came off disk — see handleImport below.
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // Mobile-only "Uploading… NN%" panel — real byte progress from axios's onUploadProgress
  // (see monthlyCosts.api.js), not a fake/indeterminate animation. Desktop keeps its existing
  // inline button spinner untouched; this state just also drives the new mobile panel.
  const [uploadProgress, setUploadProgress] = useState(0);

  const parseFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (raw.length < 2) {
          showError('File has no data rows.');
          return;
        }

        const headers = raw[0].map((h) => COLUMN_MAP[String(h).toLowerCase().trim()] ?? null);

        const parsed = raw.slice(1).map((rowArr, i) => {
          const obj = {};
          headers.forEach((key, col) => {
            if (key) obj[key] = rowArr[col];
          });

          const my = parseMonthYear(obj.month_year);
          return validateRow(
            {
              employee_code:         String(obj.employee_code ?? '').trim(),
              employee_name:         String(obj.employee_name ?? '').trim(),
              month:                 my?.month ?? null,
              year:                  my?.year ?? null,
              month_year:            my ? `${MONTH_LABELS[my.month]} ${my.year}` : String(obj.month_year ?? ''),
              monthly_salary:        toNum(obj.monthly_salary),
              ops_cost_per_employee: toNum(obj.ops_cost_per_employee),
              total_cost:            toNum(obj.total_cost),
              billable_cost:         toNum(obj.billable_cost),
            },
            i
          );
        }).filter((r) => r.employee_name || r.monthly_salary || r.month);

        const seen = new Set();
        const deduped = parsed.filter((r) => {
          const key = [
            r.employee_name,
            r.month,
            r.year,
            r.monthly_salary,
            r.ops_cost_per_employee,
            r.total_cost,
            r.billable_cost,
          ].join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setRemovedDuplicates(parsed.length - deduped.length);
        setRows(deduped);
        setFile(file);
        setFileName(file.name);
        setIsSynced(false);
        setImportDone(false);
        setImportResult(null);
      } catch {
        showError('Could not parse the file. Make sure it is a valid .xlsx or .csv file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [showError]);

  const onDrop = useCallback((accepted) => {
    if (accepted.length) parseFile(accepted[0]);
  }, [parseFile]);

  // Which BU these costs land in is settled before this screen: Monthly Costs' "Upload Excel"
  // button asks for it (and only bothers asking when there is more than one to choose from),
  // then passes it here as ?buId=. Resolved fresh from auth on every render so a tampered or
  // stale id can never be imported against.
  //   0 BUs  — Platform Admin/Entity Admin, already unscoped: nothing to pick, nothing to send.
  //   1 BU   — theirs, implicitly; the list page navigates straight here without prompting.
  //   many   — must come from the URL, and must be one they actually hold.
  const buParam = searchParams.get('buId');
  const requiresBu = businessUnits.length > 0;
  const selectedBuId =
    businessUnits.length === 0 ? ''
    : businessUnits.length === 1 ? String(businessUnits[0].id)
    : (businessUnits.some((bu) => String(bu.id) === buParam) ? buParam : '');
  const buReady = !requiresBu || !!selectedBuId;
  const selectedBuName = businessUnits.find((bu) => String(bu.id) === selectedBuId)?.name ?? null;

  // Reachable only by hand-editing the URL — the picker lives on the list page, so send them
  // back to it rather than stranding them on an upload that can never be submitted.
  useEffect(() => {
    if (!buReady) navigate(ROUTES.MONTHLY_COSTS, { replace: true });
  }, [buReady, navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !buReady,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const validRows   = rows.filter((r) => r._valid);
  const invalidRows = rows.filter((r) => !r._valid);

  // Pulls last month's actual records in as editable preview rows, relabeled to the current
  // month — lets the user reuse costs that mostly carry over instead of retyping everything
  // into a spreadsheet first.
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const now = dayjs();
      const prev = now.subtract(1, 'month');
      const prevMonth = prev.month() + 1;
      const prevYear = prev.year();
      const records = await fetchAllRecordsForPeriod(prevMonth, prevYear);

      if (records.length === 0) {
        showError(`No monthly cost records found for ${formatMonthYear(prevMonth, prevYear)} to sync from.`);
        return;
      }

      const currentMonth = now.month() + 1;
      const currentYear = now.year();
      const currentLabel = formatMonthYear(currentMonth, currentYear);

      const synced = records.map((r, i) => validateRow(
        {
          employee_code:         r.employee_code ?? r.employee?.employee_code ?? '',
          employee_name:         r.employee_name ?? r.employee?.full_name ?? '',
          month:                 currentMonth,
          year:                  currentYear,
          month_year:            currentLabel,
          monthly_salary:        r.salary_cost ?? null,
          ops_cost_per_employee: r.ops_cost ?? null,
          total_cost:            r.total_cost ?? null,
          billable_cost:         r.billable_cost ?? null,
        },
        i
      ));

      setRemovedDuplicates(0);
      setRows(synced);
      setFile(null);
      setFileName(`Synced from ${formatMonthYear(prevMonth, prevYear)}`);
      setIsSynced(true);
      setImportDone(false);
      setImportResult(null);
    } catch (err) {
      showError(extractApiError(err) || "Could not sync last month's data.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Edits apply to the in-memory rows; the outgoing file for synced rows is rebuilt from
  // `rows` at import time (below) so the edit actually reaches the backend.
  const handleEditRow = (rowIndex, field, rawValue) => {
    setRows((prev) => prev.map((r) => {
      if (r._rowIndex !== rowIndex) return r;
      const numeric = rawValue === '' ? null : Number(rawValue);
      const updated = { ...r, [field]: Number.isNaN(numeric) ? r[field] : numeric };
      const errors = computeRowErrors(updated);
      return { ...updated, _errors: errors, _valid: errors.length === 0 };
    }));
  };

  const buildSyncedFile = () => {
    const wsData = [
      ['Employee Code', 'Name', 'Month Year', 'Salary Cost', 'Ops Cost', 'Total Cost', 'Billable Cost'],
      ...rows.map((r) => [
        r.employee_code ?? '',
        r.employee_name ?? '',
        r.month_year ?? '',
        r.monthly_salary ?? 0,
        r.ops_cost_per_employee ?? 0,
        r.total_cost ?? 0,
        r.billable_cost ?? 0,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MonthlyCosts');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new File([buffer], 'MonthlyCost_Synced.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  // Mobile "Upload Another File" / the file-selected card's "×" remove button — both just return
  // to the empty dropzone state; reuses the same reset `parseFile` already does on a fresh drop,
  // no new state machine.
  const handleResetFile = () => {
    setRows([]);
    setFile(null);
    setFileName('');
    setIsSynced(false);
    setImportDone(false);
    setImportResult(null);
    setRemovedDuplicates(0);
  };

  // Mobile error panel's "Download Error Report" — exports the same `failedRows` the desktop
  // error banner already lists inline, as an Excel file instead of on-screen text.
  const handleDownloadErrorReport = () => {
    if (!importResult?.failedRows?.length) return;
    const header = ['Row', 'Errors', 'Employee Code', 'Name'];
    const dataRows = importResult.failedRows.map((r) => [
      r.row,
      (r.errors ?? []).join(', '),
      r.data?.['Employee Code'] ?? '',
      r.data?.Name ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    XLSX.writeFile(wb, 'MonthlyCost_Import_Errors.xlsx');
  };

  const handleImport = () => {
    if (!buReady) {
      showError('Select the Business Unit you are uploading for before importing.');
      return;
    }
    const fileToImport = isSynced ? buildSyncedFile() : file;
    setUploadProgress(0);
    importMutation.mutate({
      file: fileToImport,
      businessUnitId: selectedBuId || null,
      onUploadProgress: setUploadProgress,
    }, {
      onSuccess: (res) => {
        const data     = res?.data ?? res ?? {};
        const imported = data.imported ?? 0;
        const updated  = data.updated  ?? 0;
        const failed   = data.failed   ?? 0;
        const results  = data.results  ?? [];

        if (failed > 0) {
          const failedRows = results.filter((r) => r.status === 'error');
          setImportResult({ failed, failedRows, hasError: true });
          setImportDone(true);
          showError(`Import failed: ${failed} row${failed !== 1 ? 's' : ''} could not be imported.`);
          return;
        }

        setImportResult({ imported, updated, hasError: false });
        setImportDone(true);
        success(`${imported + updated} record${imported + updated !== 1 ? 's' : ''} imported successfully.`);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-5"
    >
      <PageHeader
        title="Import Monthly Costs"
        description={
          selectedBuName
            ? `Upload an Excel or CSV file to bulk-import monthly cost records for ${selectedBuName}`
            : 'Upload an Excel or CSV file to bulk-import monthly cost records'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing || !buReady}>
              {isSyncing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Sync from Previous Month
            </Button>
            <Button variant="outline" size="sm" onClick={downloadMonthlyCostSample}>
              <Download className="mr-1.5 h-4 w-4" />
              Download Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.MONTHLY_COSTS)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Expected format hint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expected Column Headers</CardTitle>
          <CardDescription>Your file must have these columns (order doesn't matter):</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['Name', 'Month Year', 'Salary Cost', 'Ops Cost', 'Total Cost', 'Billable Cost'].map((col) => (
              <Badge key={col} variant="secondary" className="font-mono text-xs">{col}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>Month Year</strong> formats accepted — Jan 2025 · January 2025 · 01/2025 · 2025-01
            &nbsp;·&nbsp; Required columns: <strong>Name</strong>, <strong>Month Year</strong>, <strong>Salary Cost</strong>
          </p>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 transition-colors
              ${!buReady
                ? 'cursor-not-allowed border-muted-foreground/25 opacity-60'
                : isDragActive
                  ? 'cursor-pointer border-primary bg-primary/5'
                  : 'cursor-pointer border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40'}`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet className={`h-10 w-10 ${isDragActive && buReady ? 'text-primary' : 'text-muted-foreground'}`} />
            {isDragActive ? (
              <p className="text-sm font-medium text-primary">Drop the file here…</p>
            ) : (
              <>
                <p className="text-sm font-medium">Drag &amp; drop your Excel file here</p>
                <p className="text-xs text-muted-foreground">
                  or click to browse · .xlsx, .xls, .csv accepted
                </p>
              </>
            )}
          </div>
          {fileName && !importDone && (
            <>
              {/* Desktop: unchanged compact line. */}
              <div className="mt-3 hidden md:flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                <span className="truncate">{fileName}</span>
                <span className="shrink-0">— {rows.length} row{rows.length !== 1 ? 's' : ''} detected</span>
                {removedDuplicates > 0 && (
                  <span className="shrink-0 text-amber-600 font-medium">
                    · {removedDuplicates} duplicate{removedDuplicates !== 1 ? 's' : ''} removed
                  </span>
                )}
              </div>

              {/* Mobile: "file selected" card — filename, size, a remove "×", same data as the
                  desktop line above (file.size, rows.length) just laid out per the mobile design. */}
              <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/20 p-3 md:hidden">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {file ? formatFileSize(file.size) : ''}
                    {file ? ' · ' : ''}{rows.length} row{rows.length !== 1 ? 's' : ''} detected
                    {removedDuplicates > 0 && ` · ${removedDuplicates} duplicate${removedDuplicates !== 1 ? 's' : ''} removed`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mobile-only: full "Uploading…" panel with real progress, replacing the preview card
          while the request is in flight. Desktop is untouched — it keeps showing the preview
          card with its existing inline button spinner throughout. */}
      {importMutation.isPending && (
        <Card className="md:hidden">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UploadCloud className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-medium">Uploading file...</p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Please do not close this screen.</p>
          </CardContent>
        </Card>
      )}

      {/* Import result banner */}
      {importDone && importResult && !importResult.hasError && (
        <>
          {/* Desktop: unchanged compact banner. */}
          <div className="hidden md:flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <div className="text-sm">
              <p className="font-medium text-green-700 dark:text-green-400">
                Import complete — {importResult.imported} inserted, {importResult.updated} updated
              </p>
              <button
                className="mt-1 text-xs underline text-green-600 dark:text-green-500"
                onClick={() => navigate(ROUTES.MONTHLY_COSTS)}
              >
                View Monthly Costs →
              </button>
            </div>
          </div>

          {/* Mobile: full success panel. */}
          <Card className="md:hidden">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <p className="text-sm font-semibold">File uploaded successfully</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {importResult.imported + importResult.updated} record{importResult.imported + importResult.updated !== 1 ? 's' : ''} {importResult.imported + importResult.updated !== 1 ? 'have' : 'has'} been imported
                {selectedBuName ? ` for ${selectedBuName}` : ''}.
              </p>
              <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
                <Button className="w-full" onClick={() => navigate(ROUTES.MONTHLY_COSTS)}>
                  View Monthly Costs
                </Button>
                <Button variant="outline" className="w-full" onClick={handleResetFile}>
                  Upload Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {importDone && importResult?.hasError && (
        <>
        {/* Mobile: full error panel. */}
        <Card className="md:hidden">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-sm font-semibold">Upload failed</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              There were errors in your file. Please check the file format and try again.
            </p>
            <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
              <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={handleDownloadErrorReport}>
                <Download className="mr-1.5 h-4 w-4" /> Download Error Report
              </Button>
              <Button className="w-full" onClick={handleImport} disabled={importMutation.isPending}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Desktop: unchanged detailed banner. */}
        <div className="hidden md:block rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Import failed — {importResult.failed} row{importResult.failed !== 1 ? 's' : ''} could not be processed. Please fix the errors and re-import the file.
            </p>
          </div>
          {importResult.failedRows?.length > 0 && (
            <div className="space-y-1.5">
              {importResult.failedRows.map((r) => (
                <div key={r.row} className="flex items-start gap-2 text-xs text-destructive/80">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Row {r.row}:</strong> {r.errors?.join(', ')}
                    {r.data?.['Employee Code'] && ` (${r.data['Employee Code']} — ${r.data?.Name ?? ''})`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
      )}

      {/* Preview table — hidden on mobile only while uploading (the new "Uploading…" panel above
          takes over there); desktop keeps showing this with its existing button spinner exactly
          as before, at every state. */}
      {rows.length > 0 && !importDone && (
        <Card className={cn(importMutation.isPending && 'hidden md:block')}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-sm">Preview — {rows.length} rows</CardTitle>
              <CardDescription className="mt-0.5">
                <span className="text-green-600 font-medium">{validRows.length} valid</span>
                {invalidRows.length > 0 && (
                  <span className="ml-2 text-destructive font-medium">{invalidRows.length} with errors</span>
                )}
                {isSynced && (
                  <span className="ml-2 text-muted-foreground">— edit the cost columns below, then import</span>
                )}
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importMutation.isPending || !buReady || (!file && !isSynced) || validRows.length === 0 || invalidRows.length > 0}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Import {validRows.length} record{validRows.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-10">#</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Month Year</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Salary Cost</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Ops Cost</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total Cost</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Billable Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row._rowIndex}
                      className={`border-b last:border-0 ${!row._valid ? 'bg-destructive/5' : ''}`}
                    >
                      <td className="px-4 py-2 text-muted-foreground">{row._rowIndex}</td>
                      <td className="px-4 py-2">
                        {row._valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="h-4 w-4 shrink-0" />
                            {row._errors.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.employee_code || '—'}</td>
                      <td className="px-4 py-2">
                        {row.employee_name || <span className="text-destructive">—</span>}
                      </td>
                      <td className="px-4 py-2">{row.month_year || <span className="text-destructive">—</span>}</td>
                      {[
                        ['monthly_salary', row.monthly_salary, true],
                        ['ops_cost_per_employee', row.ops_cost_per_employee, false],
                        ['total_cost', row.total_cost, false],
                        ['billable_cost', row.billable_cost, false],
                      ].map(([field, value, required]) => (
                        <td key={field} className="px-4 py-2 text-right tabular-nums">
                          {isSynced ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={value ?? ''}
                              onChange={(e) => handleEditRow(row._rowIndex, field, e.target.value)}
                              className="h-7 w-28 text-right tabular-nums"
                            />
                          ) : value != null ? (
                            formatCurrency(value)
                          ) : required ? (
                            <span className="text-destructive">—</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: same `rows` data as the desktop table above, as cards. Synced rows stay
                editable via the exact same handleEditRow used by the desktop table's inputs. */}
            <div className="space-y-2 p-3 md:hidden">
              {rows.map((row) => (
                <div
                  key={row._rowIndex}
                  className={cn('rounded-lg border p-3', !row._valid && 'border-destructive/40 bg-destructive/5')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {row.employee_name || <span className="text-destructive">Missing name</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.employee_code || '—'} · {row.month_year || <span className="text-destructive">Missing period</span>}
                      </p>
                    </div>
                    {row._valid ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                  </div>
                  {!row._valid && (
                    <p className="mt-1 text-xs text-destructive">{row._errors.join(', ')}</p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['monthly_salary', row.monthly_salary, true, 'Salary Cost'],
                      ['ops_cost_per_employee', row.ops_cost_per_employee, false, 'Ops Cost'],
                      ['total_cost', row.total_cost, false, 'Total Cost'],
                      ['billable_cost', row.billable_cost, false, 'Billable Cost'],
                    ].map(([field, value, required, label]) => (
                      <div key={field}>
                        <p className="text-muted-foreground">{label}</p>
                        {isSynced ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={value ?? ''}
                            onChange={(e) => handleEditRow(row._rowIndex, field, e.target.value)}
                            className="mt-0.5 h-8 w-full tabular-nums"
                          />
                        ) : (
                          <p className="font-medium tabular-nums">
                            {value != null ? formatCurrency(value) : required ? (
                              <span className="text-destructive">—</span>
                            ) : '—'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {invalidRows.length > 0 && (
              <div className="flex items-start gap-2 border-t bg-destructive/5 p-4 text-xs text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Import blocked.</strong> Fix the {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors before importing. All rows must be valid to proceed.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default MonthlyCostImport;
