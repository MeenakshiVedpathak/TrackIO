import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { selectSidebarCollapsed, toggleSidebar, setSidebarCollapsed } from '@/store/slices/uiSlice';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { useFormModules, useForms } from '@/hooks/useForms';
import { useEmployeeEntries } from '@/hooks/useEmployeeWorkLog';
import { resolveFormRoute } from '@/constants/rbacForms';
import { ROUTES } from '@/constants/routes';
import { ChevronLeft, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import ScrollOnHoverText from '@/components/common/ScrollOnHoverText';

// Modules whose group label becomes a direct link to a hub/landing page instead of a plain
// collapsible header — same pattern as Sidebar.jsx's MODULE_OVERVIEW_ROUTES. The key is the
// module name lowercased/trimmed (matched against accessibleForms module keys at render time).
// When a module both has a hub route here AND has at least one form assigned to a category in
// the Form Master, the sidebar collapses to only the module link — browsing by category
// happens on the hub page instead.
const MODULE_OVERVIEW_ROUTES = {
  // The Form Master module name for employee-side reports may vary (e.g. "Resources",
  // "My Reports") — add the actual lowercased name once confirmed from GET /roles/forms.
  // The hub page itself (EmployeeReportsCenter) filters by known form names rather than
  // module name, so whatever the admin calls this module, the hub still shows the right reports.
  reports: ROUTES.EMPLOYEE_REPORTS_CENTER,
  'my reports': ROUTES.EMPLOYEE_REPORTS_CENTER,
  'employee reports': ROUTES.EMPLOYEE_REPORTS_CENTER,
};

// Real module/form ordering, sourced from the same Form Master data the /forms screen
// manages (GET /forms/modules for module seq, GET /forms for per-module form seq) — see the
// identical helper in Sidebar.jsx. Available to every authenticated user regardless of
// whether they hold the "Forms" RBAC permission (that permission only gates writes).
const useMenuRank = () => {
  const { data: moduleRows } = useFormModules({ status: 'active' });
  const { data: formsList } = useForms({ status: 'active' });

  return useMemo(() => {
    const moduleSeq = new Map();
    (moduleRows ?? []).forEach((m) => moduleSeq.set(m.form_name.trim().toLowerCase(), m.seq));

    const formSeq = new Map();
    const formCategoryId = new Map();
    (formsList?.data ?? []).forEach((f) => {
      if (f.module_name != null) {
        const key = `${f.module_name.trim().toLowerCase()}::${f.form_name.trim().toLowerCase()}`;
        formSeq.set(key, f.seq);
        if (f.category_id != null) formCategoryId.set(key, f.category_id);
      }
    });

    return {
      moduleRank: (moduleName) => moduleSeq.get(moduleName.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER,
      formRank: (moduleName, formName) =>
        formSeq.get(`${moduleName.trim().toLowerCase()}::${formName.trim().toLowerCase()}`) ?? Number.MAX_SAFE_INTEGER,
      // Returns the category_id (or null) for a given module+form pair — used by buildNavGroups
      // to detect whether a module has any categorised forms (which triggers the hub-link mode).
      categoryOf: (moduleName, formName) =>
        formCategoryId.get(`${moduleName.trim().toLowerCase()}::${formName.trim().toLowerCase()}`) ?? null,
    };
  }, [moduleRows, formsList]);
};

// RBAC-driven, same as the admin Sidebar's buildNavGroups — one group per module, one item per
// mapped form, both ordered by the real Form Master seq (moduleRank/formRank above) rather
// than a hardcoded name list. Used to be a hardcoded NAV_GROUPS array shown to every Employee
// regardless of any Form Master mapping; now an Employee only sees what's actually mapped to
// them, in the order an admin actually arranged.
// categoryOf is used solely to set a `hasCategory` flag on each item so the group-level check
// `items.some(i => i.hasCategory)` can detect hub-link mode — the actual category grouping
// (sub-headers etc.) is handled by the hub page itself, not in this sidebar.
const buildNavGroups = (accessibleForms, { moduleRank, formRank, categoryOf }) =>
  Object.entries(accessibleForms ?? {})
    .map(([moduleName, forms]) => ({
      label: moduleName,
      items: (forms ?? [])
        .map((form) => {
          const cfg = resolveFormRoute(form.name);
          if (!cfg) {
            console.warn(
              `[RBAC] EmployeeSidebar: no route mapping for form "${form.name}" (module "${moduleName}"). ` +
              `Add it to src/constants/rbacForms.js.`
            );
            return null;
          }
          return {
            label: form.name,
            icon: cfg.icon,
            to: cfg.to,
            exact: cfg.exact,
            hasCategory: categoryOf(moduleName, form.name) != null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => formRank(moduleName, a.label) - formRank(moduleName, b.label)),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => moduleRank(a.label) - moduleRank(b.label));

const isActive = (to, pathname, exact) =>
  exact ? pathname === to : pathname === to || pathname.startsWith(to + '/');

const EmployeeNavItem = ({ item, active, collapsed, badgeCount }) => {
  const [hovered, setHovered] = useState(false);
  const hasBadge = badgeCount > 0;

  return (
    <Link
      to={item.to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'nav-item group relative flex items-center gap-3 transition-all',
        active && 'active',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? `${item.label}${hasBadge ? ` (${badgeCount})` : ''}` : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary" />
      )}
      <span className="relative shrink-0">
        <item.icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
        {hasBadge && collapsed && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </span>
      {!collapsed && (
        <span className="flex flex-1 items-center justify-between gap-2 overflow-hidden">
          <ScrollOnHoverText text={item.label} hovered={hovered} />
          {hasBadge && (
            <span className="shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </span>
      )}
    </Link>
  );
};

const EmployeeSidebar = () => {
  const dispatch = useDispatch();
  const collapsed = useSelector(selectSidebarCollapsed);
  const { pathname } = useLocation();
  const { accessibleForms } = useAuth();
  const { moduleRank, formRank, categoryOf } = useMenuRank();
  const navGroups = useMemo(() => buildNavGroups(accessibleForms, { moduleRank, formRank, categoryOf }), [accessibleForms, moduleRank, formRank, categoryOf]);

  const hasRejectedEntriesTab = useMemo(
    () => navGroups.some((g) => g.items.some((i) => i.to === ROUTES.EMPLOYEE_REJECTED_ENTRIES)),
    [navGroups]
  );
  const { data: rejectedEntries } = useEmployeeEntries({ status: 'rejected', page: 1, limit: 1 }, hasRejectedEntriesTab);
  const rejectedCount = rejectedEntries?.meta?.total ?? 0;

  // Per-module expand/collapse in the drawer — same convenience-only (unpersisted) behaviour as
  // the admin Sidebar. Tracking *expanded* labels means an empty Set reads as "all collapsed"
  // without needing the module list up front.
  const [expandedModules, setExpandedModules] = useState(() => new Set());
  const toggleModule = (label) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // The module holding the current route, so the first render doesn't leave an Employee staring
  // at nothing but collapsed headers. Seeded once (not on every navigation) so a module the user
  // has since collapsed by hand stays collapsed.
  const activeGroupLabel = useMemo(
    () => navGroups.find((g) => g.items.some((i) => isActive(i.to, pathname, i.exact)))?.label ?? null,
    [navGroups, pathname]
  );
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !activeGroupLabel) return;
    seededRef.current = true;
    setExpandedModules(new Set([activeGroupLabel]));
  }, [activeGroupLabel]);

  // Drawer on mobile: start closed (useLayoutEffect, not useEffect, so this runs before the
  // first paint — Redux's sidebarCollapsed initial state is `false`, so a plain useEffect would
  // let the drawer flash open for a frame on a fresh mobile page load), close again after each
  // navigation, and also close if the window is resized down below the drawer breakpoint.
  useLayoutEffect(() => {
    if (window.innerWidth < 768) dispatch(setSidebarCollapsed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) dispatch(setSidebarCollapsed(true));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the mobile drawer, same as tapping the backdrop.
  useEffect(() => {
    if (collapsed) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && window.innerWidth < 768) dispatch(setSidebarCollapsed(true));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collapsed, dispatch]);

  return (
    <>
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => dispatch(toggleSidebar())}
        />
      )}

      <motion.aside
        animate={{ width: collapsed ? 64 : 224 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col bg-sidebar border-r border-sidebar-border overflow-hidden transition-transform duration-200',
          'md:relative md:z-auto md:translate-x-0',
          collapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-sidebar-border px-4 gap-3',
            collapsed ? 'justify-center px-2' : ''
          )}
        >
          <img src="/logo.svg" alt="Logo" className={cn('object-contain', collapsed ? 'w-10' : 'h-12')} />
          {!collapsed && (
            <span className="font-bold text-lg text-white whitespace-nowrap overflow-hidden">Trackio</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-2 scrollbar-thin">
          {navGroups.map((group) => {
            const overviewRoute = MODULE_OVERVIEW_ROUTES[group.label.trim().toLowerCase()];
            const hasCategories = group.items.some((item) => item.hasCategory);
            // A module with categories and its own hub page collapses to a single module-label
            // link — browsing by category happens on the hub page (same as admin Sidebar).
            const onlyModuleLink = hasCategories && !!overviewRoute;
            const moduleCollapsed = !onlyModuleLink && !expandedModules.has(group.label);
            // Rejected-entries badge is the only one in this nav; surfaced on the header while
            // the module is folded away so a collapsed group can't hide it.
            const groupBadge = group.items.some((i) => i.to === ROUTES.EMPLOYEE_REJECTED_ENTRIES)
              ? rejectedCount
              : 0;
            return (
            <div key={group.label} className="space-y-px">
              {!collapsed && (
                overviewRoute ? (
                  // Hub-page module — label is a link to the hub, no chevron, no expanded list.
                  <Link
                    to={overviewRoute}
                    className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 whitespace-nowrap hover:text-sidebar-foreground/60 transition-colors"
                  >
                    <Folder className="h-3 w-3 shrink-0" />
                    <span className="truncate">{group.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleModule(group.label)}
                    className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 whitespace-nowrap hover:text-sidebar-foreground/60 transition-colors"
                  >
                    {moduleCollapsed
                      ? <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-150" />
                      : <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-150" />}
                    <span className="truncate">{group.label}</span>
                    {moduleCollapsed && groupBadge > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
                        {groupBadge > 99 ? '99+' : groupBadge}
                      </span>
                    )}
                  </button>
                )
              )}
              {/* Hub-link mode: in the icon rail, show only the hub's own icon-link. */}
              {onlyModuleLink ? (
                collapsed && (
                  <EmployeeNavItem
                    item={{ label: group.label, icon: Folder, to: overviewRoute, exact: true }}
                    active={isActive(overviewRoute, pathname, true)}
                    collapsed={collapsed}
                    badgeCount={0}
                  />
                )
              ) : (
                /* Icon rail has no group headers to fold, so it always lists every item. */
                (collapsed || !moduleCollapsed) && group.items.map((item) => (
                  <EmployeeNavItem
                    key={item.to}
                    item={item}
                    active={isActive(item.to, pathname, item.exact)}
                    collapsed={collapsed}
                    badgeCount={item.to === ROUTES.EMPLOYEE_REJECTED_ENTRIES ? rejectedCount : 0}
                  />
                ))
              )}
            </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/50',
              'hover:bg-sidebar-hover hover:text-sidebar-foreground transition-colors',
              collapsed && 'justify-center px-2'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>
    </>
  );
};

export default EmployeeSidebar;
