import { Table, Group, Badge, Button, Text, Loader, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchGroupCustomers } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';

export function CustomerList({ groupId }) {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(groupId),
    queryFn: () => fetchGroupCustomers(groupId),
    enabled: !!groupId,
  });
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);

  if (isLoading) return <Loader size="xs" />;
  return (
    <>
      <Group gap="xs" wrap="wrap">
        {customers.map(c => (
          <Badge
            key={c.id}
            variant="light"
            style={{ cursor: 'pointer' }}
            onClick={openDetail}
          >
            {c.name} ({c.number})
          </Badge>
        ))}
      </Group>
      <Modal opened={detailOpened} onClose={closeDetail} title="Guest Details" size="xl">
        <CustomerTable groupId={groupId} />
      </Modal>
    </>
  );
}

export function CustomerTable({ groupId, allowRemove = false, mainCustomerId = null }) {
  const qc = useQueryClient();
  const { data: customers = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(groupId),
    queryFn: () => fetchGroupCustomers(groupId),
    enabled: !!groupId,
  });

  const removeMutation = useMutation({
    mutationFn: (customerId) => api.delete(`/v1/group/${groupId}/customers/${customerId}/remove/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.groupCustomers(groupId));
      notifySuccess('Guest removed.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to remove guest.')),
  });

  const handleRemove = (customer) => modals.openConfirmModal({
    title: 'Remove guest',
    children: <Text size="sm">Remove {customer.name} from this room?</Text>,
    labels: { confirm: 'Remove', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => removeMutation.mutate(customer.id),
  });

  if (isLoading) return <Loader size="xs" />;
  if (customers.length === 0) return <Text size="sm" c="dimmed">No guests.</Text>;

  const genderLabel = { male: 'Male', female: 'Female', trans: 'Trans', other: 'Other' };

  return (
    <Table.ScrollContainer minWidth={700}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Phone</Table.Th>
            <Table.Th>Gender</Table.Th>
            <Table.Th>Address</Table.Th>
            <Table.Th>DOB</Table.Th>
            <Table.Th>ID Card 1</Table.Th>
            <Table.Th>ID Card 2</Table.Th>
            {allowRemove && <Table.Th>Action</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {customers.map((c, idx) => {
            const isMain = mainCustomerId ? c.id === mainCustomerId : idx === 0;
            return (
              <Table.Tr key={c.id}>
                <Table.Td>{c.name}{isMain && <Badge size="xs" variant="light" ml="xs">Main</Badge>}</Table.Td>
                <Table.Td>{c.number}</Table.Td>
                <Table.Td>{genderLabel[c.gender] ?? c.gender ?? '—'}</Table.Td>
                <Table.Td>{[c.address, c.pincode].filter(Boolean).join(', ') || '—'}</Table.Td>
                <Table.Td>{c.date_of_birth ?? '—'}</Table.Td>
                <Table.Td>{c.identity_card_1 ? <a href={c.identity_card_1} target="_blank" rel="noopener noreferrer">View</a> : '—'}</Table.Td>
                <Table.Td>{c.identity_card_2 ? <a href={c.identity_card_2} target="_blank" rel="noopener noreferrer">View</a> : '—'}</Table.Td>
                {allowRemove && (
                  <Table.Td>
                    {!isMain && (
                      <Button size="xs" color="red" variant="light" onClick={() => handleRemove(c)} loading={removeMutation.isPending}>
                        Remove
                      </Button>
                    )}
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
