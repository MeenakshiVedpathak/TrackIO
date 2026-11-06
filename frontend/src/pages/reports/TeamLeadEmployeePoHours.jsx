import EmployeePoHoursMatrixReport from '@/pages/reports/EmployeePoHoursMatrixReport';
import { useTeamLeadEmployeePoHours, useTeamLeadEmployeePoHoursFilterOptions } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';

const TeamLeadEmployeePoHours = () => (
  <EmployeePoHoursMatrixReport
    title="Team Lead Employee PO Hours"
    useReport={useTeamLeadEmployeePoHours}
    useFilterOptions={useTeamLeadEmployeePoHoursFilterOptions}
    exportReport={reportsApi.exportTeamLeadEmployeePoHours}
    noAccessTitle="You don't have manager access for this report."
    noAccessDescription="This report is only available to a Team Lead / Project Manager with employees mapped to them."
    noEmployeesTitle="No employees are mapped to you as Primary or Secondary manager."
  />
);

export default TeamLeadEmployeePoHours;
