// Turns a report's selected Entity/BU arrays into the comma-joined query params the
// `/active/list` option endpoints accept. Empty/absent selection = no param = unscoped.
export const scopeToParams = (scope) => {
  const params = {};
  if (scope?.entityIds?.length) params.entityIds = scope.entityIds.join(',');
  if (scope?.businessUnitIds?.length) params.businessUnitIds = scope.businessUnitIds.join(',');
  return Object.keys(params).length ? params : undefined;
};
