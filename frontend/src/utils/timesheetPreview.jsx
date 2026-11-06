// Employee label for a timesheet preview row — Excel upload preview and Sync Employee Work Logs
// preview share one row shape (valid rows: `preview[]`, error rows: `errors[].row`).
//
// `employeeName` is the matched employee's full name (null when unmatched); `resourceName` is the
// raw sheet value for Excel uploads (may be a code) and the full name for Work Log sync. Prefer the
// former so a code typed in the sheet still shows the real name, and fall back to the latter so an
// unmatched Excel row shows what the user typed. `employeeId` is never shown.
export const previewEmployeeName = (row) => row?.employeeName ?? row?.resourceName ?? '—';

export const previewEmployeeCode = (row) => row?.employeeCode ?? null;

// Fields a search box over preview rows should match for the Employee column.
export const previewEmployeeSearchFields = (row) => [row?.employeeName, row?.employeeCode, row?.resourceName];

// Name + muted code subtext, the shape every preview Employee cell renders.
export const PreviewEmployee = ({ row, className, nameClassName = 'font-medium' }) => {
  const code = previewEmployeeCode(row);
  return (
    <div className={className}>
      <p className={`truncate ${nameClassName}`} title={previewEmployeeName(row)}>{previewEmployeeName(row)}</p>
      {code && <p className="truncate text-xs text-muted-foreground font-mono">{code}</p>}
    </div>
  );
};
