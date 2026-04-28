import api from './client';

export const QUERY_KEYS = {
  rooms: ['rooms'],
  room: (id) => ['room', String(id)],
  roomStatusLogs: (id) => ['room-status-logs', String(id)],
  roomTypes: ['room-types'],
  activeLogs: ['stay-logs'],
  reservations: ['reservations'],
  roomReservations: (roomId) => ['reservations', String(roomId)],
  customers: ['customers'],
  countryCodes: ['country-codes'],
  groupCustomers: (groupId) => ['group-customers', groupId],
  priceChart: ['price-chart'],
  configurations: ['configurations'],
  amenities: ['amenities'],
  paymentMethods: ['payment-methods'],
  stayLogAmenities: (logId) => ['stay-log-amenities', logId],
  users: ['users'],
  groups: ['groups'],
  permissions: ['permissions'],
  reminders: ['reminders'],
};

export const fetchRooms = () => api.get('/v1/rooms/').then(r => r.data);
export const fetchRoom = (id) => api.get(`/v1/room/${id}/`).then(r => r.data);
export const fetchRoomStatusLogs = (id) => api.get(`/v1/room/${id}/status-logs/`).then(r => r.data);
export const fetchRoomTypes = () => api.get('/v1/room/types/').then(r => r.data);
export const fetchActiveLogs = () => api.get('/v1/stay-logs/').then(r => r.data);
export const fetchReservations = () => api.get('/v1/reservations/').then(r => r.data);
export const fetchRoomReservations = (id) => api.get(`/v1/reservations/?room=${id}`).then(r => r.data);
export const fetchAllCustomers = () => api.get('/v1/customers/').then(r => r.data);
export const searchCustomers = (search) => api.get('/v1/customers/', { params: { search } }).then(r => r.data);
export const fetchCountryCodes = () => api.get('/v1/country/codes/').then(r => r.data);
export const fetchGroupCustomers = (groupId) => api.get(`/v1/group/${groupId}/customers/`).then(r => r.data);
export const fetchPriceChart = () => api.get('/v1/price/chart/').then(r => r.data);
export const fetchConfigurations = () => api.get('/v1/configurations/').then(r => r.data);
export const fetchAmenities = () => api.get('/v1/amenities/').then(r => r.data);
export const fetchPaymentMethods = (activeOnly = false) => api.get('/v1/payment-methods/', { params: activeOnly ? { active: 'true' } : {} }).then(r => r.data);
export const fetchStayLogAmenities = (logId) => api.get(`/v1/stay-logs/${logId}/amenities/`).then(r => r.data);
export const fetchUsers = () => api.get('/v1/users/').then(r => r.data);
export const fetchGroups = () => api.get('/v1/groups/').then(r => r.data);
export const fetchPermissions = () => api.get('/v1/permissions/').then(r => r.data);

export const REPORT_QUERY_KEYS = {
  userPermissions: ['user-permissions'],
  revenueReport: (params) => ['revenue-report', params],
  occupancyReport: (params) => ['occupancy-report', params],
  guestReport: (params) => ['guest-report', params],
  todayOverview: ['today-overview'],
  roomPerformance: (params) => ['room-performance', params],
  reservationFulfillment: (params) => ['reservation-fulfillment', params],
  clvReport: (params) => ['clv-report', params],
  trendsReport: (params) => ['trends-report', params],
  stayDuration: (params) => ['stay-duration', params],
  upsellReport: (params) => ['upsell-report', params],
  pipelineReport: ['pipeline-report'],
  plReport: (params) => ['pl-report', params],
  staffSales: (params) => ['staff-sales', params],
  cashReconciliation: (params) => ['cash-reconciliation', params],
  expenseReport: (params) => ['expense-report', params],
};

export const fetchUserPermissions = () => api.get('/v1/user/permissions/').then(r => r.data);
export const fetchRevenueReport = (params) => api.get('/v1/reports/revenue/', { params }).then(r => r.data);
export const fetchOccupancyReport = (params) => api.get('/v1/reports/occupancy/', { params }).then(r => r.data);
export const fetchGuestReport = (params) => api.get('/v1/reports/guests/', { params }).then(r => r.data);
export const fetchTodayOverview = () => api.get('/v1/reports/today/').then(r => r.data);
export const fetchRoomPerformance = (params) => api.get('/v1/reports/room-performance/', { params }).then(r => r.data);
export const fetchReservationFulfillment = (params) => api.get('/v1/reports/reservation-fulfillment/', { params }).then(r => r.data);
export const fetchCLVReport = (params) => api.get('/v1/reports/clv/', { params }).then(r => r.data);
export const fetchTrendsReport = (params) => api.get('/v1/reports/trends/', { params }).then(r => r.data);
export const fetchStayDuration = (params) => api.get('/v1/reports/stay-duration/', { params }).then(r => r.data);
export const fetchUpsellReport = (params) => api.get('/v1/reports/upsell/', { params }).then(r => r.data);
export const fetchPipelineReport = () => api.get('/v1/reports/pipeline/').then(r => r.data);

// New finance/operations queries
export const QUERY_KEYS_OPS = {
  ncRequests: ['nc-requests'],
  cashWithdrawals: ['cash-withdrawals'],
  expenses: (params) => ['expenses', params],
  stayLogPayments: (logId) => ['stay-log-payments', logId],
  stayHistory: (params) => ['stay-history', params],
  gstReport: (params) => ['gst-report', params],
};

export const fetchNcRequests = () => api.get('/v1/nc-requests/').then(r => r.data);
export const fetchCashWithdrawals = () => api.get('/v1/cash-withdrawals/').then(r => r.data);
export const fetchExpenses = (params) => api.get('/v1/expenses/', { params }).then(r => r.data);
export const fetchStayLogPayments = (logId) => api.get(`/v1/stay-logs/${logId}/payments/`).then(r => r.data);
export const fetchPLReport = (params) => api.get('/v1/finance/pl/', { params }).then(r => r.data);
export const fetchStaffSales = (params) => api.get('/v1/finance/staff-sales/', { params }).then(r => r.data);
export const fetchCashReconciliation = (params) => api.get('/v1/finance/cash-reconciliation/', { params }).then(r => r.data);
export const fetchExpenseReport = (params) => api.get('/v1/finance/expenses/', { params }).then(r => r.data);
export const fetchStayHistory = (params) => api.get('/v1/stay-logs/history/', { params }).then(r => r.data);
export const fetchGSTReport = (params) => api.get('/v1/reports/gst/', { params }).then(r => r.data);
export const fetchDueReminders = () => api.get('/v1/reminders/').then(r => r.data);
