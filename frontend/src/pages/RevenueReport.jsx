import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchRevenueReport, fetchRoomTypes } from '../api/queries';
import {
  Card, Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Select, Paper, ThemeIcon, Badge, Divider,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart } from '@mantine/charts';
import { IconCurrencyRupee, IconReceipt } from '@tabler/icons-react';

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

export default function RevenueReport() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);
  const [groupBy, setGroupBy] = useState('day');
  const [roomType, setRoomType] = useState(null);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = {
    start_date: startStr,
    end_date: endStr,
    group_by: groupBy,
    ...(roomType && { room_type: roomType }),
  };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.revenueReport(params),
    queryFn: () => fetchRevenueReport(params),
    enabled: ready,
  });

  const { data: roomTypes } = useQuery({
    queryKey: ['room-types'],
    queryFn: fetchRoomTypes,
  });

  const summary = data?.summary || {};
  const chartData = data?.chart_data || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Revenue Report</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">
            {startStr} to {endStr}
          </Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Track total earnings, average daily rate, and revenue breakdown by room type to understand your income streams.</Text>

      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range"
            label="Date range"
            value={dates}
            onChange={setDates}
            clearable={false}
            maxDate={new Date()}
            w={280}
          />
          <Select
            label="Group by"
            data={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={groupBy}
            onChange={setGroupBy}
            w={120}
          />
          <Select
            label="Room type"
            data={(roomTypes || []).map(rt => ({ value: String(rt.id), label: rt.name }))}
            value={roomType}
            onChange={setRoomType}
            clearable
            placeholder="All"
            w={160}
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
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <IconCurrencyRupee size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Total Revenue</Text>
                  <Title order={2}>{fmt(summary.total_revenue || 0)}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconReceipt size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Average Daily Rate</Text>
                  <Title order={2}>{fmt(summary.adr || 0)}</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {chartData.length > 0 ? (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Revenue Over Time</Title>
              <BarChart
                h={300}
                data={chartData}
                dataKey="period"
                series={[{ name: 'revenue', color: 'blue.6', label: 'Revenue' }]}
                tickLine="y"
                gridAxis="y"
                valueFormatter={(v) => fmt(v)}
              />
            </Paper>
          ) : (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No revenue data for the selected period.</Text></Center>
            </Paper>
          )}

          {(summary.by_room_type || []).length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Revenue by Room Type</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Room Type</Table.Th>
                    <Table.Th ta="right">Revenue</Table.Th>
                    <Table.Th ta="right">Share</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {summary.by_room_type.map((r) => (
                    <Table.Tr key={r.room_type}>
                      <Table.Td fw={500}>{r.room_type}</Table.Td>
                      <Table.Td ta="right">{fmt(r.revenue)}</Table.Td>
                      <Table.Td ta="right">
                        <Badge variant="light" color="blue">
                          {summary.total_revenue ? Math.round(r.revenue / summary.total_revenue * 100) : 0}%
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
