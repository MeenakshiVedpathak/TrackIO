import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { authApi } from '@/api/auth.api';
import { rolesApi } from '@/api/roles.api';
import { extractApiError } from '@/services/apiClient';
import { getInitials } from '@/utils/formatters';
import { ROUTES } from '@/constants/routes';
import { computeHomeRoute } from '@/constants/rbacForms';
import {
  KeyRound, LogOut, ChevronDown, ChevronRight, Loader2, Check,
  ShieldCheck, Building2, Briefcase, Users, User, HeartHandshake, FolderKanban,
} from 'lucide-react';
import { ROLE_NAMES, NO_COMPANY_ROLES } from '@/constants/roleHierarchy';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import ChangePasswordDialog from '@/components/profile/ChangePasswordDialog';
import { cn } from '@/utils/cn';

// One icon per role so the switcher reads at a glance instead of as a wall of text. Keyed by
// the exact `role_name` string the backend returns — an unlisted or renamed role falls back to
// the generic User icon rather than rendering nothing.
const ROLE_ICONS = {
  [ROLE_NAMES.PLATFORM_ADMIN]: ShieldCheck,
  [ROLE_NAMES.ADMIN]: ShieldCheck,
  [ROLE_NAMES.ENTITY_ADMIN]: Building2,
  [ROLE_NAMES.BU_ADMIN]: Building2,
  [ROLE_NAMES.BU_HEAD]: Building2,
  [ROLE_NAMES.PROJECT_ADMIN]: FolderKanban,
  [ROLE_NAMES.SERVICE_PO_ADMIN]: Briefcase,
  [ROLE_NAMES.TEAM_LEAD]: Users,
  [ROLE_NAMES.EMPLOYEE]: User,
  [ROLE_NAMES.HR]: HeartHandshake,
};

