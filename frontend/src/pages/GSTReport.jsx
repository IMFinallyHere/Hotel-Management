import { useState } from 'react';
import { Table, Badge, Group, Text, Stack, Card, SimpleGrid, Skeleton } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { QUERY_KEYS_OPS, fetchGSTReport } from '../api/queries';

function StatCard({ label, value, color = 'teal' }) {
  return (
    <Card withBorder p="md">
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
    </Card>
  );
}

export default function GSTReport() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateRange, setDateRange] = useState([firstOfMonth, today]);

  const params = {};
  if (dateRange[0]) params.start_date = dayjs(dateRange[0]).format('YYYY-MM-DD');
  if (dateRange[1]) params.end_date = dayjs(dateRange[1]).format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.gstReport(params),
    queryFn: () => fetchGSTReport(params),
    enabled: !!(dateRange[0] && dateRange[1]),
  });

  const entries = data?.entries ?? [];

  return (
    <Stack gap="md">
      <Text fw={700} size="xl">GST Report</Text>

      <Group>
        <DatePickerInput
          type="range"
          label="Date Range"
          placeholder="Pick range"
          value={dateRange}
          onChange={setDateRange}
          clearable
          w={260}
        />
      </Group>

      {isLoading ? (
        <SimpleGrid cols={3}>
          {[1, 2, 3].map(i => <Skeleton key={i} height={80} />)}
        </SimpleGrid>
      ) : data && (
        <SimpleGrid cols={3}>
          <StatCard label="Total GST Collected" value={`₹${data.total_gst.toLocaleString('en-IN')}`} color="teal" />
          <StatCard label="Total Room Revenue (GST Base)" value={`₹${data.total_room_revenue.toLocaleString('en-IN')}`} color="blue" />
          <StatCard label="GST Rate" value={`${data.gst_rate}%`} color="grape" />
        </SimpleGrid>
      )}

      <Table.ScrollContainer minWidth={800}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Room</Table.Th>
              <Table.Th>Guests</Table.Th>
              <Table.Th>Check-In</Table.Th>
              <Table.Th>Check-Out</Table.Th>
              <Table.Th>Nights</Table.Th>
              <Table.Th>Room Base (₹)</Table.Th>
              <Table.Th>GST (₹)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={16} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : entries.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} ta="center">
                  <Text size="sm" c="dimmed">No GST stays in this period.</Text>
                </Table.Td>
              </Table.Tr>
            ) : entries.map(e => (
              <Table.Tr key={e.log_id}>
                <Table.Td>{e.room}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="wrap">
                    {e.guests.map((g, i) => <Badge key={i} size="xs" variant="light">{g}</Badge>)}
                  </Group>
                </Table.Td>
                <Table.Td>{dayjs(e.check_in).format('DD MMM YYYY')}</Table.Td>
                <Table.Td>{dayjs(e.check_out).format('DD MMM YYYY')}</Table.Td>
                <Table.Td>{e.nights}</Table.Td>
                <Table.Td>₹{e.room_base.toLocaleString('en-IN')}</Table.Td>
                <Table.Td><Badge color="teal" variant="light">₹{e.gst_amount.toLocaleString('en-IN')}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
