import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { monthlyCostsApi } from '@/api/monthlyCosts.api';

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATIC_SAMPLE_ROW = ['EMP-0201', 'Rajdoot Herlekar', 'Jul 2026', 284.09, 0, 422.88, 0];

const SAMPLE_COLUMN_WIDTHS = [{ wch: 16 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];

// Same paging loop as monthlyCostsApi.getIdsForPeriod, just keeping full rows instead of ids.
export const fetchAllRecordsForPeriod = async (month, year) => {
  const records = [];
  let page = 1;
  let total = Infinity;
  while (records.length < total) {
    const res = await monthlyCostsApi.getAll({ month, year, page, limit: 200 });
    const rows = Array.isArray(res?.data) ? res.data : [];
    records.push(...rows);
    total = res?.meta?.total ?? records.length;
    if (rows.length === 0) break;
    page += 1;
  }
  return records;
};

// Download Sample pre-fills last month's actual cost records (relabeled to the current month)
// as a ready-to-edit starting point for this month's import — most employees' costs carry over
// unchanged month to month, so this saves re-typing every row from scratch. Falls back to one
// static example row when the previous month has no data yet.
export const downloadMonthlyCostSample = async () => {
  const now = dayjs();
  const prev = now.subtract(1, 'month');
  const currentLabel = `${MONTH_LABELS[now.month() + 1]} ${now.year()}`;

  let dataRows = [];
  try {
    const records = await fetchAllRecordsForPeriod(prev.month() + 1, prev.year());
    dataRows = records.map((r) => [
      r.employee_code ?? r.employee?.employee_code ?? '',
      r.employee_name ?? r.employee?.full_name ?? '',
      currentLabel,
      r.salary_cost ?? 0,
      r.ops_cost ?? 0,
      r.total_cost ?? 0,
      r.billable_cost ?? 0,
    ]);
  } catch {
    // API unreachable — fall back to the static sample below rather than blocking the download
  }

  const wsData = [
    ['Employee Code', 'Name', 'Month Year', 'Salary Cost', 'Ops Cost', 'Total Cost', 'Billable Cost'],
    ...(dataRows.length > 0 ? dataRows : [STATIC_SAMPLE_ROW]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = SAMPLE_COLUMN_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MonthlyCosts');
  XLSX.writeFile(wb, 'MonthlyCost_Sample.xlsx');
};

// Per-period export — the mobile "Download" row action on the Monthly Costs list. Reuses
// fetchAllRecordsForPeriod (already paged through for the Sync flow above) rather than adding a
// new endpoint or a second way of fetching a period's records.
export const downloadMonthlyCostPeriod = async (month, year) => {
  const label = `${MONTH_LABELS[month]} ${year}`;
  const records = await fetchAllRecordsForPeriod(month, year);
  const wsData = [
    ['Employee Code', 'Name', 'Salary Cost', 'Ops Cost', 'Total Cost', 'Billable Cost'],
    ...records.map((r) => [
      r.employee_code ?? r.employee?.employee_code ?? '',
      r.employee_name ?? r.employee?.full_name ?? '',
      r.salary_cost ?? 0,
      r.ops_cost ?? 0,
      r.total_cost ?? 0,
      r.billable_cost ?? 0,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MonthlyCosts');
  XLSX.writeFile(wb, `MonthlyCost_${label.replace(' ', '_')}.xlsx`);
};
