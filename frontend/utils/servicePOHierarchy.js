// Service POs form a tree up to 3 levels deep (root -> parent -> child). These helpers are
// deliberately defensive about field casing (parentId vs parent_id, code/name vs
// service_po_code/service_po_name) — the same defensive pattern already used for mapping-employee
// shapes in ServicePOMapping.jsx, since different endpoints project the same PO differently.
export const getAncestors = (po) =>
  (po?.ancestors ?? []).map((a) => ({
    id: a.id,
    code: a.code ?? a.service_po_code ?? '',
    name: a.name ?? a.service_po_name ?? '',
  }));

export const getLevel = (po) => po?.level ?? getAncestors(po).length + 1;

const pathKeyOf = (po) => [...getAncestors(po).map((a) => a.id), po.id];

// Orders items depth-first by ancestor chain so every node lands directly after its parent/root,
// without needing to build an actual tree structure first.
export const sortServicePOsHierarchically = (items) =>
  [...items].sort((a, b) => {
    const pathA = pathKeyOf(a);
    const pathB = pathKeyOf(b);
    const len = Math.min(pathA.length, pathB.length);
    for (let i = 0; i < len; i++) {
      if (pathA[i] !== pathB[i]) return pathA[i] - pathB[i];
    }
    return pathA.length - pathB.length;
  });

// Ancestor names + own name/code, for search matching (e.g. typing "Parent" should surface its
// children too).
export const servicePOSearchValue = (po, name, code) =>
  [...getAncestors(po).map((a) => a.name), name, code].filter(Boolean).join(' ');

// Flattens a Service PO's hierarchy tree (GET .../hierarchy — Parent nodes with nested Child
// arrays) into an ordered, indentable list for a select. depth 0 = Parent, 1 = Child. Node ids
// are BIGINT-precision strings from the API — never coerced, just passed through.
export const flattenHierarchyTree = (tree = []) =>
  tree.flatMap((parent) => [
    { id: parent.id, name: parent.node_name ?? parent.name ?? '', depth: 0 },
    ...(parent.children ?? []).map((child) => ({
      id: child.id,
      name: child.node_name ?? child.name ?? '',
      depth: 1,
      parentName: parent.node_name ?? parent.name ?? '',
    })),
  ]);
