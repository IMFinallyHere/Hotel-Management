import { useState } from 'react';
import {
  Stack, Text, Group, Button, Badge, Table, Loader, Center, Paper,
  Select, Switch, TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  REPORT_QUERY_KEYS, QUERY_KEYS, fetchPendingDuesReport, fetchConfigurations, fetchRooms,
} from '../api/queries';
import { parseConfigs } from '../utils/configUtils';
import { computeStayDues } from '../utils/stayBill';

export default function PendingDuesReport() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState([null, null]);
  const [scope, setScope] = useState('all');
  const [activeParams, setActiveParams] = useState({});
  const [search, setSearch] = useState('');
  const [onlyDues, setOnlyDues] = useState(true);

  const { data: logs = [], isFetching } = useQuery({
    queryKey: REPORT_QUERY_KEYS.pendingDuesReport(activeParams),
    queryFn: () => fetchPendingDuesReport(activeParams),
    keepPreviousData: true,
  });

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);

  const { data: allRooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const roomMap = Object.fromEntries(allRooms.map(r => [r.id, r]));

  const handleSearch = () => {
    const p = {};
    if (scope !== 'all') p.scope = scope;
    if (dateRange[0]) p.from_date = dayjs(dateRange[0]).format('YYYY-MM-DD');
    if (dateRange[1]) p.to_date = dayjs(dateRange[1]).format('YYYY-MM-DD');
    setActiveParams(p);
  };

  const handleClear = () => {
    setDateRange([null, null]);
    setScope('all');
    setSearch('');
    setActiveParams({});
  };

  const term = search.trim().toLowerCase();
  const rows = logs
    .map(log => {
      const room = roomMap[log.room];
      return {
        log,
        roomNumber: room?.room_number ?? String(log.room),
        guests: (log.customers || []).map(c => c.name).join(', '),
        ...computeStayDues(log, configMap, room),
      };
    })
    .filter(r => !onlyDues || r.due > 0)
    .filter(r => !term || r.roomNumber.toLowerCase().includes(term) || r.guests.toLowerCase().includes(term))
    .sort((a, b) => b.due - a.due);

  const totalDue = rows.reduce((s, r) => s + Math.max(0, r.due), 0);
  const activeDue = rows.filter(r => !r.log.check_out).reduce((s, r) => s + Math.max(0, r.due), 0);

  return (
    <Stack gap="md">
      <Text fw={600} size="xl">Pending Dues</Text>

      <Paper withBorder p="md" radius="md">
        <Group gap="sm" wrap="wrap" align="flex-end">
          <Select
            label="Stays"
            value={scope}
            onChange={(v) => setScope(v ?? 'all')}
            w={170}
            data={[
              { value: 'all', label: 'Active + Checked out' },
              { value: 'active', label: 'Active only' },
              { value: 'checked_out', label: 'Checked out only' },
            ]}
          />
          <DatePickerInput
            type="range"
            label="Check-in (checked-out stays)"
            placeholder="Any date"
            value={dateRange}
            onChange={setDateRange}
            clearable
            disabled={scope === 'active'}
            w={240}
          />
          <Button onClick={handleSearch} leftSection={<IconSearch size={14} />}>Search</Button>
          <Button variant="default" onClick={handleClear} leftSection={<IconX size={14} />}>Clear</Button>
        </Group>
        <Group gap="md" mt="sm" align="center">
          <TextInput
            placeholder="Filter by room # or guest"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            w={240}
            size="sm"
          />
          <Switch label="Only stays with dues" checked={onlyDues} onChange={(e) => setOnlyDues(e.currentTarget.checked)} />
        </Group>
      </Paper>

      {isFetching ? (
        <Center h={200}><Loader /></Center>
      ) : rows.length === 0 ? (
        <Center h={150}><Text c="dimmed">No pending dues found.</Text></Center>
      ) : (
        <Stack gap="sm">
          <Group gap="lg">
            <Text size="sm" c="dimmed">{rows.length} stay{rows.length !== 1 ? 's' : ''}</Text>
            <Text size="sm" c="dimmed">Total due: <Text span fw={700} c="red">₹{totalDue.toLocaleString()}</Text></Text>
            <Text size="sm" c="dimmed">Active stays: <Text span fw={600} c="dark">₹{activeDue.toLocaleString()}</Text></Text>
            <Text size="sm" c="dimmed">Checked out: <Text span fw={600} c="dark">₹{(totalDue - activeDue).toLocaleString()}</Text></Text>
          </Group>
          <Table.ScrollContainer minWidth={900}>
            <Table withTableBorder withColumnBorders striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Room</Table.Th>
                  <Table.Th>Guest(s)</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Check-In</Table.Th>
                  <Table.Th>Check-Out</Table.Th>
                  <Table.Th>Nights</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Paid</Table.Th>
                  <Table.Th>Due</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(({ log, roomNumber, guests, nights, billTotal, totalPaid, due }) => {
                  const active = !log.check_out;
                  return (
                    <Table.Tr
                      key={log.id}
                      style={active ? { cursor: 'pointer' } : undefined}
                      onClick={active ? () => navigate(`/rooms/${log.room}`) : undefined}
                    >
                      <Table.Td fw={600}>
                        <Group gap={4}>
                          {roomNumber}
                          {log.is_nc && <Badge size="xs" color="grape">NC</Badge>}
                          {log.gst_applied && <Badge size="xs" color="teal">GST</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="sm" lineClamp={1}>{guests || '—'}</Text></Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={active ? 'blue' : 'gray'}>
                          {active ? 'Active' : 'Checked out'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{dayjs(log.check_in).format('DD MMM YYYY')}</Table.Td>
                      <Table.Td>{active ? '—' : dayjs(log.check_out).format('DD MMM YYYY')}</Table.Td>
                      <Table.Td>{nights}</Table.Td>
                      <Table.Td>₹{billTotal.toLocaleString()}</Table.Td>
                      <Table.Td>₹{totalPaid.toLocaleString()}</Table.Td>
                      <Table.Td fw={700} c={due > 0 ? 'red' : due < 0 ? 'orange' : 'teal'}>
                        {due < 0 ? `₹${Math.abs(due).toLocaleString()} over` : `₹${due.toLocaleString()}`}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed">
            Active stays are billed up to today, including any overtime fee due now. Click an active stay to open the room.
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
