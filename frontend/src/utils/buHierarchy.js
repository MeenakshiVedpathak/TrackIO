// Orders a flat list of BU master rows (company_name / parent_business_unit_id) as a hierarchy —
// each Parent BU followed by its Sub-BUs (depth 1) — so a MultiSelect can show them indented.
// A Sub-BU whose Parent isn't in `companies` (filtered out / not visible) is kept as a top-level row.
export const toHierarchicalBuOptions = (companies = []) => {
  const ids = new Set(companies.map((c) => String(c.id)));
  const childrenByParent = new Map();
  const roots = [];
  companies.forEach((c) => {
    const parentId = c.parent_business_unit_id ?? c.parent?.id;
    if (parentId != null && ids.has(String(parentId))) {
      const key = String(parentId);
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(c);
    } else {
      roots.push(c);
    }
  });
  // `id`/`parentId` (alongside the `value`/`label`/`depth` MultiSelect itself reads) let this same
  // options array double as the `options` argument to dedupeBusinessUnitIds (see
  // HierarchicalBuSelector.jsx) — the Parent-vs-Sub-BU dedup every other hierarchical BU picker in
  // this app already applies at its own request-param boundary.
  const toOption = (c, depth, parentId) => ({ label: c.company_name, value: String(c.id), id: String(c.id), parentId, depth });
  return roots.flatMap((root) => [
    toOption(root, 0, null),
    ...(childrenByParent.get(String(root.id)) ?? []).map((child) => toOption(child, 1, String(root.id))),
  ]);
};
