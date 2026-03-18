import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchRoomPerformance, fetchRoomTypes } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Select, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart } from '@mantine/charts';
import { IconBuildingSkyscraper, IconCurrencyRupee } from '@tabler/icons-react';

function fmtDate(d) {
  if (!d) return null;
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch { return null; }
}

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function RoomPerformance() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);
  const [roomType, setRoomType] = useState(null);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = {
    start_date: startStr,
    end_date: endStr,
    ...(roomType && { room_type: roomType }),
  };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.roomPerformance(params),
    queryFn: () => fetchRoomPerformance(params),
    enabled: ready,
  });

  const { data: roomTypes } = useQuery({
    queryKey: ['room-types'],
    queryFn: fetchRoomTypes,
  });

  const rooms = data?.rooms || [];
  const byType = data?.by_room_type || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Room Performance</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Compare individual rooms and room types by revenue, occupancy, and RevPAR to identify your top performers and underutilized inventory.</Text>

      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range" label="Date range" value={dates}
            onChange={setDates} clearable={false} maxDate={new Date()} w={280}
          />
          <Select
            label="Room type"
            data={(roomTypes || []).map(rt => ({ value: String(rt.id), label: rt.name }))}
            value={roomType} onChange={setRoomType} clearable placeholder="All" w={160}
          />
        </Group>
      </Paper>

      {!ready ? (
        <Paper p="xl" radius="md" withBorder>
          <Center><Text c="dimmed">Select a complete date range to view the report.</Text></Center>
        </Paper>
      ) : isLoading ? (
        <Center h={200}><Loader /></Center>
      ) : (
        <>
          {byType.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">RevPAR by Room Type</Title>
              <BarChart
                h={300}
                data={byType}
                dataKey="room_type"
                series={[{ name: 'avg_revpar', color: 'blue.6', label: 'Avg RevPAR' }]}
                tickLine="y" gridAxis="y"
                valueFormatter={(v) => fmt(v)}
              />
            </Paper>
          )}

          {byType.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Summary by Room Type</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Room Type</Table.Th>
                    <Table.Th ta="right">Rooms</Table.Th>
                    <Table.Th ta="right">Revenue</Table.Th>
                    <Table.Th ta="right">Avg Occupancy</Table.Th>
                    <Table.Th ta="right">Avg RevPAR</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byType.map(r => (
                    <Table.Tr key={r.room_type}>
                      <Table.Td fw={500}>{r.room_type}</Table.Td>
                      <Table.Td ta="right">{r.room_count}</Table.Td>
                      <Table.Td ta="right">{fmt(r.total_revenue)}</Table.Td>
                      <Table.Td ta="right">{r.avg_occupancy}%</Table.Td>
                      <Table.Td ta="right">{fmt(r.avg_revpar)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {rooms.length > 0 ? (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Room Details</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Room</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th ta="right">Revenue</Table.Th>
                    <Table.Th ta="right">Nights Sold</Table.Th>
                    <Table.Th ta="right">Occupancy</Table.Th>
                    <Table.Th ta="right">RevPAR</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rooms.map(r => (
                    <Table.Tr key={r.room_number}>
                      <Table.Td fw={500}>{r.room_number}</Table.Td>
                      <Table.Td>{r.room_type}</Table.Td>
                      <Table.Td ta="right">{fmt(r.revenue)}</Table.Td>
                      <Table.Td ta="right">{r.nights_sold}</Table.Td>
                      <Table.Td ta="right">{r.occupancy_pct}%</Table.Td>
                      <Table.Td ta="right">{fmt(r.revpar)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ) : (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No room performance data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
