import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchGuestReport } from '../api/queries';
import {
  Card, Group, Text, Title, Table, Stack, SimpleGrid, Loader,
  Center, Paper, ThemeIcon, Badge, Progress,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { PieChart } from '@mantine/charts';
import { IconUsers, IconUserCheck, IconUserPlus } from '@tabler/icons-react';

const COLORS = ['blue.6', 'pink.6', 'grape.6', 'gray.6', 'teal.6', 'orange.6'];

function fmtDate(d) {
  if (!d) return null;
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch { return null; }
}

export default function GuestAnalytics() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = {
    start_date: startStr,
    end_date: endStr,
  };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.guestReport(params),
    queryFn: () => fetchGuestReport(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const gender = data?.gender || [];
  const country = data?.country || [];

  const pieData = gender.map((g, i) => ({
    name: g.gender.charAt(0).toUpperCase() + g.gender.slice(1),
    value: g.count,
    color: COLORS[i % COLORS.length],
  }));

  const maxCountry = country.length > 0 ? country[0].count : 1;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Guest Analytics</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">
            {startStr} to {endStr}
          </Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Understand your guest demographics — repeat vs first-time visitors, gender mix, and country of origin — to tailor your services.</Text>

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
                  <IconUsers size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Total Guests</Text>
                  <Title order={2}>{summary.total || 0}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="green">
                  <IconUserCheck size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Repeat Guests</Text>
                  <Title order={2}>{summary.repeat || 0}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="orange">
                  <IconUserPlus size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>First-time Guests</Text>
                  <Title order={2}>{summary.first_time || 0}</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {pieData.length > 0 ? (
              <Paper shadow="xs" p="lg" radius="md" withBorder>
                <Title order={5} mb="md">Gender Distribution</Title>
                <Center>
                  <PieChart
                    size={220}
                    data={pieData}
                    withLabelsLine
                    labelsType="percent"
                    withLabels
                    withTooltip
                  />
                </Center>
              </Paper>
            ) : (
              <Paper shadow="xs" p="xl" radius="md" withBorder>
                <Center><Text c="dimmed">No gender data available.</Text></Center>
              </Paper>
            )}

            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Country Distribution</Title>
              {country.length > 0 ? (
                <Stack gap="sm">
                  {country.map((c) => (
                    <div key={c.country}>
                      <Group justify="space-between" mb={4}>
                        <Text size="sm" fw={500}>{c.country || 'Unknown'}</Text>
                        <Text size="sm" c="dimmed">{c.count}</Text>
                      </Group>
                      <Progress
                        value={(c.count / maxCountry) * 100}
                        color="blue"
                        size="sm"
                        radius="xl"
                      />
                    </div>
                  ))}
                </Stack>
              ) : (
                <Center py="lg"><Text c="dimmed">No country data available.</Text></Center>
              )}
            </Paper>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
