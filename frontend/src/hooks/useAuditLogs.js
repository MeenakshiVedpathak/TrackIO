import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/api/auditLogs.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useAuditLogs = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.AUDIT_LOGS(params),
    queryFn: () => auditLogsApi.getList(params),
    placeholderData: (prev) => prev,
  });

export const useAuditLogFilterOptions = () =>
  useQuery({
    queryKey: QUERY_KEYS.AUDIT_LOG_FILTER_OPTIONS,
    queryFn: () => auditLogsApi.getFilterOptions(),
    staleTime: 5 * 60 * 1000,
  });

export const useAuditLog = (id) =>
  useQuery({
    queryKey: QUERY_KEYS.AUDIT_LOG(id),
    queryFn: () => auditLogsApi.getOne(id),
    enabled: !!id,
  });

export const useAuditSessions = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.AUDIT_LOG_SESSIONS(params),
    queryFn: () => auditLogsApi.getSessions(params),
    placeholderData: (prev) => prev,
  });

export const useAuditDevices = (params) =>
  useQuery({
    queryKey: QUERY_KEYS.AUDIT_LOG_DEVICES(params),
    queryFn: () => auditLogsApi.getDevices(params),
    placeholderData: (prev) => prev,
  });
