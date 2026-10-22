// Triggers a browser download for an already-fetched Blob (e.g. an Excel/CSV/PDF export
// response) — used anywhere a report/export button hands back a file instead of JSON.
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
