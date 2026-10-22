import * as XLSX from 'xlsx';

// Matches the company's standard Service PO import template format.
// Note: there is no raw "Billable" input — is_billable is derived from the matched
// Service Type's category, never read from the sheet.
//
// Column order: every required field first (PO Number through Sub BU), then every optional one
// (Invoice Frequency through Hierarchy Child) — see ServicePOImport.jsx's own help text for which
// is which. Headers are plain names with no asterisk: the backend matches header cells verbatim,
// so any "required" marking belongs in the help text above the drop zone, never in the sheet
// itself. No "PO Value" or "Delivery Head Manager" columns — both dropped per explicit request;
// the backend still accepts either if a caller adds the header back themselves (it matches by
// header name, not fixed column order/count), this template just no longer ships or demos them.
const SHEET1_COLUMNS = [
  'PO Number', 'Service PO Name', 'Client Name', 'Project Name', 'Service Type',
  'Start Date', 'End Date', 'BU Name', 'Entity Name', 'Sub BU',
  'Invoice Frequency', 'Status', 'Service Description',
  'Hierarchy Parent', 'Hierarchy Child',
];

// Demo rows for three separate Service POs, deliberately covering every hierarchy shape a real
// import needs to express — see the "Hierarchy Guide" sheet for the rules these rows follow:
//   PO-2026-001 — the full case: its first row carries every PO detail plus its first
//     Module/Task pair (Development -> Frontend); three more rows repeat ONLY PO Number +
//     Service PO Name to add Development -> Backend, Testing -> UAT, and a Module with no Task
//     at all (Project Management).
//   PO-2026-002 — no hierarchy at all: both Hierarchy columns blank, a single row.
//   PO-2026-010 — a BU that has Sub-BUs (so Entity Name + Sub BU are both filled on its first
//     row), with two Tasks (Dashboards, Data Model) under one Module (Reporting); the second row
//     again repeats the BU/Entity/Sub BU columns since re-adding a Task later must still name the
//     same BU the PO itself belongs to.
const SHEET1_ROWS = [
  ['PO-2026-001', 'Portal Support', 'Acme Corp', 'Acme Portal', 'Managed T & M', '2026-10-01', '2027-03-31', '', '', '', 'monthly', 'in-progress', 'Portal support', 'Development', 'Frontend'],
  ['PO-2026-001', 'Portal Support', '', '', '', '', '', '', '', '', '', '', '', 'Development', 'Backend'],
  ['PO-2026-001', 'Portal Support', '', '', '', '', '', '', '', '', '', '', '', 'Testing', 'UAT'],
  ['PO-2026-001', 'Portal Support', '', '', '', '', '', '', '', '', '', '', '', 'Project Management', ''],
  ['PO-2026-002', 'Website Build', 'Acme Corp', 'Acme Website', 'Project', '01/10/2026', '31/12/2026', '', '', '', 'milestone-based', 'pending', '', '', ''],
  ['PO-2026-010', 'Analytics Support', 'Acme Corp', 'Acme Analytics', 'Project', '2026-10-01', '2027-03-31', 'Data & AI', 'Alpha Entity', 'Analytics', 'monthly', 'in-progress', '', 'Reporting', 'Dashboards'],
  ['PO-2026-010', 'Analytics Support', '', '', '', '', '', 'Data & AI', 'Alpha Entity', 'Analytics', '', '', '', 'Reporting', 'Data Model'],
];

// Rows 2-4 (0-indexed 1-3) and row 7 (0-indexed 6) are the "repeat PO Number + Service PO Name
// only" continuation rows this template is specifically trying to teach — highlighted so they
// read as a distinct group from a full/first row at a glance.
//
// NOTE: the installed `xlsx` package is the community build, which cannot write cell styles
// (fills, bold, frozen panes) or comments through XLSX.writeFile — both silently no-op (confirmed
// by round-tripping a written file: no style/comment bytes ever land in it). Neither the
// light-grey continuation-row fill, the light-blue Hierarchy column fill, the bold/frozen header,
// nor a cell comment on the Hierarchy Parent header can actually be produced with this library.
// The "Hierarchy Guide" sheet below carries that same explanation in plain text instead, so the
// template is still self-explanatory without relying on cell styling this build can't emit.
const CONTINUATION_ROW_INDEXES = [1, 2, 3, 6];

