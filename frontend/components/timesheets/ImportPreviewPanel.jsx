import { CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDate } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Shared between the Excel-upload flow (TimesheetUpload.jsx) and the "Sync Employee Work
// Logs" flow (SyncWorkLogsDialog.jsx) — both produce the exact same preview response shape
// from the backend, so this is the one place that renders it.
const ImportPreviewPanel = ({ preview, onConfirm, onCancel, isConfirming }) => (
  <div className="space-y-5">
    {/* Summary and Actions */}
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">Import ID:</span>
          <span className="font-mono text-xs font-semibold">{preview.importId}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">Total rows:</span>
          <span className="font-mono text-xs font-semibold">{preview.totalRows}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">Employees:</span>
          <span className="font-mono text-xs font-semibold">
            {new Set(preview.valid_rows.map((r) => r.employeeId ?? r.resourceName).filter(Boolean)).size}
          </span>
        </div>
        <Badge className="gap-1.5 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {preview.validCount} valid
        </Badge>
        {preview.errorCount > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {preview.errorCount} error{preview.errorCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isConfirming}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming || !preview.canConfirm || preview.validCount === 0}
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          {isConfirming ? 'Importing…' : 'Confirm Import'}
        </Button>
      </div>
    </div>

    {/* Valid rows */}
    {preview.valid_rows.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Valid Rows ({preview.validCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <TableRow className="bg-muted/30">
                  <TableHead>Row</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Service PO</TableHead>
                  <TableHead>Sub-Project</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.valid_rows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.rowNumber ?? idx + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{row.resourceName ?? '—'}</p>
                      {row.employeeId && (
                        <p className="text-xs text-muted-foreground font-mono">ID: {row.employeeId}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.servicePOName || (row.poId ? `PO #${row.poId}` : '—')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.subProjectName ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {row.date ? formatDate(row.date) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-sm">
                      {row.hours != null ? `${Number(row.hours).toFixed(2)}h` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    )}

    {/* Error rows */}
    {preview.errorCount > 0 && (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Error Rows ({preview.errorCount})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[300px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <TableRow className="bg-destructive/5">
                  <TableHead className="w-24">Row #</TableHead>
                  <TableHead>Error Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.error_rows.map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-destructive/5">
                    <TableCell className="font-mono text-xs">
                      {row.rowNumber ?? row.row_number ?? idx + 1}
                    </TableCell>
                    <TableCell className="text-sm text-destructive">
                      {row.errors?.length > 0
                        ? row.errors.join(', ')
                        : row.message ?? row.error_message ?? row.error ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    )}
  </div>
);

export default ImportPreviewPanel;
