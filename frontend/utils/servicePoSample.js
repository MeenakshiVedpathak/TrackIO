import * as XLSX from 'xlsx';

// Matches the company's standard Service PO import template format.
// Note: there is no raw "Billable" input — is_billable is derived from the matched
// Service Type's category, never read from the sheet.
// "Project Name" and "Hierarchy Parent"/"Hierarchy Child" are template-only — they are not
// parsed by the file import endpoint.
const BASE_COLUMNS = [
  'Service PO Name', 'Client Name', 'Project Name', 'Service Type', 'PO Value',
  'Start Date', 'End Date', 'Expected Man Hours', 'Service Description',
  'Invoice Frequency', 'Status', 'Hierarchy Parent', 'Hierarchy Child',
];

const BASE_ROWS = [
  [
    'Analytics Support one', 'pockit', 'pockit mobile', 'Project', 500000,
    '2026-01-01', '2026-12-31', 2000, 'Ongoing analytics platform support',
    'monthly', 'in-progress', 'Development', 'Frontend',
  ],
  [
    'Analytics Support two', 'pockit', 'pockit mobile', 'Project', 500000,
    '2026-01-01', '2026-12-31', 2000, 'Ongoing analytics platform support',
    'monthly', 'in-progress', 'Development', 'Frontend',
  ],
];

// The admin template's two rows deliberately name different BUs: for a company-less actor the
// target BU is per-row, not per-file, and seeing them side by side is what makes that obvious.
const SAMPLE_BU_NAMES = ['BU 1', 'BU 2'];

// Company-less actors (Admin/Entity Admin) name the target BU on every row; BU-scoped actors get
// no such column, since their rows land in whichever BU the global switcher has active. Picking
// the template is the only thing this flag does — the backend re-derives and enforces the real BU
// authorization per row regardless of what the frontend believes the actor's role to be.
export const servicePoSampleColumns = (isCompanyLessActor) =>
  (isCompanyLessActor ? [...BASE_COLUMNS, 'BU Name'] : BASE_COLUMNS);

export const downloadServicePoSample = (isCompanyLessActor) => {
  const columns = servicePoSampleColumns(isCompanyLessActor);
  const rows = isCompanyLessActor
    ? BASE_ROWS.map((row, i) => [...row, SAMPLE_BU_NAMES[i % SAMPLE_BU_NAMES.length]])
    : BASE_ROWS;

  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  ws['!cols'] = columns.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Service POs');
  // The BU-scoped variant keeps the original file name so nothing depending on it breaks.
  XLSX.writeFile(wb, isCompanyLessActor ? 'ServicePO_Sample_Admin.xlsx' : 'ServicePO_Sample.xlsx');
};
