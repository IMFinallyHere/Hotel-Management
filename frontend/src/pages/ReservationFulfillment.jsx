import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchReservationFulfillment } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart, PieChart } from '@mantine/charts';
import { IconCalendarEvent, IconCheck, IconX, IconClock } from '@tabler/icons-react';

function fmtDate(d) {
  if (!d) return null;
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch { return null; }
}

export default function ReservationFulfillment() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 30 * 86400000),
    new Date(),
  ]);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = { start_date: startStr, end_date: endStr };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.reservationFulfillment(params),
    queryFn: () => fetchReservationFulfillment(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const noShows = data?.no_shows || [];
  const leadDist = data?.lead_time_distribution || [];

  const pieData = summary.total ? [
    { name: 'Fulfilled', value: summary.fulfilled || 0, color: 'teal.6' },
    { name: 'No-Show', value: summary.no_show || 0, color: 'red.6' },
    { name: 'Upcoming', value: summary.upcoming || 0, color: 'blue.6' },
  ].filter(d => d.value > 0) : [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Reservation Fulfillment</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Measure how many reservations convert into actual stays, spot no-show patterns, and analyze booking lead times to improve your overbooking strategy.</Text>

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
                  <IconCalendarEvent size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Total</Text>
                  <Title order={2}>{summary.total || 0}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconCheck size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Fulfilled</Text>
                  <Title order={2}>{summary.fulfilled_pct || 0}%</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="red">
                  <IconX size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>No-Shows</Text>
                  <Title order={2}>{summary.no_show_pct || 0}%</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconClock size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Avg Lead Time</Text>
                  <Title order={2}>{summary.avg_lead_time || 0} <Text span size="lg" c="dimmed">days</Text></Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {pieData.length > 0 && (
              <Paper shadow="xs" p="lg" radius="md" withBorder>
                <Title order={5} mb="md">Status Breakdown</Title>
                <PieChart
                  h={250}
                  data={pieData}
                  withLabelsLine labelsPosition="outside" withLabels
                  labelsType="percent"
                />
              </Paper>
            )}
            {leadDist.length > 0 && (
              <Paper shadow="xs" p="lg" radius="md" withBorder>
                <Title order={5} mb="md">Lead Time Distribution</Title>
                <BarChart
                  h={250}
                  data={leadDist}
                  dataKey="bucket"
                  series={[{ name: 'count', color: 'indigo.6', label: 'Reservations' }]}
                  tickLine="y" gridAxis="y"
                />
              </Paper>
            )}
          </SimpleGrid>

          {noShows.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">No-Shows</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Reservation</Table.Th>
                    <Table.Th>Room</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Check-In Date</Table.Th>
                    <Table.Th>Guests</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {noShows.map(ns => (
                    <Table.Tr key={ns.reservation_id}>
                      <Table.Td>#{ns.reservation_id}</Table.Td>
                      <Table.Td fw={500}>{ns.room}</Table.Td>
                      <Table.Td>{ns.room_type}</Table.Td>
                      <Table.Td>{ns.check_in_date}</Table.Td>
                      <Table.Td>{ns.guests.map(g => g.name).join(', ')}</Table.Td>
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
