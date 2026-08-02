import { AppShell, NavLink, Title, Group, Avatar, Text, Burger, Menu, Badge, Box, ActionIcon, Indicator, Drawer, Stack, Button, Divider, Center, Loader } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconHome, IconBuildingBank, IconUsers, IconSettings,
  IconLogin, IconLogout, IconCalendar, IconCurrencyRupee,
  IconWorld, IconUser, IconChartBar, IconReportAnalytics,
  IconPercentage, IconUsersGroup, IconDashboard,
  IconBuildingSkyscraper, IconCalendarEvent, IconHeartHandshake,
  IconTrendingUp, IconClock, IconBedFilled, IconTimeline,
  IconShieldLock, IconUserCog, IconLock, IconPackage,
  IconBan, IconCash, IconReceipt, IconScale, IconCoinRupee, IconBell, IconCalendarStats, IconTag,
  IconMoneybag, IconReportMoney, IconTags,
} from '@tabler/icons-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ProtectedRoute from './components/ProtectedRoute';

const Login                = lazy(() => import('./pages/Login'));
const RoomTypes            = lazy(() => import('./pages/RoomTypes'));
const RoomDashboard        = lazy(() => import('./pages/RoomDashboard'));
const RoomDetail           = lazy(() => import('./pages/RoomDetail'));
const PriceChart           = lazy(() => import('./pages/PriceChart'));
const Customers            = lazy(() => import('./pages/Customers'));
const CountryCodes         = lazy(() => import('./pages/CountryCodes'));
const Configurations       = lazy(() => import('./pages/Configurations'));
const Checkout             = lazy(() => import('./pages/Checkout'));
const TodayOverview        = lazy(() => import('./pages/TodayOverview'));
const RevenueReport        = lazy(() => import('./pages/RevenueReport'));
const OccupancyReport      = lazy(() => import('./pages/OccupancyReport'));
const GuestAnalytics       = lazy(() => import('./pages/GuestAnalytics'));
const RoomPerformance      = lazy(() => import('./pages/RoomPerformance'));
const ReservationFulfillment = lazy(() => import('./pages/ReservationFulfillment'));
const CustomerLifetimeValue  = lazy(() => import('./pages/CustomerLifetimeValue'));
const SeasonalTrends       = lazy(() => import('./pages/SeasonalTrends'));
const StayDuration         = lazy(() => import('./pages/StayDuration'));
const ExtraBedUpsell       = lazy(() => import('./pages/ExtraBedUpsell'));
const BookingPipeline      = lazy(() => import('./pages/BookingPipeline'));
const UserManagement       = lazy(() => import('./pages/UserManagement'));
const GroupManagement      = lazy(() => import('./pages/GroupManagement'));
const Amenities            = lazy(() => import('./pages/Amenities'));
const PaymentMethods       = lazy(() => import('./pages/PaymentMethods'));
const ExpenseCategories    = lazy(() => import('./pages/ExpenseCategories'));
const IncomeCategories     = lazy(() => import('./pages/IncomeCategories'));
const PermissionOverview   = lazy(() => import('./pages/PermissionOverview'));
const NCRequests           = lazy(() => import('./pages/NCRequests'));
const CashDrawer           = lazy(() => import('./pages/CashDrawer'));
const Expenses             = lazy(() => import('./pages/Expenses'));
const Income                = lazy(() => import('./pages/Income'));
const ProfitLoss           = lazy(() => import('./pages/finance/ProfitLoss'));
const StaffSales           = lazy(() => import('./pages/finance/StaffSales'));
const ExpenseReport        = lazy(() => import('./pages/finance/ExpenseReport'));
const IncomeReport         = lazy(() => import('./pages/finance/IncomeReport'));
const History              = lazy(() => import('./pages/History'));
const GSTReport            = lazy(() => import('./pages/GSTReport'));
const BulkBooking          = lazy(() => import('./pages/BulkBookingModal'));
const Reservations         = lazy(() => import('./pages/Reservations'));
const CancellationReport   = lazy(() => import('./pages/CancellationReport'));
const Settlement           = lazy(() => import('./pages/Settlement'));
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import usePermissions from './hooks/usePermissions';
import { QUERY_KEYS, fetchDueReminders } from './api/queries';
import api from './api/client';
import { notifySuccess, notifyError } from './api/notify';

