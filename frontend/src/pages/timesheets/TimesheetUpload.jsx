import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Download, UploadCloud, FileSpreadsheet, X, CheckCircle2, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { timesheetsApi } from '@/api/timesheets.api';
import { useConfirmImport } from '@/hooks/useTimesheets';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { formatFileSize } from '@/utils/formatters';
import PageHeader from '@/components/common/PageHeader';
import ImportPreviewPanel from '@/components/timesheets/ImportPreviewPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const TimesheetUpload = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: showError } = useNotification();

  const [step, setStep] = useState(1); // 1 = upload, 2 = preview
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState(null); // { importId, valid_rows, error_rows }
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  
  const currentDate = new Date();
  const month = location.state?.month || String(currentDate.getMonth() + 1);
  const year = location.state?.year || String(currentDate.getFullYear());
  const buId = location.state?.buId || null;

  const confirmMutation = useConfirmImport();

  // ── Dropzone ────────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const file = accepted[0];

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        let totalRemoved = 0;

        wb.SheetNames.forEach((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (rows.length < 2) return;

          const header = rows[0];
          const dataRows = rows.slice(1);
          const seen = new Set();
          const deduped = dataRows.filter((row) => {
            const key = row.join('|||');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          totalRemoved += dataRows.length - deduped.length;

          if (dataRows.length !== deduped.length) {
            const newWs = XLSX.utils.aoa_to_sheet([header, ...deduped]);
            wb.Sheets[sheetName] = newWs;
          }
        });

        setRemovedDuplicates(totalRemoved);

        if (totalRemoved > 0) {
          const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const cleanFile = new File([blob], file.name, { type: blob.type });
          setSelectedFile(cleanFile);
        } else {
          setSelectedFile(file);
        }
      } catch {
        setRemovedDuplicates(0);
        setSelectedFile(file);
      }
    };
    reader.readAsArrayBuffer(file);
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

  const handleDownloadSample = () => {
    const wsData = [
      ['Employee Code', 'Name', 'Project 1', 'Project 2', 'Is Working'],
      ['EMP-0201', 'Aditya Uday patil', '00:00:00', '00:10:00', 'F'],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    
    ws['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
    ];

    const currentMonth = new Date().toLocaleString('default', { month: 'short' });
    XLSX.utils.book_append_sheet(wb, ws, currentMonth);
    XLSX.writeFile(wb, 'Timesheet_Sample.xlsx');
  };

  // ── Step 1 → Step 2 ─────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const result = await timesheetsApi.upload(selectedFile, month, year, buId);
      setPreview({
        importId:   result?.importId,
        totalRows:  result?.totalRows  ?? 0,
        validCount: result?.validRows  ?? 0,
        errorCount: result?.errorRows  ?? 0,
        valid_rows: result?.preview    ?? [],   // array of row objects
        error_rows: result?.errors     ?? [],   // array of error objects
        canConfirm: result?.canConfirm ?? false,
      });
      setStep(2);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsUploading(false);
    }
  };

  // ── Step 2 → Confirm ────────────────────────────────────────────────────────
  const handleConfirm = () => {
    confirmMutation.mutate({ importId: preview.importId, buId }, {
      onSuccess: () => {
        success('Timesheets imported successfully.');
        navigate(ROUTES.TIMESHEETS);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleCancel = () => {
    setStep(1);
    setSelectedFile(null);
    setPreview(null);
    setRemovedDuplicates(0);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Upload Timesheets"
        description="Import employee timesheet data from an Excel or CSV file"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadSample}>
              <Download className="mr-1.5 h-4 w-4" />
              Download Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.TIMESHEETS)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Timesheets
            </Button>
          </div>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-6">
        <StepBadge num={1} label="Upload File" active={step === 1} done={step > 1} />
        <div className="flex-1 h-px bg-border" />
        <StepBadge num={2} label="Preview &amp; Confirm" active={step === 2} done={false} />
      </div>

      {step === 1 && (
        <div className="space-y-5">
          {/* Period Details */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-sm font-medium text-primary">Selected Period:</span>
            <Badge variant="outline" className="bg-white">
              {new Date(0, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} {year}
            </Badge>
          </div>

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
          {selectedFile && (
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    {removedDuplicates > 0 && (
                      <p className="text-xs font-medium text-amber-600">
                        · {removedDuplicates} duplicate{removedDuplicates !== 1 ? 's' : ''} removed
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => { setSelectedFile(null); setRemovedDuplicates(0); }}
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handlePreview}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Uploading…' : 'Preview Import'}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <ImportPreviewPanel
          preview={preview}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={confirmMutation.isPending}
        />
      )}
    </div>
  );
};

// ── Step badge helper ─────────────────────────────────────────────────────────
const StepBadge = ({ num, label, active, done }) => (
  <div className="flex items-center gap-2 shrink-0">
    <div
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : done
          ? 'bg-green-500 text-white'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {done ? <CheckCircle2 className="h-4 w-4" /> : num}
    </div>
    <span
      className={cn(
        'text-sm font-medium',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {label}
    </span>
  </div>
);

export default TimesheetUpload;
