import { useState } from 'react';
import dayjs from 'dayjs';
import { Table, Button, Group, Text, Modal, NumberInput, Textarea, Stack, Badge, SegmentedControl, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure, useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS_OPS, fetchCashWithdrawalsPage } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';
import TablePager from '../components/TablePager';

export default function CashDrawer() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canWithdraw = permissions.add_cashwithdrawal || permissions.is_superuser;

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('20');
  const params = { page, page_size: pageSize };
  if (debouncedSearch) params.search = debouncedSearch;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...QUERY_KEYS_OPS.cashWithdrawals, 'page', params],
    queryFn: () => fetchCashWithdrawalsPage(params),
    placeholderData: keepPreviousData,
  });
  const withdrawals = data?.results ?? [];
  // Server falls back to the last page when the requested one no longer exists
  if (data?.page && data.page !== page && !isFetching) setPage(data.page);

  const [opened, { open, close }] = useDisclosure(false);

  const form = useForm({
    initialValues: { amount: 0, reason: '', entry_type: 'debit' },
    validate: {
      amount: (v) => v > 0 ? null : 'Amount must be greater than 0',
      reason: (v) => v.trim() ? null : 'Reason is required',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values) => api.post('/v1/cash-withdrawals/', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS_OPS.cashWithdrawals });
      close();
      form.reset();
      notifySuccess('Entry recorded.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to record entry.')),
  });

  // Totals cover every entry matching the search, not just this page
  const totalDebit = Number(data?.totals?.debit ?? 0);
  const totalCredit = Number(data?.totals?.credit ?? 0);
  const net = totalDebit - totalCredit;

  return (
    <>
      <Group mb="md" justify="space-between" wrap="wrap">
        <Group wrap="wrap" gap="lg">
          <Text fw={600} size="lg">Cash Drawer / Petty Cash</Text>
          <Group gap="xs">
            <Text size="sm" c="dimmed">DR: <Text span fw={600} c="red">₹{totalDebit.toLocaleString()}</Text></Text>
            <Text size="sm" c="dimmed">CR: <Text span fw={600} c="teal">₹{totalCredit.toLocaleString()}</Text></Text>
            <Text size="sm" c="dimmed">Net: <Text span fw={600} c={net > 0 ? 'red' : net < 0 ? 'teal' : 'dark'}>₹{Math.abs(net).toLocaleString()} {net > 0 ? 'out' : net < 0 ? 'in' : ''}</Text></Text>
          </Group>
        </Group>
        {canWithdraw && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => { form.reset(); open(); }}>
            New Entry
          </Button>
        )}
      </Group>

      <TextInput
        placeholder="Search reason"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        w={260}
        mb="sm"
      />

      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Recorded By</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={5} ta="center">Loading...</Table.Td></Table.Tr>
            ) : withdrawals.length === 0 ? (
              <Table.Tr><Table.Td colSpan={5} ta="center">{debouncedSearch ? 'No entries match your search.' : 'No entries recorded.'}</Table.Td></Table.Tr>
            ) : withdrawals.map((w) => {
              const isCredit = w.entry_type === 'credit';
              return (
                <Table.Tr key={w.id}>
                  <Table.Td>
                    <Badge size="sm" color={isCredit ? 'teal' : 'red'} variant="light">
                      {isCredit ? 'CR' : 'DR'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(w.created_on).format('DD MMM YYYY, hh:mm A')}</Table.Td>
                  <Table.Td fw={500} c={isCredit ? 'teal' : 'red'}>
                    {isCredit ? '+' : '−'}₹{Number(w.amount).toLocaleString()}
                  </Table.Td>
                  <Table.Td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{w.reason}</Table.Td>
                  <Table.Td>{w.requested_by_name ?? '—'}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <TablePager
        page={page}
        pageSize={pageSize}
        totalCount={data?.count ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        dimmed={isFetching}
      />

      <Modal opened={opened} onClose={close} title="New Cash Entry" size={{ base: '95%', sm: 'lg' }}>
        <form onSubmit={form.onSubmit(v => createMutation.mutate(v))}>
          <Stack gap="sm">
            <SegmentedControl
              fullWidth
              data={[
                { label: 'Debit (Withdrawal)', value: 'debit' },
                { label: 'Credit (Deposit)', value: 'credit' },
              ]}
              {...form.getInputProps('entry_type')}
            />
            <NumberInput
              label="Amount (₹)"
              min={1}
              {...form.getInputProps('amount')}
              required
            />
            <Textarea
              label="Reason"
              placeholder={form.values.entry_type === 'credit' ? 'Source of deposit...' : 'Purpose of withdrawal...'}
              rows={3}
              {...form.getInputProps('reason')}
              required
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>Cancel</Button>
              <Button
                type="submit"
                color={form.values.entry_type === 'credit' ? 'teal' : 'blue'}
                loading={createMutation.isPending}
              >
                Record {form.values.entry_type === 'credit' ? 'Deposit' : 'Withdrawal'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
