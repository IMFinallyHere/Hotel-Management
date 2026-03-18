import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchUserPermissions } from '../api/queries';

export default function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.userPermissions,
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });

  return {
    permissions: data || {},
    isLoading,
    hasAnyReport: data
      ? Object.values(data).some(Boolean)
      : false,
  };
}
