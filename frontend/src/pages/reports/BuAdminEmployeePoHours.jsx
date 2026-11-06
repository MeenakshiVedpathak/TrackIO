import EmployeePoHoursMatrixReport from '@/pages/reports/EmployeePoHoursMatrixReport';
import { useBuAdminEmployeePoHours, useBuAdminEmployeePoHoursFilterOptions } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';

const BuAdminEmployeePoHours = () => (
  <EmployeePoHoursMatrixReport
    title="BU Employee PO Hours"
    useReport={useBuAdminEmployeePoHours}
    useFilterOptions={useBuAdminEmployeePoHoursFilterOptions}
    exportReport={reportsApi.exportBuAdminEmployeePoHours}
    noAccessTitle="You don't have access to this report."
    noAccessDescription="This report is available to Admin, Entity Admin and BU Admin roles only."
    noEmployeesTitle="No employees found in the selected Business Unit(s)."
    showEmployeeBuScope
  />
);

export default BuAdminEmployeePoHours;
