import EmployeePoHoursMatrixReport from '@/pages/reports/EmployeePoHoursMatrixReport';
import { useProjectManagerEmployeePoHours, useProjectManagerEmployeePoHoursFilterOptions } from '@/hooks/useReports';
import { reportsApi } from '@/api/reports.api';

const ProjectManagerEmployeePoHours = () => (
  <EmployeePoHoursMatrixReport
    title="Project Manager Employee PO Hours"
    useReport={useProjectManagerEmployeePoHours}
    useFilterOptions={useProjectManagerEmployeePoHoursFilterOptions}
    exportReport={reportsApi.exportProjectManagerEmployeePoHours}
    noAccessTitle="You don't have Project Manager access for this report."
    noAccessDescription="This report is only available to Project Managers."
    noEmployeesTitle="No employees or logged hours found for your Service POs."
    noPoColumnsTitle="You are not assigned as Project Manager to any Service PO."
    noPoColumnsDescription="This report shows hours for Service POs where you are designated as the Project Manager."
  />
);

export default ProjectManagerEmployeePoHours;
