import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchUserPermissions } from '../api/queries';

const REPORT_KEYS = [
  'view_revenue_report',
  'view_occupancy_report',
  'view_guest_report',
  'view_today_overview',
  'view_room_performance_report',
  'view_reservation_report',
  'view_clv_report',
  'view_trends_report',
  'view_stay_duration_report',
  'view_upsell_report',
  'view_pipeline_report',
  'view_pl_report',
  'view_staff_sales_report',
  'view_expense_report',
  'view_cancellation_report',
  'view_reservationreminder',
  'view_daily_settlement',
  'manage_daily_settlement',
];

const ADMIN_KEYS = [
  'add_user', 'change_user', 'delete_user', 'view_user',
  'add_group', 'change_group', 'delete_group', 'view_group',
];

const OPS_KEYS = [
  'view_rooms', 'view_roomstaylogs', 'view_customers',
  'view_expense', 'view_roomncrequest', 'view_cashwithdrawal',
  'view_reservation',
];

const SETTINGS_KEYS = [
  'view_roomtype', 'view_roomspricechart', 'view_countrycodes',
  'view_amenity', 'view_configurations', 'view_paymentmethod',
];

export default function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.userPermissions,
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });

  return {
    permissions: data || {},
    isLoading,
    username: data?.username || '',
    firstName: data?.first_name || '',
    lastName: data?.last_name || '',
    email: data?.email || '',
    hasAnyReport: data
      ? REPORT_KEYS.some((k) => data[k]) || data.is_superuser
      : false,
    hasAnyAdmin: data
      ? ADMIN_KEYS.some((k) => data[k]) || data.is_superuser
      : false,
    hasAnyOps: data
      ? OPS_KEYS.some((k) => data[k]) || data.is_superuser
      : false,
    hasAnySettings: data
      ? SETTINGS_KEYS.some((k) => data[k]) || data.is_superuser
      : false,
  };
}
