import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchUpsellReport } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Select, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { LineChart } from '@mantine/charts';
import { IconBedFilled, IconCurrencyRupee, IconPercentage } from '@tabler/icons-react';

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

export default function ExtraBedUpsell() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);
  const [groupBy, setGroupBy] = useState('day');

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = { start_date: startStr, end_date: endStr, group_by: groupBy };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.upsellReport(params),
    queryFn: () => fetchUpsellReport(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const chartData = data?.chart_data || [];
  const byType = data?.by_room_type || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Extra Bed & Upsell</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Track extra bed adoption rates and the additional revenue they generate to evaluate upsell effectiveness and set competitive extra bed pricing.</Text>

      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range" label="Date range" value={dates}
            onChange={setDates} clearable={false} maxDate={new Date()} w={280}
          />
          <Select
            label="Group by"
            data={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={groupBy} onChange={setGroupBy} w={120}
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
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <IconPercentage size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Adoption Rate</Text>
                  <Title order={2}>{summary.adoption_rate || 0}%</Title>
                  <Text size="xs" c="dimmed">{summary.stays_with_extra || 0} of {summary.total_stays || 0} stays</Text>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconCurrencyRupee size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Extra Bed Revenue</Text>
                  <Title order={2}>{fmt(summary.total_extra_revenue || 0)}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconBedFilled size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Revenue Share</Text>
                  <Title order={2}>{summary.extra_revenue_share || 0}%</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {chartData.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Extra Revenue Over Time</Title>
              <LineChart
                h={300}
                data={chartData}
                dataKey="period"
                series={[
                  { name: 'extra_revenue', color: 'teal.6', label: 'Extra Revenue' },
                  { name: 'total_revenue', color: 'blue.6', label: 'Total Revenue' },
                ]}
                curveType="monotone"
                tickLine="y" gridAxis="y"
                valueFormatter={(v) => fmt(v)}
              />
            </Paper>
          )}

          {byType.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">By Room Type</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Room Type</Table.Th>
                    <Table.Th ta="right">Total Stays</Table.Th>
                    <Table.Th ta="right">With Extra</Table.Th>
                    <Table.Th ta="right">Adoption</Table.Th>
                    <Table.Th ta="right">Extra Revenue</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byType.map(r => (
                    <Table.Tr key={r.room_type}>
                      <Table.Td fw={500}>{r.room_type}</Table.Td>
                      <Table.Td ta="right">{r.total}</Table.Td>
                      <Table.Td ta="right">{r.with_extra}</Table.Td>
                      <Table.Td ta="right">{r.adoption_rate}%</Table.Td>
                      <Table.Td ta="right">{fmt(r.extra_revenue)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {chartData.length === 0 && byType.length === 0 && (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No upsell data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
