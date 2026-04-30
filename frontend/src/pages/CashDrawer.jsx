import { useState } from 'react';
import { Table, Button, Group, Text, Modal, NumberInput, Textarea, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS_OPS, fetchCashWithdrawals } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

export default function CashDrawer() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canWithdraw = permissions.add_cashwithdrawal || permissions.is_superuser;

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.cashWithdrawals,
    queryFn: fetchCashWithdrawals,
  });

  const [opened, { open, close }] = useDisclosure(false);

  const form = useForm({
    initialValues: { amount: 0, reason: '' },
    validate: {
      amount: (v) => v > 0 ? null : 'Amount must be greater than 0',
      reason: (v) => v.trim() ? null : 'Reason is required',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values) => api.post('/v1/cash-withdrawals/', values),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS_OPS.cashWithdrawals);
      close();
      form.reset();
      notifySuccess('Withdrawal recorded.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to record withdrawal.')),
  });

  const total = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  return (
    <>
      <Group mb="md" justify="space-between" wrap="wrap">
        <Group wrap="wrap" gap="sm">
          <Text fw={600} size="lg">Cash Drawer / Petty Cash</Text>
          <Text size="sm" c="dimmed">Total withdrawn: <Text span fw={600} c="dark">₹{total.toLocaleString()}</Text></Text>
        </Group>
        {canWithdraw && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => { form.reset(); open(); }}>
            New Withdrawal
          </Button>
        )}
      </Group>

      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Recorded By</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={4} ta="center">Loading...</Table.Td></Table.Tr>
            ) : withdrawals.length === 0 ? (
              <Table.Tr><Table.Td colSpan={4} ta="center">No withdrawals recorded.</Table.Td></Table.Tr>
            ) : withdrawals.map((w) => (
              <Table.Tr key={w.id}>
                <Table.Td>{w.date}</Table.Td>
                <Table.Td>₹{Number(w.amount).toLocaleString()}</Table.Td>
                <Table.Td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{w.reason}</Table.Td>
                <Table.Td>{w.requested_by_name ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title="New Cash Withdrawal" size={{ base: '95%', sm: 'lg' }}>
        <form onSubmit={form.onSubmit(v => createMutation.mutate(v))}>
          <Stack gap="sm">
            <NumberInput
              label="Amount (₹)"
              min={1}
              {...form.getInputProps('amount')}
              required
            />
            <Textarea
              label="Reason"
              placeholder="Purpose of withdrawal..."
              rows={3}
              {...form.getInputProps('reason')}
              required
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>Cancel</Button>
              <Button type="submit" loading={createMutation.isPending}>Record Withdrawal</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
