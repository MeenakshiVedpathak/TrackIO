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
import { ChevronLeft, ChevronRight, ChevronDown, Folder, LayoutDashboard } from 'lucide-react';
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
            label: cfg.label ?? form.name,
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

// Styled to match PinnedDashboardItem's gradient pill below — the whole sidebar (Dashboard
// included) shares one "active" treatment now instead of Dashboard alone getting the gradient
// while every other item fell back to the plain flat-blue .nav-item.active class.
const EmployeeNavItem = ({ item, active, collapsed, badgeCount }) => {
  const [hovered, setHovered] = useState(false);
  const hasBadge = badgeCount > 0;

  return (
    <Link
      to={item.to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
        collapsed && 'justify-center px-2',
        active
          ? 'text-white shadow-lg shadow-primary/30'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground'
      )}
      style={active ? { background: 'linear-gradient(135deg, #6d28d9, #2563eb)' } : undefined}
      title={collapsed ? `${item.label}${hasBadge ? ` (${badgeCount})` : ''}` : undefined}
    >
      <span className="relative shrink-0">
        <item.icon className={cn('shrink-0', collapsed ? 'h-[clamp(1.125rem,1.4vw,1.25rem)] w-[clamp(1.125rem,1.4vw,1.25rem)]' : 'h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]')} />
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

// "Employee Dashboard" is pinned above every module group (its own always-visible entry
// point, styled like the reference design's gradient "Dashboard" pill) instead of sitting
// inside whichever module it happens to be mapped under.
const isDashboardItem = (item) => item.to === ROUTES.EMPLOYEE_DASHBOARD;

const PinnedDashboardItem = ({ active, collapsed }) => (
  <Link
    to={ROUTES.EMPLOYEE_DASHBOARD}
    className={cn(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
      collapsed && 'justify-center px-2',
      active
        ? 'text-white shadow-lg shadow-primary/30'
        : 'text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground'
    )}
    style={active ? { background: 'linear-gradient(135deg, #6d28d9, #2563eb)' } : undefined}
    title={collapsed ? 'Dashboard' : undefined}
  >
    <LayoutDashboard className={cn('shrink-0', collapsed ? 'h-[clamp(1.125rem,1.4vw,1.25rem)] w-[clamp(1.125rem,1.4vw,1.25rem)]' : 'h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]')} />
    {!collapsed && <span>Dashboard</span>}
  </Link>
);

const EmployeeSidebar = () => {
  const dispatch = useDispatch();
  const collapsed = useSelector(selectSidebarCollapsed);
  const { pathname } = useLocation();
  const { accessibleForms } = useAuth();
  const { moduleRank, formRank, categoryOf } = useMenuRank();
  const allNavGroups = useMemo(() => buildNavGroups(accessibleForms, { moduleRank, formRank, categoryOf }), [accessibleForms, moduleRank, formRank, categoryOf]);
  const hasDashboardItem = useMemo(() => allNavGroups.some((g) => g.items.some(isDashboardItem)), [allNavGroups]);
  // Every other group, with the Dashboard item filtered out of whichever one it was mapped
  // under — a group left with no items after that (e.g. one that only ever held Dashboard)
  // is dropped entirely rather than rendered as an empty header.
  const navGroups = useMemo(
    () => allNavGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => !isDashboardItem(i)) }))
      .filter((g) => g.items.length > 0),
    [allNavGroups]
  );

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
          'fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-sidebar-border overflow-hidden transition-transform duration-200',
          'md:relative md:z-auto md:translate-x-0',
          collapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
        )}
        style={{ background: 'linear-gradient(180deg, hsl(222 47% 9%) 0%, hsl(230 42% 13%) 55%, hsl(240 38% 11%) 100%)' }}
      >
        {/* Decorative glow + contour lines, purely visual — sits behind the logo/nav/collapse
            content (all given relative z-10 below) so it never intercepts clicks. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-2/3 overflow-hidden">
          <div
            className="absolute inset-x-0 bottom-0 h-full opacity-40 blur-2xl"
            style={{ background: 'radial-gradient(60% 55% at 50% 100%, rgba(99,102,241,0.45), transparent 70%)' }}
          />
          <svg className="absolute inset-x-0 bottom-0 h-2/3 w-full" viewBox="0 0 224 200" preserveAspectRatio="none" fill="none">
            <path d="M-10 140 C 50 100, 90 170, 140 130 S 220 90, 240 130" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
            <path d="M-10 170 C 60 130, 100 200, 150 160 S 210 120, 240 160" stroke="white" strokeOpacity="0.05" strokeWidth="1.5" />
          </svg>
        </div>

        <div
          className={cn(
            'relative z-10 flex shrink-0 items-center border-b border-sidebar-border px-4 h-[clamp(3.25rem,6vw,4rem)]',
            collapsed ? 'justify-center px-2' : ''
          )}
        >
          <div
            className={cn(
              'flex shrink-0 items-center overflow-hidden rounded-md',
              collapsed ? 'h-[clamp(2.25rem,4.5vw,2.75rem)] w-[clamp(2.25rem,4.5vw,2.75rem)] justify-center' : 'h-[clamp(2.75rem,5.5vw,3.5rem)] justify-start px-1'
            )}
          >
            <img
              src="/logo-dark.png"
              alt="Trackio"
              className={collapsed ? 'h-full w-full object-cover object-left' : 'h-full w-auto object-contain'}
            />
          </div>
        </div>

        {hasDashboardItem && (
          <div className={cn('relative z-10 shrink-0 px-2 pt-2', collapsed && 'px-2')}>
            <PinnedDashboardItem active={isActive(ROUTES.EMPLOYEE_DASHBOARD, pathname, true)} collapsed={collapsed} />
          </div>
        )}

        <nav className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-2 scrollbar-thin">
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
                    className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-[clamp(0.5625rem,0.7vw,0.625rem)] font-semibold uppercase tracking-widest text-sidebar-foreground/30 whitespace-nowrap hover:text-sidebar-foreground/60 transition-colors"
                  >
                    <Folder className="h-3 w-3 shrink-0" />
                    <span className="truncate">{group.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleModule(group.label)}
                    className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-[clamp(0.5625rem,0.7vw,0.625rem)] font-semibold uppercase tracking-widest text-sidebar-foreground/30 whitespace-nowrap hover:text-sidebar-foreground/60 transition-colors"
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
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[clamp(0.6875rem,0.85vw,0.75rem)] text-sidebar-foreground/50',
              'hover:bg-sidebar-hover hover:text-sidebar-foreground transition-colors',
              collapsed && 'justify-center px-2'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]" />
            ) : (
              <>
                <ChevronLeft className="h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]" />
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
