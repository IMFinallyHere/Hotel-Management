import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchOccupancyReport } from '../api/queries';
import {
  Card, Group, Text, Title, Stack, SimpleGrid, Loader, Center,
  Select, Paper, ThemeIcon, Badge, RingProgress,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { LineChart } from '@mantine/charts';
import { IconBed, IconCalendarStats } from '@tabler/icons-react';

function fmtDate(d) {
  if (!d) return null;
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch { return null; }
}

export default function OccupancyReport() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);
  const [groupBy, setGroupBy] = useState('day');

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = {
    start_date: startStr,
    end_date: endStr,
    group_by: groupBy,
  };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.occupancyReport(params),
    queryFn: () => fetchOccupancyReport(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const chartData = data?.chart_data || [];
  const occPct = summary.avg_occupancy || 0;
  const occColor = occPct > 80 ? 'red' : occPct > 50 ? 'orange' : 'teal';

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Occupancy Report</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">
            {startStr} to {endStr}
          </Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Monitor how effectively your rooms are being utilized and identify periods of low or high demand.</Text>

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
                <RingProgress
                  size={72}
                  thickness={8}
                  roundCaps
                  sections={[{ value: occPct, color: occColor }]}
                  label={
                    <Text ta="center" size="xs" fw={700}>{occPct}%</Text>
                  }
                />
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Avg Occupancy</Text>
                  <Title order={2} c={occColor}>{occPct}%</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="indigo">
                  <IconCalendarStats size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Avg Length of Stay</Text>
                  <Title order={2}>{summary.avg_length_of_stay || 0} <Text span size="lg" c="dimmed">nights</Text></Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {chartData.length > 0 ? (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Occupancy Over Time</Title>
              <LineChart
                h={300}
                data={chartData}
                dataKey="period"
                series={[{ name: 'occupancy_pct', color: 'teal.6', label: 'Occupancy %' }]}
                curveType="monotone"
                tickLine="y"
                gridAxis="y"
                valueFormatter={(v) => `${v}%`}
                referenceLines={[{ y: 100, color: 'red.3', label: 'Full' }]}
              />
            </Paper>
          ) : (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No occupancy data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
