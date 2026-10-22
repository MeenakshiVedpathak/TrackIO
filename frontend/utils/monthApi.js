// Cost Budget / Resource Budget send month as a "YYYY-MM" string (unlike the rest of the app's
// { month, year } shape used by MonthYearPicker) — these convert at the API boundary only.
export const toApiMonth = ({ month, year }) => `${year}-${String(month).padStart(2, '0')}`;

export const fromApiMonth = (value) => {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  return { month, year };
};
