import { extractApiError } from '@/services/apiClient';

// The three PM-assignment write paths (POST /employee-servicepo-mapping, PUT .../employee/:id
// save, PUT .../:id/project-manager) all 400 with the same raw backend wording when the target
// employee doesn't currently hold the Project Manager role — there's no separate error code for
// it, so this just recognizes that one known message and swaps in clearer, user-facing copy. Any
// other 400 (e.g. PO eligibility) falls through to the backend's own message unchanged.
export const formatProjectManagerAssignmentError = (err) => {
  const message = extractApiError(err);
  if (err?.response?.status === 400 && /does not currently hold the Project Manager role/i.test(message)) {
    return 'This employee does not have the Project Manager role assigned.';
  }
  return message;
};
