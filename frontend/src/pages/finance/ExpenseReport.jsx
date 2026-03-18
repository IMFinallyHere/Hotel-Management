import { useState } from 'react';
import { Group, Text, Stack, SimpleGrid, Card, Table, Badge } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { REPORT_QUERY_KEYS, fetchExpenseReport } from '../../api/queries';

const TYPE_COLORS = { cash: 'green', upi: 'blue', card: 'violet', other: 'gray' };

export default function ExpenseReport() {
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
    queryKey: REPORT_QUERY_KEYS.expenseReport(params),
    queryFn: () => fetchExpenseReport(params),
    enabled: !!(dates[0] && dates[1]),
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text fw={700} size="xl">Expense Report</Text>
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
          <SimpleGrid cols={Math.max(1, Object.keys(data.by_payment_type).length + 1)} spacing="md">
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Total Expenses</Text>
              <Text fw={700} size="xl" c="red">₹{data.total.toLocaleString()}</Text>
            </Card>
            {Object.entries(data.by_payment_type).map(([type, amount]) => (
              <Card withBorder p="md" key={type}>
                <Badge color={TYPE_COLORS[type]} variant="light" mb="xs">{type.toUpperCase()}</Badge>
                <Text fw={700} size="lg">₹{amount.toLocaleString()}</Text>
              </Card>
            ))}
          </SimpleGrid>

          {data.by_day.map(day => (
            <div key={day.date}>
              <Group mb="xs">
                <Text fw={600}>{day.date}</Text>
                <Text size="sm" c="dimmed">Total: ₹{day.total.toLocaleString()}</Text>
              </Group>
              <Table striped withTableBorder mb="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Amount</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Recorded By</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {day.items.map(item => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{item.description}</Table.Td>
                      <Table.Td>₹{item.amount.toLocaleString()}</Table.Td>
                      <Table.Td>
                        <Badge color={TYPE_COLORS[item.payment_type]} variant="light" size="sm">
                          {item.payment_type.toUpperCase()}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{item.recorded_by ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          ))}

          {data.by_day.length === 0 && (
            <Text c="dimmed" ta="center">No expenses in this date range.</Text>
          )}
        </>
      )}
    </Stack>
  );
}