// Force white text on dark sidebar — inline JSX label bypasses Mantine's CSS var cascade
const NL = {
  styles: {
    root: { borderRadius: 6 },
    section: { color: 'rgba(255,255,255,0.6)' },
    chevron: { color: 'rgba(255,255,255,0.5)' },
  },
};
const nl = (text) => <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>{text}</span>;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const queryClient = useQueryClient();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const [reminderDrawerOpen, setReminderDrawerOpen] = useState(false);
  const { permissions, username, firstName, lastName, email, hasAnyReport, hasAnyAdmin, hasAnyOps, hasAnySettings } = usePermissions();

  const canViewReminders = permissions.view_reservationreminder || permissions.is_superuser;

  const { data: reminders = [] } = useQuery({
    queryKey: QUERY_KEYS.reminders,
    queryFn: fetchDueReminders,
    refetchOnWindowFocus: true,
    enabled: canViewReminders,
  });

  useEffect(() => {
    if (canViewReminders && reminders.length > 0) setReminderDrawerOpen(true);
  }, [reminders.length, canViewReminders]);

  const dismissMutation = useMutation({
    mutationFn: (id) => api.patch(`/v1/reminder/${id}/`, { is_dismissed: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.reminders }),
    onError: () => notifyError('Failed to dismiss reminder.'),
  });

  const handleLogout = () => {
    queryClient.clear();
    localStorage.clear();
    navigate('/login');
  };

  const roomsActive = path === '/rooms' || path.startsWith('/rooms/');
  const operationsActive = roomsActive || path === '/checkout' || path === '/customers' || path === '/nc-requests' || path === '/cash-drawer' || path === '/expenses' || path === '/income' || path === '/history' || path === '/bulk-booking' || path === '/reservations';
  const configActive = ['/configurations', '/amenities', '/room-types', '/price-chart', '/country-codes', '/payment-methods', '/expense-categories', '/income-categories'].includes(path);
  const reportsActive = path.startsWith('/reports');
  const financeActive = path.startsWith('/finance');
  const adminActive = path.startsWith('/admin');
  const hasAnyFinance = permissions.view_pl_report || permissions.view_staff_sales_report || permissions.view_expense_report || permissions.view_income_report || permissions.view_daily_settlement || permissions.is_superuser;

  const initials = firstName
    ? firstName.slice(0, 2).toUpperCase()
    : username.slice(0, 2).toUpperCase();

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const roleBadge = permissions.is_superuser
    ? { label: 'Superuser', color: 'violet' }
    : permissions.is_staff
      ? { label: 'Staff', color: 'blue' }
      : { label: 'User', color: 'teal' };

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
            <Title order={4}>Hotel Manager</Title>
          </Group>
          <Group gap="xs">
            {canViewReminders && (
              <Indicator
                label={reminders.length}
                size={18}
                disabled={reminders.length === 0}
                color="red"
                inline
                styles={{ indicator: { fontSize: 10, fontWeight: 700 } }}
              >
                <ActionIcon
                  variant={reminders.length > 0 ? 'light' : 'subtle'}
                  color={reminders.length > 0 ? 'orange' : 'gray'}
                  size="lg"
                  radius="xl"
                  onClick={() => setReminderDrawerOpen(true)}
                >
                  <IconBell size={18} />
                </ActionIcon>
              </Indicator>
            )}
            <Menu shadow="md" width={220} position="bottom-end" withArrow>
              <Menu.Target>
                <Avatar size="sm" radius="xl" color="teal" style={{ cursor: 'pointer' }}>
                  {initials}
                </Avatar>
              </Menu.Target>
              <Menu.Dropdown>
                <Box px="sm" py="xs">
                  <Group gap="sm" wrap="nowrap">
                    <Avatar size="md" radius="xl" color="teal">{initials}</Avatar>
                    <div>
                      {fullName && <Text size="sm" fw={600} lh={1.3}>{fullName}</Text>}
                      <Text size="xs" c="dimmed" lh={1.3}>@{username}</Text>
                      <Badge size="xs" color={roleBadge.color} variant="light" mt={2}>
                        {roleBadge.label}
                      </Badge>
                    </div>
                  </Group>
                </Box>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={handleLogout}>
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" className="dark-sidebar" style={{ background: '#1a1b1e', overflowY: 'auto' }}>
        {hasAnyOps && (
        <NavLink
          {...NL}
          label={nl('Operations')}
          leftSection={<IconCalendar size={16} color="rgba(255,255,255,0.6)" />}
          defaultOpened={operationsActive}
        >
          {(permissions.view_rooms || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('All Rooms')}
            leftSection={<IconBuildingBank size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/rooms'); closeNav(); }}
            active={roomsActive}
          />
          )}
          {(permissions.view_reservation || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Reservations')}
            leftSection={<IconCalendarStats size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/reservations'); closeNav(); }}
            active={path === '/reservations'}
          />
          )}
          {(permissions.view_roomstaylogs || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Checkout')}
            leftSection={<IconLogout size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/checkout'); closeNav(); }}
            active={path === '/checkout'}
          />
          )}
          {(permissions.view_customers || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Customers')}
            leftSection={<IconUsers size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/customers'); closeNav(); }}
            active={path === '/customers'}
          />
          )}
          {(permissions.view_expense || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Expenses')}
            leftSection={<IconReceipt size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/expenses'); closeNav(); }}
            active={path === '/expenses'}
          />
          )}
          {(permissions.view_income || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Income')}
            leftSection={<IconMoneybag size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/income'); closeNav(); }}
            active={path === '/income'}
          />
          )}
          {(permissions.view_roomncrequest || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('NC Requests')}
            leftSection={<IconBan size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/nc-requests'); closeNav(); }}
            active={path === '/nc-requests'}
          />
          )}
          {(permissions.view_cashwithdrawal || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Cash Drawer')}
            leftSection={<IconCash size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/cash-drawer'); closeNav(); }}
            active={path === '/cash-drawer'}
          />
          )}
          {(permissions.view_roomstaylogs || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Stay History')}
            leftSection={<IconTimeline size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/history'); closeNav(); }}
            active={path === '/history'}
          />
          )}
        </NavLink>
        )}

        {hasAnyReport && (
          <NavLink
            {...NL}
            label={nl('Reports')}
            leftSection={<IconChartBar size={16} color="rgba(255,255,255,0.6)" />}
            defaultOpened={reportsActive}
          >
            {permissions.view_today_overview && (
              <NavLink
                {...NL}
                label={nl("Today's Overview")}
                leftSection={<IconDashboard size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/today'); closeNav(); }}
                active={path === '/reports/today'}
              />
            )}
            {permissions.view_revenue_report && (
              <NavLink
                {...NL}
                label={nl('Revenue')}
                leftSection={<IconCurrencyRupee size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/revenue'); closeNav(); }}
                active={path === '/reports/revenue'}
              />
            )}
            {permissions.view_occupancy_report && (
              <NavLink
                {...NL}
                label={nl('Occupancy')}
                leftSection={<IconPercentage size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/occupancy'); closeNav(); }}
                active={path === '/reports/occupancy'}
              />
            )}
            {permissions.view_guest_report && (
              <NavLink
                {...NL}
                label={nl('Guest Analytics')}
                leftSection={<IconUsersGroup size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/guests'); closeNav(); }}
                active={path === '/reports/guests'}
              />
            )}
            {permissions.view_room_performance_report && (
              <NavLink
                {...NL}
                label={nl('Room Performance')}
                leftSection={<IconBuildingSkyscraper size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/room-performance'); closeNav(); }}
                active={path === '/reports/room-performance'}
              />
            )}
            {permissions.view_reservation_report && (
              <NavLink
                {...NL}
                label={nl('Reservations')}
                leftSection={<IconCalendarEvent size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/reservation-fulfillment'); closeNav(); }}
                active={path === '/reports/reservation-fulfillment'}
              />
            )}
            {(permissions.view_cancellation_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Cancellations')}
                leftSection={<IconBan size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/cancellations'); closeNav(); }}
                active={path === '/reports/cancellations'}
              />
            )}
            {permissions.view_clv_report && (
              <NavLink
                {...NL}
                label={nl('Customer Value')}
                leftSection={<IconHeartHandshake size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/clv'); closeNav(); }}
                active={path === '/reports/clv'}
              />
            )}
            {permissions.view_trends_report && (
              <NavLink
                {...NL}
                label={nl('Trends')}
                leftSection={<IconTrendingUp size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/trends'); closeNav(); }}
                active={path === '/reports/trends'}
              />
            )}
            {permissions.view_stay_duration_report && (
              <NavLink
                {...NL}
                label={nl('Stay Duration')}
                leftSection={<IconClock size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/stay-duration'); closeNav(); }}
                active={path === '/reports/stay-duration'}
              />
            )}
            {permissions.view_upsell_report && (
              <NavLink
                {...NL}
                label={nl('Extra Beds')}
                leftSection={<IconBedFilled size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/upsell'); closeNav(); }}
                active={path === '/reports/upsell'}
              />
            )}
            {permissions.view_pipeline_report && (
              <NavLink
                {...NL}
                label={nl('Pipeline')}
                leftSection={<IconTimeline size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/pipeline'); closeNav(); }}
                active={path === '/reports/pipeline'}
              />
            )}
            {permissions.view_revenue_report && (
              <NavLink
                {...NL}
                label={nl('GST Report')}
                leftSection={<IconPercentage size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/reports/gst'); closeNav(); }}
                active={path === '/reports/gst'}
              />
            )}
          </NavLink>
        )}

        {hasAnyFinance && (
          <NavLink
            {...NL}
            label={nl('Finance')}
            leftSection={<IconCoinRupee size={16} color="rgba(255,255,255,0.6)" />}
            defaultOpened={financeActive}
          >
            {(permissions.view_pl_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Revenue & P&L')}
                leftSection={<IconScale size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/finance/pl'); closeNav(); }}
                active={path === '/finance/pl'}
              />
            )}
            {(permissions.view_staff_sales_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Staff Sales')}
                leftSection={<IconUsers size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/finance/staff-sales'); closeNav(); }}
                active={path === '/finance/staff-sales'}
              />
            )}
            {(permissions.view_expense_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Expense Report')}
                leftSection={<IconReceipt size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/finance/expense-report'); closeNav(); }}
                active={path === '/finance/expense-report'}
              />
            )}
            {(permissions.view_income_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Income Report')}
                leftSection={<IconReportMoney size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/finance/income-report'); closeNav(); }}
                active={path === '/finance/income-report'}
              />
            )}
            {(permissions.view_daily_settlement || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Daily Settlement')}
                leftSection={<IconCash size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/settlement'); closeNav(); }}
                active={path === '/settlement'}
              />
            )}
          </NavLink>
        )}

        {hasAnySettings && (
        <NavLink
          {...NL}
          label={nl('Settings')}
          leftSection={<IconSettings size={16} color="rgba(255,255,255,0.6)" />}
          defaultOpened={configActive}
        >
          {(permissions.view_roomtype || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Room Types')}
            leftSection={<IconHome size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/room-types'); closeNav(); }}
            active={path === '/room-types'}
          />
          )}
          {(permissions.view_roomspricechart || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Price Chart')}
            leftSection={<IconCurrencyRupee size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/price-chart'); closeNav(); }}
            active={path === '/price-chart'}
          />
          )}
          {(permissions.view_countrycodes || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Country Codes')}
            leftSection={<IconWorld size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/country-codes'); closeNav(); }}
            active={path === '/country-codes'}
          />
          )}
          {(permissions.view_amenity || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Amenities')}
            leftSection={<IconPackage size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/amenities'); closeNav(); }}
            active={path === '/amenities'}
          />
          )}
          {(permissions.view_paymentmethod || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Payment Methods')}
            leftSection={<IconCurrencyRupee size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/payment-methods'); closeNav(); }}
            active={path === '/payment-methods'}
          />
          )}
          {(permissions.view_expensecategory || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Expense Categories')}
            leftSection={<IconTag size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/expense-categories'); closeNav(); }}
            active={path === '/expense-categories'}
          />
          )}
          {(permissions.view_incomecategory || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Income Categories')}
            leftSection={<IconTags size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/income-categories'); closeNav(); }}
            active={path === '/income-categories'}
          />
          )}
          {(permissions.view_configurations || permissions.is_superuser) && (
          <NavLink
            {...NL}
            label={nl('Configurations')}
            leftSection={<IconSettings size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => { navigate('/configurations'); closeNav(); }}
            active={path === '/configurations'}
          />
          )}
        </NavLink>
        )}

        {hasAnyAdmin && (
          <NavLink
            {...NL}
            label={nl('Administration')}
            leftSection={<IconShieldLock size={16} color="rgba(255,255,255,0.6)" />}
            defaultOpened={adminActive}
          >
            {(permissions.view_user || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Users')}
                leftSection={<IconUserCog size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/admin/users'); closeNav(); }}
                active={path === '/admin/users'}
              />
            )}
            {(permissions.view_group || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Groups')}
                leftSection={<IconUsersGroup size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/admin/groups'); closeNav(); }}
                active={path === '/admin/groups'}
              />
            )}
            {(permissions.view_group || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Permissions')}
                leftSection={<IconLock size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => { navigate('/admin/permissions'); closeNav(); }}
                active={path === '/admin/permissions'}
              />
            )}
          </NavLink>
        )}
      </AppShell.Navbar>

      <Drawer
        opened={reminderDrawerOpen}
        onClose={() => setReminderDrawerOpen(false)}
        title="Upcoming Reservation Reminders"
        position="right"
        size="md"
      >
        {reminders.length === 0 ? (
          <Text c="dimmed" size="sm">No pending reminders.</Text>
        ) : (
          <Stack gap="sm">
            {reminders.map(r => {
              const checkIn = r.check_in_date || '—';
              const roomNum = r.room_number || '—';
              const label = r.days_before === 0 ? 'Today!' : `${r.days_before} day${r.days_before !== 1 ? 's' : ''} before`;
              return (
                <Box key={r.id} p="sm" style={{ border: '1px solid var(--mantine-color-orange-3)', borderRadius: 8 }}>
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Text fw={600} size="sm">Room {roomNum}</Text>
                      <Text size="xs" c="dimmed">Check-in: {checkIn}</Text>
                      <Badge color={r.days_before === 0 ? 'red' : 'orange'} size="xs" mt={4}>{label}</Badge>
                    </div>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      loading={dismissMutation.isPending}
                      onClick={() => dismissMutation.mutate(r.id)}
                    >
                      Dismiss
                    </Button>
                  </Group>
                </Box>
              );
            })}
          </Stack>
        )}
      </Drawer>

      <AppShell.Main bg="gray.0">
        <Routes>
          <Route path="/" element={<Navigate to="/rooms" replace />} />
          <Route path="/room-types" element={<RoomTypes />} />
          <Route path="/rooms" element={<RoomDashboard />} />
          <Route path="/rooms/:id" element={<RoomDetail />} />
          <Route path="/bulk-booking" element={<BulkBooking />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/price-chart" element={<PriceChart />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/country-codes" element={<CountryCodes />} />
          <Route path="/configurations" element={<Configurations />} />
          <Route path="/amenities" element={<Amenities />} />
          <Route path="/payment-methods" element={<PaymentMethods />} />
          <Route path="/expense-categories" element={<ExpenseCategories />} />
          <Route path="/income-categories" element={<IncomeCategories />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/reports/today" element={<TodayOverview />} />
          <Route path="/reports/revenue" element={<RevenueReport />} />
          <Route path="/reports/occupancy" element={<OccupancyReport />} />
          <Route path="/reports/guests" element={<GuestAnalytics />} />
          <Route path="/reports/room-performance" element={<RoomPerformance />} />
          <Route path="/reports/reservation-fulfillment" element={<ReservationFulfillment />} />
          <Route path="/reports/clv" element={<CustomerLifetimeValue />} />
          <Route path="/reports/trends" element={<SeasonalTrends />} />
          <Route path="/reports/stay-duration" element={<StayDuration />} />
          <Route path="/reports/upsell" element={<ExtraBedUpsell />} />
          <Route path="/reports/pipeline" element={<BookingPipeline />} />
          <Route path="/nc-requests" element={<NCRequests />} />
          <Route path="/cash-drawer" element={<CashDrawer />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/income" element={<Income />} />
          <Route path="/finance/pl" element={<ProfitLoss />} />
          <Route path="/finance/staff-sales" element={<StaffSales />} />
          <Route path="/finance/expense-report" element={<ExpenseReport />} />
          <Route path="/finance/income-report" element={<IncomeReport />} />
          <Route path="/history" element={<History />} />
          <Route path="/reports/gst" element={<GSTReport />} />
          <Route path="/reports/cancellations" element={<CancellationReport />} />
          <Route path="/settlement" element={<Settlement />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/groups" element={<GroupManagement />} />
          <Route path="/admin/permissions" element={<PermissionOverview />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Center h="100vh"><Loader /></Center>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
