import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchPipelineReport } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconTimeline, IconCurrencyRupee, IconCalendarEvent } from '@tabler/icons-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function BookingPipeline() {
  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.pipelineReport,
    queryFn: fetchPipelineReport,
  });

  const summary = data?.summary || {};
  const weeklyData = data?.weekly_data || [];
  const upcoming = data?.upcoming || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Booking Pipeline</Title>
        <Badge variant="light" size="lg">Next 8 weeks</Badge>
      </Group>
      <Text c="dimmed" size="sm">See upcoming reservations week by week, forecast expected revenue, and identify your busiest periods ahead so you can plan staffing and inventory.</Text>

      {isLoading ? (
        <Center h={200}><Loader /></Center>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <IconCalendarEvent size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Total Reservations</Text>
                  <Title order={2}>{summary.total_reservations || 0}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconCurrencyRupee size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Expected Revenue</Text>
                  <Title order={2}>{fmt(summary.total_expected_revenue || 0)}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconTimeline size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Busiest Week</Text>
                  <Title order={3}>{summary.busiest_week || '-'}</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {weeklyData.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Reservations by Week</Title>
              <BarChart
                h={300}
                data={weeklyData}
                dataKey="week"
                series={[{ name: 'reservations', color: 'blue.6', label: 'Reservations' }]}
                tickLine="y" gridAxis="y"
              />
            </Paper>
          )}

          {upcoming.length > 0 ? (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Upcoming Reservations</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Room</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Check-In</Table.Th>
                    <Table.Th>Check-Out</Table.Th>
                    <Table.Th ta="right">Expected Rev</Table.Th>
                    <Table.Th>Guests</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {upcoming.map(r => (
                    <Table.Tr key={r.reservation_id}>
                      <Table.Td>{r.reservation_id}</Table.Td>
                      <Table.Td fw={500}>{r.room}</Table.Td>
                      <Table.Td>{r.room_type}</Table.Td>
                      <Table.Td>{r.check_in}</Table.Td>
                      <Table.Td>{r.check_out}</Table.Td>
                      <Table.Td ta="right">{fmt(r.expected_revenue)}</Table.Td>
                      <Table.Td>{r.guests.map(g => g.name).join(', ')}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ) : (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No upcoming reservations in the next 8 weeks.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
