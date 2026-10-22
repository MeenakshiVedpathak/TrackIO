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
import { ROLE_NAMES } from '@/constants/roleHierarchy';
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
  [ROLE_NAMES.MANAGER]: Users,
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
  const activeBuName = businessUnits.find((bu) => bu.id === activeBuId)?.name ?? null;

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
        <button className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/40 px-2.5 py-1.5 hover:bg-accent hover:border-border transition-all outline-none shadow-sm">
          <Avatar className="h-7 w-7 ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
              {getInitials(displayName || 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold leading-none text-foreground">{displayName}</p>
            {!showBuSwitcher && activeBuName && (
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{activeBuName}</p>
            )}
            {roleName && <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{roleName}</p>}
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0 overflow-hidden">
        <DropdownMenuLabel className="font-normal px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
                {getInitials(displayName || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
              {email && <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>}
              {!showBuSwitcher && activeBuName && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{activeBuName}</p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        {canSwitchRole && (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="px-4 pt-3 pb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Switch Role
              </p>
            </div>
            <div className="px-2 pb-2 space-y-0.5">
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
                      'gap-3 rounded-lg px-2.5 py-2 text-sm cursor-pointer',
                      // The active row keeps full contrast despite being disabled — `disabled`
                      // here only blocks a redundant re-switch, it is not an unavailable option.
                      isActive && 'bg-primary/10 text-primary font-medium opacity-100'
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {isSwitching ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : isActive ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
                        </span>
                      ) : (
                        <RoleIcon className="h-[18px] w-[18px] text-muted-foreground" />
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
        <div className="p-2">
          <DropdownMenuItem
            onClick={() => setIsChangePasswordOpen(true)}
            className="gap-3 rounded-lg px-2.5 py-2 text-sm cursor-pointer"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              <KeyRound className="h-[18px] w-[18px] text-primary" />
            </span>
            Change Password
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-2">
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={isLoggingOut}
            onSelect={(e) => e.preventDefault()}
            className="gap-3 rounded-lg px-2.5 py-2 text-sm cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {isLoggingOut ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <LogOut className="h-[18px] w-[18px]" />
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
