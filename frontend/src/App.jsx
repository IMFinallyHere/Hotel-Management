import { AppShell, NavLink, Title, Button, Group } from '@mantine/core';
import {
  IconHome, IconBuildingBank, IconUsers, IconSettings,
  IconLogin, IconLogout, IconCalendar, IconCurrencyRupee,
  IconWorld, IconUser, IconChartBar, IconReportAnalytics,
  IconPercentage, IconUsersGroup, IconDashboard,
  IconBuildingSkyscraper, IconCalendarEvent, IconHeartHandshake,
  IconTrendingUp, IconClock, IconBedFilled, IconTimeline,
  IconShieldLock, IconUserCog, IconLock, IconPackage,
  IconBan, IconCash, IconReceipt, IconScale, IconCoinRupee,
} from '@tabler/icons-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import RoomTypes from './pages/RoomTypes';
import RoomDashboard from './pages/RoomDashboard';
import RoomDetail from './pages/RoomDetail';
import PriceChart from './pages/PriceChart';
import Customers from './pages/Customers';
import CountryCodes from './pages/CountryCodes';
import Configurations from './pages/Configurations';
import CheckIn from './pages/CheckIn';
import Checkout from './pages/Checkout';
import TodayOverview from './pages/TodayOverview';
import RevenueReport from './pages/RevenueReport';
import OccupancyReport from './pages/OccupancyReport';
import GuestAnalytics from './pages/GuestAnalytics';
import RoomPerformance from './pages/RoomPerformance';
import ReservationFulfillment from './pages/ReservationFulfillment';
import CustomerLifetimeValue from './pages/CustomerLifetimeValue';
import SeasonalTrends from './pages/SeasonalTrends';
import StayDuration from './pages/StayDuration';
import ExtraBedUpsell from './pages/ExtraBedUpsell';
import BookingPipeline from './pages/BookingPipeline';
import UserManagement from './pages/UserManagement';
import GroupManagement from './pages/GroupManagement';
import Amenities from './pages/Amenities';
import PermissionOverview from './pages/PermissionOverview';
import NCRequests from './pages/NCRequests';
import CashDrawer from './pages/CashDrawer';
import Expenses from './pages/Expenses';
import ProfitLoss from './pages/finance/ProfitLoss';
import StaffSales from './pages/finance/StaffSales';
import CashReconciliation from './pages/finance/CashReconciliation';
import ExpenseReport from './pages/finance/ExpenseReport';
import usePermissions from './hooks/usePermissions';

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

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const roomsActive = path === '/rooms' || path.startsWith('/rooms/');
  const operationsActive = roomsActive || path === '/checkout' || path === '/customers' || path === '/nc-requests' || path === '/cash-drawer' || path === '/expenses';
  const configActive = ['/configurations', '/amenities', '/room-types', '/price-chart', '/country-codes'].includes(path);
  const reportsActive = path.startsWith('/reports');
  const financeActive = path.startsWith('/finance');
  const adminActive = path.startsWith('/admin');
  const { permissions, hasAnyReport } = usePermissions();
  const hasAnyFinance = permissions.view_pl_report || permissions.view_staff_sales_report || permissions.view_cash_reconciliation || permissions.view_expense_report || permissions.is_superuser;

  return (
    <AppShell
      navbar={{ width: 220, breakpoint: 'sm' }}
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Hotel Manager</Title>
          <Button variant="subtle" leftSection={<IconLogout size={16} />} onClick={handleLogout}>
            Logout
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" style={{ background: '#1a1b1e' }}>
        <NavLink
          {...NL}
          label={nl('Operations')}
          leftSection={<IconCalendar size={16} color="rgba(255,255,255,0.6)" />}
          defaultOpened={operationsActive}
        >
          <NavLink
            {...NL}
            label={nl('All Rooms')}
            leftSection={<IconBuildingBank size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/rooms')}
            active={roomsActive}
          />
          <NavLink
            {...NL}
            label={nl('Checkout')}
            leftSection={<IconLogout size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/checkout')}
            active={path === '/checkout'}
          />
          <NavLink
            {...NL}
            label={nl('Customers')}
            leftSection={<IconUsers size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/customers')}
            active={path === '/customers'}
          />
          <NavLink
            {...NL}
            label={nl('Expenses')}
            leftSection={<IconReceipt size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/expenses')}
            active={path === '/expenses'}
          />
          <NavLink
            {...NL}
            label={nl('NC Requests')}
            leftSection={<IconBan size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/nc-requests')}
            active={path === '/nc-requests'}
          />
          <NavLink
            {...NL}
            label={nl('Cash Drawer')}
            leftSection={<IconCash size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/cash-drawer')}
            active={path === '/cash-drawer'}
          />
        </NavLink>

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
                onClick={() => navigate('/reports/today')}
                active={path === '/reports/today'}
              />
            )}
            {permissions.view_revenue_report && (
              <NavLink
                {...NL}
                label={nl('Revenue')}
                leftSection={<IconCurrencyRupee size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/revenue')}
                active={path === '/reports/revenue'}
              />
            )}
            {permissions.view_occupancy_report && (
              <NavLink
                {...NL}
                label={nl('Occupancy')}
                leftSection={<IconPercentage size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/occupancy')}
                active={path === '/reports/occupancy'}
              />
            )}
            {permissions.view_guest_report && (
              <NavLink
                {...NL}
                label={nl('Guest Analytics')}
                leftSection={<IconUsersGroup size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/guests')}
                active={path === '/reports/guests'}
              />
            )}
            {permissions.view_room_performance_report && (
              <NavLink
                {...NL}
                label={nl('Room Performance')}
                leftSection={<IconBuildingSkyscraper size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/room-performance')}
                active={path === '/reports/room-performance'}
              />
            )}
            {permissions.view_reservation_report && (
              <NavLink
                {...NL}
                label={nl('Reservations')}
                leftSection={<IconCalendarEvent size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/reservation-fulfillment')}
                active={path === '/reports/reservation-fulfillment'}
              />
            )}
            {permissions.view_clv_report && (
              <NavLink
                {...NL}
                label={nl('Customer Value')}
                leftSection={<IconHeartHandshake size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/clv')}
                active={path === '/reports/clv'}
              />
            )}
            {permissions.view_trends_report && (
              <NavLink
                {...NL}
                label={nl('Trends')}
                leftSection={<IconTrendingUp size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/trends')}
                active={path === '/reports/trends'}
              />
            )}
            {permissions.view_stay_duration_report && (
              <NavLink
                {...NL}
                label={nl('Stay Duration')}
                leftSection={<IconClock size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/stay-duration')}
                active={path === '/reports/stay-duration'}
              />
            )}
            {permissions.view_upsell_report && (
              <NavLink
                {...NL}
                label={nl('Extra Beds')}
                leftSection={<IconBedFilled size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/upsell')}
                active={path === '/reports/upsell'}
              />
            )}
            {permissions.view_pipeline_report && (
              <NavLink
                {...NL}
                label={nl('Pipeline')}
                leftSection={<IconTimeline size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/reports/pipeline')}
                active={path === '/reports/pipeline'}
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
                onClick={() => navigate('/finance/pl')}
                active={path === '/finance/pl'}
              />
            )}
            {(permissions.view_staff_sales_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Staff Sales')}
                leftSection={<IconUsers size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/finance/staff-sales')}
                active={path === '/finance/staff-sales'}
              />
            )}
            {(permissions.view_cash_reconciliation || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Cash Reconciliation')}
                leftSection={<IconCash size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/finance/cash-reconciliation')}
                active={path === '/finance/cash-reconciliation'}
              />
            )}
            {(permissions.view_expense_report || permissions.is_superuser) && (
              <NavLink
                {...NL}
                label={nl('Expense Report')}
                leftSection={<IconReceipt size={14} color="rgba(255,255,255,0.6)" />}
                onClick={() => navigate('/finance/expense-report')}
                active={path === '/finance/expense-report'}
              />
            )}
          </NavLink>
        )}

        <NavLink
          {...NL}
          label={nl('Settings')}
          leftSection={<IconSettings size={16} color="rgba(255,255,255,0.6)" />}
          defaultOpened={configActive}
        >
          <NavLink
            {...NL}
            label={nl('Room Types')}
            leftSection={<IconHome size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/room-types')}
            active={path === '/room-types'}
          />
          <NavLink
            {...NL}
            label={nl('Price Chart')}
            leftSection={<IconCurrencyRupee size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/price-chart')}
            active={path === '/price-chart'}
          />
          <NavLink
            {...NL}
            label={nl('Country Codes')}
            leftSection={<IconWorld size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/country-codes')}
            active={path === '/country-codes'}
          />
          <NavLink
            {...NL}
            label={nl('Amenities')}
            leftSection={<IconPackage size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/amenities')}
            active={path === '/amenities'}
          />
          <NavLink
            {...NL}
            label={nl('Configurations')}
            leftSection={<IconSettings size={14} color="rgba(255,255,255,0.6)" />}
            onClick={() => navigate('/configurations')}
            active={path === '/configurations'}
          />
        </NavLink>

        {permissions.is_superuser && (
          <NavLink
            {...NL}
            label={nl('Administration')}
            leftSection={<IconShieldLock size={16} color="rgba(255,255,255,0.6)" />}
            defaultOpened={adminActive}
          >
            <NavLink
              {...NL}
              label={nl('Users')}
              leftSection={<IconUserCog size={14} color="rgba(255,255,255,0.6)" />}
              onClick={() => navigate('/admin/users')}
              active={path === '/admin/users'}
            />
            <NavLink
              {...NL}
              label={nl('Groups')}
              leftSection={<IconUsersGroup size={14} color="rgba(255,255,255,0.6)" />}
              onClick={() => navigate('/admin/groups')}
              active={path === '/admin/groups'}
            />
            <NavLink
              {...NL}
              label={nl('Permissions')}
              leftSection={<IconLock size={14} color="rgba(255,255,255,0.6)" />}
              onClick={() => navigate('/admin/permissions')}
              active={path === '/admin/permissions'}
            />
          </NavLink>
        )}
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        <Routes>
          <Route path="/" element={<Navigate to="/rooms" replace />} />
          <Route path="/room-types" element={<RoomTypes />} />
          <Route path="/rooms" element={<RoomDashboard />} />
          <Route path="/rooms/:id" element={<RoomDetail />} />
          <Route path="/price-chart" element={<PriceChart />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/country-codes" element={<CountryCodes />} />
          <Route path="/configurations" element={<Configurations />} />
          <Route path="/amenities" element={<Amenities />} />
          <Route path="/checkin" element={<CheckIn />} />
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
          <Route path="/finance/pl" element={<ProfitLoss />} />
          <Route path="/finance/staff-sales" element={<StaffSales />} />
          <Route path="/finance/cash-reconciliation" element={<CashReconciliation />} />
          <Route path="/finance/expense-report" element={<ExpenseReport />} />
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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