const HIERARCHY_GUIDE_ROWS = [
  ['Hierarchy = Modules (Hierarchy Parent) and Tasks (Hierarchy Child) under a Service PO. Max 2 levels: Service PO → Module → Task.'],
  ['One row = one Module → Task pair, or one Module on its own.'],
  ['First row of a PO: fill all PO details + its first Module/Task.'],
  ['Extra rows of the same PO: repeat PO Number + Service PO Name (and BU Name / Entity Name / Sub BU if used); leave Client, Project, dates etc. blank.'],
  ['Same Module on several rows = several Tasks under that Module.'],
  ['A Task needs its Module on the same row. The same Module → Task pair twice is an error.'],
  ['No hierarchy: leave both columns blank (see PO-2026-002).'],
  ['Add Tasks to an existing PO later: a row with PO Number + Service PO Name + Module/Task only.'],
  [],
  ['Portal Support (PO-2026-001)'],
  ['├── Development → Frontend, Backend'],
  ['├── Testing → UAT'],
  ['└── Project Management (no tasks)'],
];

const INSTRUCTIONS_HEADER = ['Column', 'Required?', 'Allowed values', 'Example'];
const INSTRUCTIONS_ROWS = [
  ['PO Number', 'Yes', '2-30 chars: A-Z, 0-9, - _ / — unique per Business Unit', 'PO-2026-001'],
  ['Service PO Name', 'Yes', 'Any text', 'Portal Support'],
  ['Client Name', 'Yes', 'Must match an existing Client', 'Acme Corp'],
  ['Project Name', 'Yes', 'Must match an existing Project belonging to that Client', 'Acme Portal'],
  ['Service Type', 'Yes', 'Must match an existing Service Type', 'Managed T & M'],
  ['Start Date', 'Yes', 'YYYY-MM-DD or DD/MM/YYYY', '2026-10-01'],
  ['End Date', 'Yes', 'YYYY-MM-DD or DD/MM/YYYY', '2027-03-31'],
  ['BU Name', 'Admin: required on every row. BU Admin/PM: optional', 'One of your own Business Units', 'Data & AI'],
  ['Entity Name', 'Only when two of your Business Units share the same name', 'One of your own Entities', 'Alpha Entity'],
  ['Sub BU', 'Required when that Business Unit has Sub-BUs; blank when it has none', 'One of that Business Unit’s Sub-BUs', 'Analytics'],
  ['Invoice Frequency', 'Optional', 'e.g. monthly, quarterly, milestone-based, yearly-amc', 'monthly'],
  ['Status', 'Optional (default: pending)', 'e.g. pending, in-progress, completed, closed', 'in-progress'],
  ['Service Description', 'Optional', 'Any text', 'Portal support'],
  ['Hierarchy Parent', 'Optional. Module / Task under the PO — see the Hierarchy Guide sheet', 'Any text', 'Development'],
  ['Hierarchy Child', 'Optional. Module / Task under the PO — see the Hierarchy Guide sheet', 'Any text', 'Frontend'],
];

// Every role gets the same columns now — "BU Name" only ever matches BUs the importing user
// themselves owns or is mapped to (their own Sub-BUs included), so there's nothing role-specific
// left to vary here, only in the help text (see ServicePOImport.jsx).
export const servicePoSampleColumns = () => [...SHEET1_COLUMNS];

export const downloadServicePoSample = () => {
  const columns = servicePoSampleColumns();
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([columns, ...SHEET1_ROWS]);
  ws1['!cols'] = columns.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Service POs');

  const ws2 = XLSX.utils.aoa_to_sheet(HIERARCHY_GUIDE_ROWS);
  ws2['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Hierarchy Guide');

  const ws3 = XLSX.utils.aoa_to_sheet([INSTRUCTIONS_HEADER, ...INSTRUCTIONS_ROWS]);
  ws3['!cols'] = [{ wch: 22 }, { wch: 45 }, { wch: 55 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Instructions');

  XLSX.writeFile(wb, 'ServicePO_Sample.xlsx');
};

// Exported purely so a caller (or a future test) can tell which Sheet-1 rows are continuation
// rows of an earlier PO, without re-deriving it from the row data itself.
export const servicePoSampleContinuationRowIndexes = () => [...CONTINUATION_ROW_INDEXES];
