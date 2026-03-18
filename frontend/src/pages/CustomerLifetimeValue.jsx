import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_QUERY_KEYS, fetchCLVReport } from '../api/queries';
import {
  Group, Text, Title, Table, Stack, SimpleGrid,
  Loader, Center, Select, Paper, ThemeIcon, Badge, NumberInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart } from '@mantine/charts';
import { IconHeartHandshake, IconUsers, IconCurrencyRupee } from '@tabler/icons-react';

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

export default function CustomerLifetimeValue() {
  const [dates, setDates] = useState([
    new Date(Date.now() - 365 * 86400000),
    new Date(),
  ]);
  const [sortBy, setSortBy] = useState('total_revenue');
  const [limit, setLimit] = useState(20);

  const startStr = fmtDate(dates[0]);
  const endStr = fmtDate(dates[1]);
  const ready = !!startStr && !!endStr;

  const params = { start_date: startStr, end_date: endStr, sort_by: sortBy, limit };

  const { data, isLoading } = useQuery({
    queryKey: REPORT_QUERY_KEYS.clvReport(params),
    queryFn: () => fetchCLVReport(params),
    enabled: ready,
  });

  const summary = data?.summary || {};
  const customers = data?.customers || [];
  const top10 = customers.slice(0, 10);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>Customer Lifetime Value</Title>
        {ready && !isLoading && (
          <Badge variant="light" size="lg">{startStr} to {endStr}</Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">Identify your most valuable guests by total spend, visit frequency, and recency to focus loyalty efforts where they matter most.</Text>

      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group align="flex-end">
          <DatePickerInput
            type="range" label="Date range" value={dates}
            onChange={setDates} clearable={false} maxDate={new Date()} w={280}
          />
          <Select
            label="Sort by"
            data={[
              { value: 'total_revenue', label: 'Revenue' },
              { value: 'visits', label: 'Visits' },
              { value: 'avg_spend', label: 'Avg Spend' },
            ]}
            value={sortBy} onChange={setSortBy} w={140}
          />
          <NumberInput
            label="Limit" value={limit} onChange={setLimit}
            min={5} max={100} w={80}
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
                <ThemeIcon size={48} radius="md" variant="light" color="pink">
                  <IconHeartHandshake size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Avg CLV</Text>
                  <Title order={2}>{fmt(summary.avg_clv || 0)}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="blue">
                  <IconCurrencyRupee size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Top Revenue</Text>
                  <Title order={2}>{fmt(summary.top_revenue || 0)}</Title>
                </div>
              </Group>
            </Paper>
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size={48} radius="md" variant="light" color="teal">
                  <IconUsers size={26} />
                </ThemeIcon>
                <div>
                  <Text size="sm" c="dimmed" fw={500}>Unique Guests</Text>
                  <Title order={2}>{summary.total_unique_guests || 0}</Title>
                </div>
              </Group>
            </Paper>
          </SimpleGrid>

          {top10.length > 0 && (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Top 10 by Revenue</Title>
              <BarChart
                h={300}
                data={top10.map(c => ({ name: c.name, revenue: c.total_revenue }))}
                dataKey="name"
                series={[{ name: 'revenue', color: 'pink.6', label: 'Revenue' }]}
                tickLine="y" gridAxis="y"
                valueFormatter={(v) => fmt(v)}
              />
            </Paper>
          )}

          {customers.length > 0 ? (
            <Paper shadow="xs" p="lg" radius="md" withBorder>
              <Title order={5} mb="md">Customer Details</Title>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th ta="right">Revenue</Table.Th>
                    <Table.Th ta="right">Visits</Table.Th>
                    <Table.Th ta="right">Avg Spend</Table.Th>
                    <Table.Th>First Visit</Table.Th>
                    <Table.Th>Last Visit</Table.Th>
                    <Table.Th ta="right">Days Since Last</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {customers.map(c => (
                    <Table.Tr key={c.id}>
                      <Table.Td fw={500}>{c.name}</Table.Td>
                      <Table.Td ta="right">{fmt(c.total_revenue)}</Table.Td>
                      <Table.Td ta="right">{c.visit_count}</Table.Td>
                      <Table.Td ta="right">{fmt(c.avg_spend)}</Table.Td>
                      <Table.Td>{c.first_visit}</Table.Td>
                      <Table.Td>{c.last_visit}</Table.Td>
                      <Table.Td ta="right">{c.days_since_last ?? '-'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ) : (
            <Paper p="xl" radius="md" withBorder>
              <Center><Text c="dimmed">No customer data for the selected period.</Text></Center>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
