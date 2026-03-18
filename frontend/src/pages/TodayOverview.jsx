import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchTodayOverview } from '../api/queries';
import {
  Card, Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Paper, ThemeIcon, Badge,
} from '@mantine/core';
import {
  IconPlane, IconBed, IconDoorEnter, IconBuilding,
} from '@tabler/icons-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function TodayOverview() {
  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.todayOverview,
    queryFn: fetchTodayOverview,
  });

  if (isLoading) return <Center h={300}><Loader /></Center>;

  const { arrivals = [], occupied = [], occupied_count = 0, available_count = 0, total_rooms = 0 } = data || {};

  const stats = [
    { label: 'Expected Arrivals', value: arrivals.length, color: 'blue', icon: IconPlane },
    { label: 'Occupied Rooms', value: occupied_count, color: 'orange', icon: IconBed },
    { label: 'Available Rooms', value: available_count, color: 'green', icon: IconDoorEnter },
    { label: 'Total Rooms', value: total_rooms, color: 'gray', icon: IconBuilding },
  ];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Today's Overview</Title>
        <Badge variant="light" size="lg">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Badge>
      </Group>
      <Text c="dimmed" size="sm">A real-time snapshot of today's arrivals, current occupancy, and room availability for front-desk decision-making.</Text>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {stats.map((s) => (
          <Paper key={s.label} shadow="xs" p="lg" radius="md" withBorder>
            <Group>
              <ThemeIcon size={48} radius="md" variant="light" color={s.color}>
                <s.icon size={26} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed" fw={500} tt="uppercase">{s.label}</Text>
                <Title order={2}>{s.value}</Title>
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      <Paper shadow="xs" p="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={5}>Expected Arrivals</Title>
          <Badge variant="light" color="blue">{arrivals.length} reservations</Badge>
        </Group>
        {arrivals.length === 0 ? (
          <Center py="xl"><Text c="dimmed">No arrivals expected today.</Text></Center>
        ) : (
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Room</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Guests</Table.Th>
                <Table.Th>Check-in</Table.Th>
                <Table.Th>Check-out</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {arrivals.map((a) => (
                <Table.Tr key={a.reservation_id}>
                  <Table.Td>
                    <Badge variant="outline" size="lg">{a.room}</Badge>
                  </Table.Td>
                  <Table.Td>{a.room_type}</Table.Td>
                  <Table.Td>{a.guests.map(g => g.name).join(', ')}</Table.Td>
                  <Table.Td>{a.check_in_date}</Table.Td>
                  <Table.Td>{a.check_out_date}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Paper shadow="xs" p="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={5}>Currently Occupied</Title>
          <Badge variant="light" color="orange">{occupied.length} rooms</Badge>
        </Group>
        {occupied.length === 0 ? (
          <Center py="xl"><Text c="dimmed">No rooms currently occupied.</Text></Center>
        ) : (
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Room</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Guests</Table.Th>
                <Table.Th>Check-in</Table.Th>
                <Table.Th ta="right">Price/night</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {occupied.map((o) => (
                <Table.Tr key={o.log_id}>
                  <Table.Td>
                    <Badge variant="outline" size="lg">{o.room}</Badge>
                  </Table.Td>
                  <Table.Td>{o.room_type}</Table.Td>
                  <Table.Td>{o.guests.map(g => g.name).join(', ')}</Table.Td>
                  <Table.Td>{new Date(o.check_in).toLocaleDateString('en-IN')}</Table.Td>
                  <Table.Td ta="right" fw={500}>{fmt(o.price)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
