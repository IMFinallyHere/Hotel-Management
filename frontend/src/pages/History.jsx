import { useState } from 'react';
import { Table, Button, Badge, Group, TextInput, Text, Stack, Skeleton } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { pdf } from '@react-pdf/renderer';
import { IconSearch, IconFileText } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { QUERY_KEYS_OPS, QUERY_KEYS, fetchStayHistory, fetchConfigurations, fetchRoomTypes, fetchRooms } from '../api/queries';
import { parseConfigs, computeGst } from '../utils/configUtils';
import InvoiceDocument from '../components/InvoiceDocument';

export default function History() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState([null, null]);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedRange, setAppliedRange] = useState([null, null]);

  const params = {};
  if (appliedSearch) params.search = appliedSearch;
  if (appliedRange[0]) params.start_date = dayjs(appliedRange[0]).format('YYYY-MM-DD');
  if (appliedRange[1]) params.end_date = dayjs(appliedRange[1]).format('YYYY-MM-DD');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.stayHistory(params),
    queryFn: () => fetchStayHistory(params),
  });

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);

  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const roomTypeMap = Object.fromEntries(roomTypes.map(rt => [rt.id, rt.name]));

  const { data: allRooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const roomMap = Object.fromEntries(allRooms.map(r => [r.id, r]));

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedRange(dateRange);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const rows = logs.map((log) => {
    const nights = log.check_out
      ? Math.max(1, dayjs(log.check_out).diff(dayjs(log.check_in), 'day'))
      : 1;
    const roomTotal = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
    const amenityTotal = (log.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const gstAmount = computeGst(log, nights, configMap['gst_percent']);
    const total = log.is_nc ? 0 : (roomTotal + amenityTotal + gstAmount);
    const guests = (log.customers || []).map(c => c.name).join(', ') || '—';

    const room = roomMap[log.room];
    const roomNumber = room?.room_number ?? String(log.room);
    const roomTypeName = room ? roomTypeMap[room.room_type] : undefined;

    return (
      <Table.Tr key={log.id}>
        <Table.Td>
          <Group gap={4}>
            {roomNumber}
            {log.is_nc && <Badge size="xs" color="grape">NC</Badge>}
            {log.is_early_checkin && <Badge size="xs" color="cyan">Early</Badge>}
            {log.gst_applied && <Badge size="xs" color="teal">GST</Badge>}
          </Group>
        </Table.Td>
        <Table.Td>{guests}</Table.Td>
        <Table.Td>{dayjs(log.check_in).format('DD MMM YYYY')}</Table.Td>
        <Table.Td>{log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : '—'}</Table.Td>
        <Table.Td>{nights}</Table.Td>
        <Table.Td>{log.is_nc ? '—' : `₹${roomTotal}`}</Table.Td>
        <Table.Td>{gstAmount > 0 ? <Badge color="teal" variant="light">₹{gstAmount}</Badge> : '—'}</Table.Td>
        <Table.Td>{amenityTotal > 0 ? `₹${amenityTotal}` : '—'}</Table.Td>
        <Table.Td fw={600}>{log.is_nc ? <Badge color="grape" variant="light">₹0 (NC)</Badge> : `₹${total}`}</Table.Td>
        <Table.Td>
          {log.gst_applied ? (
            <Button
              size="xs" variant="light" color="green" leftSection={<IconFileText size={14} />}
              onClick={async () => {
                const blob = await pdf(
                  <InvoiceDocument log={log} roomNumber={roomNumber} roomTypeName={roomTypeName} configMap={configMap} nights={nights} />
                ).toBlob();
                window.open(URL.createObjectURL(blob), '_blank');
              }}
            >
              Invoice
            </Button>
          ) : (
            <Text size="xs" c="dimmed">—</Text>
          )}
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="md">
      <Text fw={700} size="xl">Stay History</Text>

      <Group align="flex-end" gap="sm">
        <TextInput
          label="Search"
          placeholder="Room # or guest name"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          w={220}
        />
        <DatePickerInput
          type="range"
          label="Date Range"
          placeholder="Pick dates"
          value={dateRange}
          onChange={setDateRange}
          clearable
          w={260}
        />
        <Button onClick={applyFilters}>Apply</Button>
        {(appliedSearch || appliedRange[0]) && (
          <Button variant="subtle" color="gray" onClick={() => {
            setSearch('');
            setDateRange([null, null]);
            setAppliedSearch('');
            setAppliedRange([null, null]);
          }}>
            Clear
          </Button>
        )}
      </Group>

      <Table.ScrollContainer minWidth={900}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Room</Table.Th>
              <Table.Th>Guests</Table.Th>
              <Table.Th>Check-In</Table.Th>
              <Table.Th>Check-Out</Table.Th>
              <Table.Th>Nights</Table.Th>
              <Table.Th>Room Base</Table.Th>
              <Table.Th>GST</Table.Th>
              <Table.Th>Amenities</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Invoice</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={16} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={10} ta="center">
                  <Text size="sm" c="dimmed">No past stays found.</Text>
                </Table.Td>
              </Table.Tr>
            ) : rows}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
