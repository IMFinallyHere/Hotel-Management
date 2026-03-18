import { useState } from 'react';
import { Group, Text, Stack, SimpleGrid, Card, Table } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { REPORT_QUERY_KEYS, fetchCashReconciliation } from '../../api/queries';

export default function CashReconciliation() {
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
    queryKey: REPORT_QUERY_KEYS.cashReconciliation(params),
    queryFn: () => fetchCashReconciliation(params),
    enabled: !!(dates[0] && dates[1]),
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text fw={700} size="xl">Cash Reconciliation</Text>
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
          <SimpleGrid cols={4} spacing="md">
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Cash In (Payments)</Text>
              <Text fw={700} size="xl" c="green">₹{data.cash_in.toLocaleString()}</Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Withdrawals (Approved)</Text>
              <Text fw={700} size="xl" c="orange">₹{data.withdrawals.toLocaleString()}</Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Cash Expenses</Text>
              <Text fw={700} size="xl" c="red">₹{data.cash_expenses.toLocaleString()}</Text>
            </Card>
            <Card withBorder p="md">
              <Text size="sm" c="dimmed">Net Cash</Text>
              <Text fw={700} size="xl" c={data.net_cash >= 0 ? 'teal' : 'red'}>
                ₹{data.net_cash.toLocaleString()}
              </Text>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={2} spacing="md">
            <div>
              <Text fw={600} mb="sm">Approved Withdrawals</Text>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Amount</Table.Th>
                    <Table.Th>Reason</Table.Th>
                    <Table.Th>By</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.withdrawals_list.length === 0 ? (
                    <Table.Tr><Table.Td colSpan={4} ta="center">None.</Table.Td></Table.Tr>
                  ) : data.withdrawals_list.map(w => (
                    <Table.Tr key={w.id}>
                      <Table.Td>{w.date}</Table.Td>
                      <Table.Td>₹{w.amount.toLocaleString()}</Table.Td>
                      <Table.Td>{w.reason}</Table.Td>
                      <Table.Td>{w.requested_by ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>

            <div>
              <Text fw={600} mb="sm">Cash Expenses</Text>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Amount</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>By</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.expenses_list.length === 0 ? (
                    <Table.Tr><Table.Td colSpan={4} ta="center">None.</Table.Td></Table.Tr>
                  ) : data.expenses_list.map(e => (
                    <Table.Tr key={e.id}>
                      <Table.Td>{e.date}</Table.Td>
                      <Table.Td>₹{e.amount.toLocaleString()}</Table.Td>
                      <Table.Td>{e.description}</Table.Td>
                      <Table.Td>{e.recorded_by ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
