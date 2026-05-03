import { useState } from 'react';
import {
  Stack, Text, Group, Button, Badge, Table,
  Loader, Center, Paper, Select, Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { REPORT_QUERY_KEYS, fetchCancellationReport } from '../api/queries';

export default function CancellationReport() {
  const [dateRange, setDateRange] = useState([null, null]);
  const [type, setType] = useState('all');
  const [activeParams, setActiveParams] = useState({});

  const { data = [], isFetching } = useQuery({
    queryKey: REPORT_QUERY_KEYS.cancellationReport(activeParams),
    queryFn: () => fetchCancellationReport(activeParams),
    keepPreviousData: true,
  });

  const handleSearch = () => {
    const p = {};
    if (dateRange[0]) p.from_date = dayjs(dateRange[0]).format('YYYY-MM-DD');
    if (dateRange[1]) p.to_date = dayjs(dateRange[1]).format('YYYY-MM-DD');
    if (type !== 'all') p.cancellation_type = type;
    setActiveParams(p);
  };

  const handleClear = () => {
    setDateRange([null, null]);
    setType('all');
    setActiveParams({});
  };

  const totalFees = data.reduce((s, r) => s + Number(r.cancellation_fee), 0);
  const totalWaived = data.reduce((s, r) => s + Number(r.waived_amount ?? 0), 0);
  const totalRefunded = data.reduce((s, r) => s + Number(r.refund?.amount ?? 0), 0);

  return (
    <Stack gap="md">
      <Text fw={600} size="xl">Cancellation Report</Text>

      <Paper withBorder p="md" radius="md">
        <Group gap="sm" wrap="wrap">
          <DatePickerInput
            type="range"
            placeholder="Date range"
            value={dateRange}
            onChange={setDateRange}
            clearable
            size="sm"
            w={240}
            label="Cancelled On"
          />
          <Select
            label="Type"
            value={type}
            onChange={setType}
            w={180}
            data={[
              { value: 'all', label: 'All Cancellations' },
              { value: 'checkin', label: 'Check-in Cancellations' },
              { value: 'reservation', label: 'Reservation Cancellations' },
            ]}
          />
          <Group gap="xs" mt={20}>
            <Button onClick={handleSearch} leftSection={<IconSearch size={14} />}>Search</Button>
            <Button variant="default" onClick={handleClear} leftSection={<IconX size={14} />}>Clear</Button>
          </Group>
        </Group>
      </Paper>

      {isFetching ? (
        <Center h={200}><Loader /></Center>
      ) : data.length === 0 ? (
        <Center h={150}><Text c="dimmed">No cancellations found.</Text></Center>
      ) : (
        <Stack gap="sm">
          <Group gap="lg">
            <Text size="sm" c="dimmed">{data.length} cancellation{data.length !== 1 ? 's' : ''}</Text>
            <Text size="sm" c="dimmed">Fees collected: <Text span fw={600} c="dark">₹{totalFees.toLocaleString()}</Text></Text>
            <Text size="sm" c="dimmed">Refunded: <Text span fw={600} c="red">₹{totalRefunded.toLocaleString()}</Text></Text>
            {totalWaived > 0 && (
              <Text size="sm" c="dimmed">Total waived: <Text span fw={600} c="orange">₹{totalWaived.toLocaleString()}</Text></Text>
            )}
          </Group>
          <Table withBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Room</Table.Th>
                <Table.Th>Guest(s)</Table.Th>
                <Table.Th>Check-in Date</Table.Th>
                <Table.Th>Cancelled On</Table.Th>
                <Table.Th>Reason</Table.Th>
                <Table.Th>Default Fee (₹)</Table.Th>
                <Table.Th>Charged (₹)</Table.Th>
                <Table.Th>Refund (₹)</Table.Th>
                <Table.Th>Refund Method</Table.Th>
                <Table.Th>Waived (₹)</Table.Th>
                <Table.Th>Cancelled By</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map(row => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Badge color={row.cancellation_type === 'checkin' ? 'orange' : 'violet'} size="sm">
                      {row.cancellation_type === 'checkin' ? 'Check-in' : 'Reservation'}
                    </Badge>
                  </Table.Td>
                  <Table.Td fw={600}>{row.room_number}</Table.Td>
                  <Table.Td>
                    {row.guest_names?.length > 0
                      ? row.guest_names.map((n, i) => <Text key={i} size="sm">{n}</Text>)
                      : <Text size="sm" c="dimmed">—</Text>
                    }
                  </Table.Td>
                  <Table.Td>{row.check_in_date ?? '—'}</Table.Td>
                  <Table.Td>{dayjs(row.cancelled_on).format('DD MMM YYYY HH:mm')}</Table.Td>
                  <Table.Td style={{ maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.reason}
                  </Table.Td>
                  <Table.Td>₹{Number(row.default_fee).toLocaleString()}</Table.Td>
                  <Table.Td>₹{Number(row.cancellation_fee).toLocaleString()}</Table.Td>
                  <Table.Td>
                    {row.refund ? (
                      <Tooltip label={row.refund.note || `Processed by ${row.refund.processed_by_name ?? '—'}`}>
                        <Text size="sm" c="red" fw={600}>₹{Number(row.refund.amount).toLocaleString()}</Text>
                      </Tooltip>
                    ) : '—'}
                  </Table.Td>
                  <Table.Td>{row.refund?.payment_method_name ?? '—'}</Table.Td>
                  <Table.Td>
                    {Number(row.waived_amount) > 0 ? (
                      <Tooltip label={`Waived by ${row.cancelled_by_name ?? '—'}`}>
                        <Text size="sm" c="orange" fw={600}>₹{Number(row.waived_amount).toLocaleString()}</Text>
                      </Tooltip>
                    ) : '—'}
                  </Table.Td>
                  <Table.Td>{row.cancelled_by_name ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
