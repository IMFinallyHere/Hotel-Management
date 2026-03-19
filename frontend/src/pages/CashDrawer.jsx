import { useState } from 'react';
import { Table, Button, Badge, Group, Text, Modal, NumberInput, Textarea, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS_OPS, fetchCashWithdrawals } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

const STATUS_COLORS = { pending: 'orange', approved: 'green', rejected: 'red' };

export default function CashDrawer() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canWithdraw = permissions.add_cashwithdrawal  || permissions.is_superuser;
  const canApprove  = permissions.change_cashwithdrawal || permissions.is_superuser;

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
      notifySuccess('Withdrawal request submitted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to submit withdrawal.')),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/v1/cash-withdrawals/${id}/approve/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS_OPS.cashWithdrawals);
      notifySuccess('Withdrawal approved.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to approve.')),
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => api.post(`/v1/cash-withdrawals/${id}/reject/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS_OPS.cashWithdrawals);
      notifySuccess('Withdrawal rejected.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to reject.')),
  });

  const rows = withdrawals.map((w) => (
    <Table.Tr key={w.id}>
      <Table.Td>{w.date}</Table.Td>
      <Table.Td>₹{w.amount}</Table.Td>
      <Table.Td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{w.reason}</Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[w.status]} variant="light">{w.status}</Badge>
      </Table.Td>
      <Table.Td>{w.requested_by_name ?? '—'}</Table.Td>
      <Table.Td>{w.reviewed_by_name ?? '—'}</Table.Td>
      <Table.Td>
        {canApprove && w.status === 'pending' && (
          <Group gap="xs">
            <Button size="xs" color="green" variant="light" onClick={() => approveMutation.mutate(w.id)} loading={approveMutation.isPending}>
              Approve
            </Button>
            <Button size="xs" color="red" variant="light" onClick={() => rejectMutation.mutate(w.id)} loading={rejectMutation.isPending}>
              Reject
            </Button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md" justify="space-between" wrap="wrap">
        <Group wrap="wrap">
          <Text fw={600} size="lg">Cash Drawer / Petty Cash</Text>
          <Badge color="orange" variant="light">
            {withdrawals.filter(w => w.status === 'pending').length} pending
          </Badge>
        </Group>
        {canWithdraw && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => { form.reset(); open(); }}>
            New Withdrawal
          </Button>
        )}
      </Group>

      <Table.ScrollContainer minWidth={600}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Reason</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Requested By</Table.Th>
            <Table.Th>Reviewed By</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={7} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={7} ta="center">No withdrawals recorded.</Table.Td></Table.Tr>
          ) : rows}
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
              <Button type="submit" loading={createMutation.isPending}>Submit</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