const UserMenu = () => {
  const {
    employee, logout, roleObjects, businessUnits, activeBuId, setActiveBu,
    assignedRoles, activeRoleId, canSwitchRole, applyRoleSwitch, setAccessibleForms,
  } = useAuth();
  const navigate = useNavigate();
  const { success, error } = useNotification();
  const queryClient = useQueryClient();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Which role id is mid-switch — drives the per-row spinner and blocks a second concurrent
  // switch. null whenever no switch is in flight.
  const [switchingRoleId, setSwitchingRoleId] = useState(null);

  // Employee Identity Migration: any employee with more than one BU gets the switcher now —
  // no longer gated to a single role. Switching BU updates the global selection immediately (no
  // re-login, no full page reload) and invalidates React Query so every BU-scoped screen
  // refetches against the newly-selected BU rather than showing stale data from the prior one
  // (same fix already used for the analogous stale-data bug on logout — see useAuth's
  // handleLogout).
  const showBuSwitcher = businessUnits.length > 1;
  const handleBuChange = (value) => {
    setActiveBu(Number(value));
    queryClient.invalidateQueries();
  };
  // Which root BU groups are expanded in the "BU & Sub BU" accordion below — seeded (once,
  // lazily) with EVERY root that has any Sub-BUs, so all of them start already open instead of
  // making the actor click each one open individually. Still independently collapsible/
  // re-expandable afterward via toggleRootExpanded below.
  const [expandedRoots, setExpandedRoots] = useState(() => {
    const rootsWithSubs = new Set();
    businessUnits.forEach((bu) => {
      if (bu.parent_business_unit_id) rootsWithSubs.add(bu.parent_business_unit_name);
    });
    return rootsWithSubs;
  });
  const toggleRootExpanded = (rootName) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootName)) next.delete(rootName);
      else next.add(rootName);
      return next;
    });
  };

  // Role switching keeps the session alive: no logout, no re-login, no password prompt, and
  // BU state is deliberately left untouched (see the switchRole reducer). Nothing about the
  // active role changes until the backend confirms the switch — on failure the previous role
  // stays exactly as it was.
  const handleSwitchRole = async (roleId) => {
    if (roleId === activeRoleId || switchingRoleId != null) return;
    setSwitchingRoleId(roleId);
    try {
      const res = await authApi.switchRole(roleId);
      const data = res?.data ?? {};
      applyRoleSwitch(data);

      // Accessible forms are role-derived and the reducer just cleared them, so repopulate for
      // the role we actually switched INTO. Read the role ids off the response rather than the
      // store: this runs in the same tick as the dispatch above, so `useAuth`'s roleIds is
      // still the pre-switch value here.
      const nextRoleIds = (data.roles ?? []).map((r) => r.id).filter((id) => id != null);
      let forms = data.forms ?? {};
      if (nextRoleIds.length) {
        try {
          forms = await rolesApi.getAccessibleForms(nextRoleIds);
        } catch {
          // Non-fatal — MainLayout's useSyncAccessibleForms retries when the map is empty.
        }
      }
      setAccessibleForms(forms);

      // Every cached query was fetched under the previous role's authorization — drop them so
      // each screen refetches against the new one (same reason the BU switcher does this).
      queryClient.invalidateQueries();

      // The current route may not be mapped to the new role, which would strand the user on a
      // Not Authorized screen. Land on the new role's own home instead, exactly as login does
      // once its role picker resolves.
      navigate(computeHomeRoute(forms), { replace: true });

      const switchedTo = assignedRoles.find((r) => r.id === roleId)?.name;
      success(switchedTo ? `Switched to ${switchedTo}.` : 'Role switched.');
    } catch (err) {
      // Keep the current role and the session — a failed switch is a no-op, not a logout.
      error(extractApiError(err));
    } finally {
      setSwitchingRoleId(null);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
    } catch {
      // Ignore server errors on logout
    } finally {
      logout();
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  const displayName = employee?.full_name ?? employee?.email ?? '';
  const email = employee?.email;
  const roleName = roleObjects[0]?.name ?? null;
  // Platform Admin/Admin/Entity Admin are company-less by design (see NO_COMPANY_ROLES and
  // ClientForm.jsx's identical check) — they're never really "mapped" to a BU the way a BU
  // Admin/Employee is, so no BU/Sub-BU line should render for them at all, regardless of whatever
  // (possibly stray) rows `businessUnits` happens to carry for that login. Confirmed live: the
  // seed "superadmin" Admin account was showing one anyway before this check existed.
  const isCompanyLessActor = roleObjects.some((r) => NO_COMPANY_ROLES.includes(r.name));
  // One entry per DISTINCT root BU this login is mapped to, each carrying its own id (for the
  // root row's click-to-switch below) and EVERY Sub-BU mapped under it (not just one — a login
  // can be mapped to more than one Sub-BU of the same root, e.g. both "DAS" and "IBM" under
  // "Data + AI"). A login mapped to several GENUINELY distinct root BUs (a BU Admin/BU Head with
  // more than one) lists all of them, each independently expandable/switchable (see
  // EmployeeList.jsx's getEmployeeBuNames/getEmployeeSubBuNames for the same grouping pattern
  // applied per-employee in that table).
  const buGroups = Array.from(
    businessUnits.reduce((map, bu) => {
      const isSub = !!bu.parent_business_unit_id;
      const rootName = isSub ? bu.parent_business_unit_name : bu.name;
      if (!map.has(rootName)) map.set(rootName, { rootId: null, rootName, subs: [] });
      const group = map.get(rootName);
      if (isSub) group.subs.push({ id: bu.id, name: bu.name });
      else group.rootId = bu.id;
      return map;
    }, new Map())
  ).map(([, group]) => group);

  return (
    <>
    <div className="flex items-center gap-2">
      {/* Global BU switcher — commented out, deliberately NOT deleted. Every Reports page now
          carries its own Business Unit filter in its Filters panel and defaults to all BUs (see
          components/common/BusinessUnitFilter), so this navbar control was the confusing half of
          the pair: it silently narrowed reports to one BU, which read as "no data" rather than
          "wrong BU". Restore it by uncommenting — showBuSwitcher/handleBuChange and the Select
          imports are all still in place above.
      {showBuSwitcher && (
        <Select value={activeBuId != null ? String(activeBuId) : ''} onValueChange={handleBuChange}>
          <SelectTrigger className="h-8 w-[160px] text-xs bg-muted/40 border-border/60">
            <SelectValue placeholder="Select BU" />
          </SelectTrigger>
          <SelectContent>
            {businessUnits.map((bu) => (
              <SelectItem key={bu.id} value={String(bu.id)}>{bu.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      */}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* clamp() sizing throughout this component, not fixed height/width/text/gap utilities —
            same fluid convention Topbar.jsx and ui/button.jsx already use, so this card shrinks
            and grows smoothly with the viewport instead of snapping at Tailwind's breakpoints. */}
        <button className="flex items-center gap-[clamp(0.4rem,0.6vw,0.625rem)] rounded-xl border border-border/60 bg-muted/40 px-[clamp(0.5rem,0.9vw,0.625rem)] py-[clamp(0.3rem,0.5vw,0.375rem)] hover:bg-accent hover:border-border transition-all outline-none shadow-sm">
          {/* Small "online" dot — always green here since this is always the CURRENT user's own
              menu (there's no presence/offline tracking involved), matching the reference design. */}
          <span className="relative shrink-0">
            <Avatar className="h-[clamp(1.5rem,2.4vw,1.75rem)] w-[clamp(1.5rem,2.4vw,1.75rem)] ring-2 ring-primary/20">
              <AvatarFallback className="bg-primary/15 text-primary text-[clamp(0.6875rem,0.85vw,0.75rem)] font-bold">
                {getInitials(displayName || 'U')}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-[clamp(0.375rem,0.5vw,0.5rem)] w-[clamp(0.375rem,0.5vw,0.5rem)] rounded-full bg-green-500 ring-2 ring-background" />
          </span>
          {/* min-w-0 + max-w-[160px] + truncate on each line: without a bounded width, `truncate`
              alone does nothing (the box just grows to fit its content instead of clipping it),
              so a long employee name or long BU name had nowhere to go but wrap onto an extra
              line — one more line than Topbar.jsx's header row budgeted for, which is what pushed
              this card below the navbar's border on those accounts. Capped here the same way the
              dropdown-content copy of this same data already is below (see DropdownMenuLabel). */}
          <div className="hidden sm:block text-left min-w-0 max-w-[160px]">
            <p className="text-[clamp(0.6875rem,0.85vw,0.75rem)] font-semibold leading-none text-foreground truncate">{displayName}</p>
            {/* Role, not the BU/Sub-BU breadcrumb this used to show — the active BU/Sub-BU is
                still fully visible as a chip pair right below in the dropdown header once opened,
                so it isn't lost, just not duplicated up here as well. */}
            {roleName && (
              <p className="mt-0.5 truncate text-[clamp(0.5625rem,0.7vw,0.625rem)] font-medium text-muted-foreground">
                {roleName}
              </p>
            )}
          </div>
          <ChevronDown className="h-[clamp(0.625rem,0.8vw,0.75rem)] w-[clamp(0.625rem,0.8vw,0.75rem)] text-muted-foreground hidden sm:block ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      {/* max-h + overflow-y-auto bound to Radix's own `--radix-dropdown-menu-content-available-height`
          (set automatically by the Popper positioner, no extra wiring needed) — with the profile
          header, the BU/Sub-BU list, every assigned role, Change Password, and Sign out all
          potentially stacked in one panel, a short viewport (or several expanded BU groups/roles)
          could push Sign out below the visible page entirely. This makes the WHOLE panel scroll
          internally once it would exceed the actual available space, instead of just overflowing
          past it — overrides the shared component's own `overflow-hidden` (see dropdown-menu.jsx),
          scoped to just this one heavy menu, not every dropdown in the app. */}
      <DropdownMenuContent
        align="end"
        className="w-[clamp(15rem,85vw,17rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto p-0"
      >
        <DropdownMenuLabel className="font-normal px-[clamp(0.75rem,1.1vw,0.875rem)] py-[clamp(0.5625rem,0.85vw,0.6875rem)]">
          <div className="flex items-center gap-[clamp(0.5rem,0.8vw,0.625rem)]">
            <span className="relative shrink-0">
              <Avatar className="h-[clamp(1.875rem,2.6vw,2.125rem)] w-[clamp(1.875rem,2.6vw,2.125rem)]">
                <AvatarFallback className="bg-primary/15 text-primary text-[clamp(0.8125rem,0.95vw,0.875rem)] font-bold">
                  {getInitials(displayName || 'U')}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 h-[clamp(0.625rem,0.8vw,0.75rem)] w-[clamp(0.625rem,0.8vw,0.75rem)] rounded-full bg-green-500 ring-2 ring-background" />
            </span>
            <div className="min-w-0">
              <p className="text-[clamp(0.8125rem,0.95vw,0.875rem)] font-semibold leading-tight truncate">{displayName}</p>
              {email && <p className="text-[clamp(0.6875rem,0.85vw,0.75rem)] text-muted-foreground truncate mt-0.5">{email}</p>}
              {/* No BU/Sub-BU chip pair here anymore — it duplicated the "BU & Sub BU" section
                  right below this header, which already shows every mapped BU/Sub-BU. */}
            </div>
          </div>
        </DropdownMenuLabel>
        {/* Switch Business Unit & Sub Unit — display only, NOT an actual BU switcher: every root
            BU this login is mapped to, each an expandable group listing its own Sub-BUs (if it
            has any), with the currently active one marked by a checkmark badge. Expanding/
            collapsing a group is the only interaction here; clicking a BU/Sub-BU row itself does
            nothing — it deliberately does NOT call setActiveBu/handleBuChange. (The commented-out
            global Select above is the actual switcher, left disabled for the reason noted there;
            this section is purely informational, so a row is a plain non-interactive <div>,
            never a <button>, except the root row of a group that has Sub-BUs to expand.) */}
        {!isCompanyLessActor && buGroups.length > 0 && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="flex items-center justify-between gap-2 px-[clamp(0.75rem,1.1vw,0.875rem)] pt-2 pb-1">
              <p className="text-[clamp(0.5625rem,0.7vw,0.625rem)] font-semibold uppercase tracking-wider text-muted-foreground">
                BU &amp; Sub BU
              </p>
              {roleName && (
                <p className="shrink-0 text-[clamp(0.5rem,0.65vw,0.5625rem)] text-muted-foreground">
                  Current Role: <span className="font-medium text-primary">{roleName}</span>
                </p>
              )}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto px-2 pb-1.5">
              {buGroups.map((g) => {
                const hasSubs = g.subs.length > 0;
                const isExpanded = expandedRoots.has(g.rootName);
                // No "active" highlight/checkmark on any row here — that's what the chip pair in
                // the header right above already shows, and repeating it in this plain reference
                // list read as if the list itself were still a switcher (it isn't; see the section
                // comment above). Every row renders identically regardless of activeBuId.
                const RootTag = hasSubs ? 'button' : 'div';
                return (
                  <div key={g.rootName} className="overflow-hidden rounded-lg border border-border/60">
                    <RootTag
                      type={hasSubs ? 'button' : undefined}
                      onClick={hasSubs ? () => toggleRootExpanded(g.rootName) : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 px-[clamp(0.4rem,0.75vw,0.5rem)] py-[clamp(0.3rem,0.55vw,0.375rem)] text-left text-[clamp(0.75rem,0.85vw,0.8125rem)] transition-colors',
                        hasSubs && 'hover:bg-accent'
                      )}
                    >
                      <Building2 className="h-[clamp(0.75rem,0.9vw,0.875rem)] w-[clamp(0.75rem,0.9vw,0.875rem)] shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{g.rootName}</span>
                      {hasSubs && (
                        <ChevronDown
                          className={cn(
                            'h-[clamp(0.6875rem,0.85vw,0.8125rem)] w-[clamp(0.6875rem,0.85vw,0.8125rem)] shrink-0 text-muted-foreground transition-transform',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      )}
                    </RootTag>
                    {hasSubs && isExpanded && (
                      <div className="space-y-0.5 border-t border-border/60 bg-muted/20 p-1">
                        {g.subs.map((sub) => (
                          <div key={sub.id} className="flex w-full items-center gap-2 rounded-md px-[clamp(0.4rem,0.75vw,0.5rem)] py-[clamp(0.2rem,0.4vw,0.25rem)] text-[clamp(0.75rem,0.85vw,0.8125rem)]">
                            <Building2 className="h-[clamp(0.6875rem,0.85vw,0.8125rem)] w-[clamp(0.6875rem,0.85vw,0.8125rem)] shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {canSwitchRole && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="px-[clamp(0.75rem,1.1vw,0.875rem)] pt-2 pb-1">
              <p className="text-[clamp(0.5625rem,0.7vw,0.625rem)] font-semibold uppercase tracking-wider text-muted-foreground">
                Switch Role
              </p>
            </div>
            <div className="px-2 pb-1.5 space-y-0.5">
              {assignedRoles.map((role) => {
                const isActive = role.id === activeRoleId;
                const isSwitching = switchingRoleId === role.id;
                const RoleIcon = ROLE_ICONS[role.name] ?? User;
                return (
                  <DropdownMenuItem
                    key={role.id}
                    onClick={() => handleSwitchRole(role.id)}
                    onSelect={(e) => e.preventDefault()}
                    disabled={isActive || switchingRoleId != null}
                    className={cn(
                      'gap-2 rounded-lg px-2 py-[clamp(0.3rem,0.5vw,0.375rem)] text-[clamp(0.8125rem,0.95vw,0.875rem)] cursor-pointer',
                      // The active row keeps full contrast despite being disabled — `disabled`
                      // here only blocks a redundant re-switch, it is not an unavailable option.
                      // Needs BOTH `opacity-100` (plain) AND `data-[disabled]:opacity-100` (the
                      // exact variant dropdown-menu.jsx's own `data-[disabled]:opacity-50` uses) —
                      // a plain `opacity-100` alone doesn't beat a `data-[disabled]:` rule, since
                      // they're different Tailwind variants and tailwind-merge only dedupes within
                      // the same one; without the matching variant the row rendered faded despite
                      // this override, which is exactly what was reported.
                      isActive && 'bg-primary/10 text-primary font-medium opacity-100 data-[disabled]:opacity-100'
                    )}
                  >
                    <span className="flex h-[clamp(1.25rem,1.6vw,1.5rem)] w-[clamp(1.25rem,1.6vw,1.5rem)] shrink-0 items-center justify-center">
                      {isSwitching ? (
                        <Loader2 className="h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] animate-spin text-primary" />
                      ) : isActive ? (
                        <span className="flex h-[clamp(1.25rem,1.6vw,1.5rem)] w-[clamp(1.25rem,1.6vw,1.5rem)] items-center justify-center rounded-full bg-primary">
                          <Check className="h-[clamp(0.75rem,0.95vw,0.875rem)] w-[clamp(0.75rem,0.95vw,0.875rem)] text-primary-foreground" strokeWidth={3} />
                        </span>
                      ) : (
                        <RoleIcon className="h-[clamp(1rem,1.2vw,1.125rem)] w-[clamp(1rem,1.2vw,1.125rem)] text-muted-foreground" />
                      )}
                    </span>
                    <span className="leading-snug">{role.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          </>
        )}
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1.5">
          <DropdownMenuItem
            onClick={() => setIsChangePasswordOpen(true)}
            className="gap-2 rounded-lg px-2 py-[clamp(0.3rem,0.5vw,0.375rem)] text-[clamp(0.8125rem,0.95vw,0.875rem)] cursor-pointer"
          >
            <span className="flex h-[clamp(1.25rem,1.6vw,1.5rem)] w-[clamp(1.25rem,1.6vw,1.5rem)] shrink-0 items-center justify-center">
              <KeyRound className="h-[clamp(1rem,1.2vw,1.125rem)] w-[clamp(1rem,1.2vw,1.125rem)] text-primary" />
            </span>
            Change Password
            <ChevronRight className="ml-auto h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1.5">
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={isLoggingOut}
            onSelect={(e) => e.preventDefault()}
            className="gap-2 rounded-lg px-2 py-[clamp(0.3rem,0.5vw,0.375rem)] text-[clamp(0.8125rem,0.95vw,0.875rem)] cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <span className="flex h-[clamp(1.25rem,1.6vw,1.5rem)] w-[clamp(1.25rem,1.6vw,1.5rem)] shrink-0 items-center justify-center">
              {isLoggingOut ? (
                <Loader2 className="h-[clamp(1rem,1.2vw,1.125rem)] w-[clamp(1rem,1.2vw,1.125rem)] animate-spin" />
              ) : (
                <LogOut className="h-[clamp(1rem,1.2vw,1.125rem)] w-[clamp(1rem,1.2vw,1.125rem)]" />
              )}
            </span>
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>

    <ChangePasswordDialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen} />
    </>
  );
};

export default UserMenu;
