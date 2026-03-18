import { useState } from 'react';
import { Group, Text, Badge, Stack, SimpleGrid, Card, Table } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { REPORT_QUERY_KEYS, fetchPLReport } from '../../api/queries';

export default function ProfitLoss() {
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
    queryKey: REPORT_QUERY_KEYS.plReport(params),
    queryFn: () => fetchPLReport(params),
    enabled: !!(dates[0] && dates[1]),
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text fw={700} size="xl">Revenue & Profit / Loss</Text>
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
          <SimpleGrid cols={3} spacing="md">
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Total Revenue</Text>
              <Text fw={700} size="xl" c="green">₹{data.revenue.total.toLocaleString()}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Room: ₹{data.revenue.by_type.room?.toLocaleString() ?? 0} | Amenity: ₹{data.revenue.by_type.amenity?.toLocaleString() ?? 0}
              </Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Total Expenses</Text>
              <Text fw={700} size="xl" c="red">₹{data.expenses.total.toLocaleString()}</Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Net Profit</Text>
              <Text fw={700} size="xl" c={data.net_profit >= 0 ? 'teal' : 'red'}>
                ₹{data.net_profit.toLocaleString()}
              </Text>
            </Card>
          </SimpleGrid>

          {data.chart_data.length > 0 && (
            <div>
              <Text fw={600} mb="sm">Daily Breakdown</Text>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Revenue</Table.Th>
                    <Table.Th>Expenses</Table.Th>
                    <Table.Th>Net</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.chart_data.map(row => (
                    <Table.Tr key={row.period}>
                      <Table.Td>{row.period}</Table.Td>
                      <Table.Td>₹{row.revenue.toLocaleString()}</Table.Td>
                      <Table.Td>₹{row.expenses.toLocaleString()}</Table.Td>
                      <Table.Td>
                        <Text c={row.net >= 0 ? 'teal' : 'red'} fw={500}>₹{row.net.toLocaleString()}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          )}
        </>
      )}
    </Stack>
  );
}
