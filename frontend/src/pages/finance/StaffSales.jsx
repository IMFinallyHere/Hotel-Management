import { useState } from 'react';
import { Group, Text, Stack, SimpleGrid, Card, Table, Badge } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { REPORT_QUERY_KEYS, fetchStaffSales } from '../../api/queries';

const TYPE_COLORS = { cash: 'green', upi: 'blue', card: 'violet', other: 'gray' };

export default function StaffSales() {
  const today = new Date();
  const [dates, setDates] = useState([
    dayjs().subtract(30, 'day').toDate(),
    today,
  ]);

  const params = {
    start_date: dayjs(dates[0]).format('YYYY-MM-DD'),
    end_date: dayjs(dates[1] ?? dates[0]).format('YYYY-MM-DD'),
  };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.staffSales(params),
    queryFn: () => fetchStaffSales(params),
    enabled: !!(dates[0] && dates[1]),
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text fw={700} size="xl">Staff Sales</Text>
        <DatePickerInput
          type="range"
          label="Date range"
          value={dates}
          onChange={setDates}
          w={280}
        />
      </Group>

      {isLoading && <Text c="dimmed">Loading...</Text>}

      {data && (
        <>
          <SimpleGrid cols={Object.keys(data.by_payment_type).length || 1} spacing="md">
            {Object.entries(data.by_payment_type).map(([type, total]) => (
              <Card withBorder p="md" key={type}>
                <Badge color={TYPE_COLORS[type]} variant="light" mb="xs">{type.toUpperCase()}</Badge>
                <Text fw={700} size="xl">₹{total.toLocaleString()}</Text>
              </Card>
            ))}
          </SimpleGrid>

          <div>
            <Text fw={600} mb="sm">By Staff Member</Text>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Staff</Table.Th>
                  <Table.Th>Total Collected</Table.Th>
                  <Table.Th>Cash</Table.Th>
                  <Table.Th>UPI</Table.Th>
                  <Table.Th>Card</Table.Th>
                  <Table.Th>Other</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.staff.length === 0 ? (
                  <Table.Tr><Table.Td colSpan={6} ta="center">No payment data.</Table.Td></Table.Tr>
                ) : data.staff.map(s => (
                  <Table.Tr key={s.name}>
                    <Table.Td fw={500}>{s.name}</Table.Td>
                    <Table.Td fw={600}>₹{s.total_collected.toLocaleString()}</Table.Td>
                    <Table.Td>{s.by_type.cash ? `₹${s.by_type.cash.toLocaleString()}` : '—'}</Table.Td>
                    <Table.Td>{s.by_type.upi ? `₹${s.by_type.upi.toLocaleString()}` : '—'}</Table.Td>
                    <Table.Td>{s.by_type.card ? `₹${s.by_type.card.toLocaleString()}` : '—'}</Table.Td>
                    <Table.Td>{s.by_type.other ? `₹${s.by_type.other.toLocaleString()}` : '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </>
      )}
    </Stack>
  );
}
