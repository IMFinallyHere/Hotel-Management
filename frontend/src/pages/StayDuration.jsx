import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchStayDuration } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart } from '@mantine/charts';
import { IconClock, IconCalendarStats } from '@tabler/icons-react';

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

export default function StayDuration() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = { start_date: startStr, end_date: endStr };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.stayDuration(params),
    queryFn: () => fetchStayDuration(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const buckets = data?.buckets || [];
  const byType = data?.by_room_type || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Stay Duration Analysis</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Analyze how long guests stay, which duration buckets generate the most revenue, and how stay length varies by room type to optimize minimum-night policies.</Text>

      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range" label="Date range" value={dates}
            onChange={setDates} clearable={false} maxDate={new Date()} w={280}
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
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <IconClock size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Avg Duration</Text>
                  <Title order={2}>{summary.avg_duration || 0} <Text span size="lg" c="dimmed">nights</Text></Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconCalendarStats size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Median Duration</Text>
                  <Title order={2}>{summary.median_duration || 0} <Text span size="lg" c="dimmed">nights</Text></Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconClock size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Total Stays</Text>
                  <Title order={2}>{summary.total_stays || 0}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="orange">
                  <IconCalendarStats size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Most Common</Text>
                  <Title order={3}>{summary.most_common || '-'}</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {buckets.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Duration Distribution</Title>
              <BarChart
                h={300}
                data={buckets}
                dataKey="label"
                series={[{ name: 'count', color: 'blue.6', label: 'Stays' }]}
                tickLine="y" gridAxis="y"
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
                    <Table.Th ta="right">Stays</Table.Th>
                    <Table.Th ta="right">Avg Duration</Table.Th>
                    <Table.Th ta="right">Avg Daily Rate</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byType.map(r => (
                    <Table.Tr key={r.room_type}>
                      <Table.Td fw={500}>{r.room_type}</Table.Td>
                      <Table.Td ta="right">{r.count}</Table.Td>
                      <Table.Td ta="right">{r.avg_duration} nights</Table.Td>
                      <Table.Td ta="right">{fmt(r.avg_daily_rate)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {buckets.length === 0 && (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No stay data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
