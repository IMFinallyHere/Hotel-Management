import { Table, Button, Badge, Group, Text } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, QUERY_KEYS_OPS, fetchNcRequests } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import usePermissions from '../hooks/usePermissions';

const STATUS_COLORS = { pending: 'orange', approved: 'green', rejected: 'red' };

export default function NCRequests() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const isAdmin = permissions.is_superuser;

  const { data: requests = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.ncRequests,
    queryFn: fetchNcRequests,
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/v1/nc-requests/${id}/approve/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS_OPS.ncRequests);
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      notifySuccess('NC request approved.');
    },
    onError: (e) => notifyError(e.response?.data?.error ?? 'Failed to approve.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => api.post(`/v1/nc-requests/${id}/reject/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS_OPS.ncRequests);
      notifySuccess('NC request rejected.');
    },
    onError: (e) => notifyError(e.response?.data?.error ?? 'Failed to reject.'),
  });

  const rows = requests.map((req) => (
    <Table.Tr key={req.id}>
      <Table.Td>{req.room_number}</Table.Td>
      <Table.Td>{(req.guest_names || []).join(', ') || '—'}</Table.Td>
      <Table.Td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{req.reason}</Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[req.status]} variant="light">{req.status}</Badge>
      </Table.Td>
      <Table.Td>{req.requested_by_name ?? '—'}</Table.Td>
      <Table.Td>{dayjs(req.created_on).format('DD MMM YYYY, hh:mm A')}</Table.Td>
      <Table.Td>{req.reviewed_by_name ?? '—'}</Table.Td>
      <Table.Td>
        {isAdmin && req.status === 'pending' && (
          <Group gap="xs">
            <Button size="xs" color="green" variant="light" onClick={() => approveMutation.mutate(req.id)} loading={approveMutation.isPending}>
              Approve
            </Button>
            <Button size="xs" color="red" variant="light" onClick={() => rejectMutation.mutate(req.id)} loading={rejectMutation.isPending}>
              Reject
            </Button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Text fw={600} size="lg">NC (Not Chargeable) Requests</Text>
        <Badge color="orange" variant="light">
          {requests.filter(r => r.status === 'pending').length} pending
        </Badge>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Room</Table.Th>
            <Table.Th>Guests</Table.Th>
            <Table.Th>Reason</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Requested By</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>Reviewed By</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={8} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={8} ta="center">No NC requests.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>
    </>
  );
}
