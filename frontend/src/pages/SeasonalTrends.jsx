import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchTrendsReport } from '../api/queries';
import {
  Group, Text, Title, Stack, SimpleGrid,
  Loader, Center, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { LineChart, BarChart } from '@mantine/charts';
import { IconTrendingUp, IconCalendarStats, IconSun, IconMoon } from '@tabler/icons-react';

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

export default function SeasonalTrends() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 365 * 86400000),
    new Date(),
  ]);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = { start_date: startStr, end_date: endStr };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.trendsReport(params),
    queryFn: () => fetchTrendsReport(params),
    enabled: ready,
  });

  const monthlyData = data?.monthly_data || [];
  const dowData = data?.dow_data || [];
  const summary = data?.summary || {};

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Seasonal Trends</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Spot monthly revenue and occupancy patterns, compare weekday vs weekend demand, and find your best and worst performing months for smarter pricing.</Text>

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
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconTrendingUp size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Best Month</Text>
                  <Title order={3}>{summary.best_month || '-'}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="red">
                  <IconCalendarStats size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Worst Month</Text>
                  <Title order={3}>{summary.worst_month || '-'}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="orange">
                  <IconSun size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Weekend Avg Occ</Text>
                  <Title order={3}>{summary.weekend_avg_occ || 0}%</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="indigo">
                  <IconMoon size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Weekday Avg Occ</Text>
                  <Title order={3}>{summary.weekday_avg_occ || 0}%</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {monthlyData.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Monthly Revenue & Occupancy</Title>
              <LineChart
                h={300}
                data={monthlyData}
                dataKey="month"
                series={[
                  { name: 'revenue', color: 'blue.6', label: 'Revenue' },
                  { name: 'avg_occupancy', color: 'teal.6', label: 'Avg Occupancy %', yAxisId: 'right' },
                ]}
                curveType="monotone"
                tickLine="y" gridAxis="y"
              />
            </Paper>
          )}

          {dowData.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Occupancy by Day of Week</Title>
              <BarChart
                h={250}
                data={dowData}
                dataKey="day"
                series={[{ name: 'avg_occupancy', color: 'grape.6', label: 'Avg Occupancy %' }]}
                tickLine="y" gridAxis="y"
                valueFormatter={(v) => `${v}%`}
              />
            </Paper>
          )}

          {monthlyData.length === 0 && dowData.length === 0 && (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No trend data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
