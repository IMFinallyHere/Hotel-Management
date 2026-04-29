import { useState } from 'react';
import { Table, Button, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { QUERY_KEYS } from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';
import { CustomerList } from '../../components/CustomerTable';
import ReminderPopover from './ReminderPopover';
import ConvertCheckinModal from './ConvertCheckinModal';
import usePermissions from '../../hooks/usePermissions';

export default function ReservationsTab({ room, reservations, isOccupied, configMap = {} }) {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canViewReminders = permissions.view_reservationreminder || permissions.is_superuser;
  const [convertReservation, setConvertReservation] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/reservation/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      notifySuccess('Reservation deleted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete reservation.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete reservation',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const handleConvert = (reservation) => {
    setConvertReservation(reservation);
    openConvert();
  };

  const rows = reservations.map((res) => (
    <Table.Tr key={res.id}>
      <Table.Td>{res.check_in_date}</Table.Td>
      <Table.Td>{res.check_out_date}</Table.Td>
      <Table.Td>₹{res.price}</Table.Td>
      <Table.Td><CustomerList groupId={res.group} /></Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canViewReminders && <ReminderPopover reservation={res} />}
          {!isOccupied && (
            <Button size="xs" variant="light" onClick={() => handleConvert(res)}>Convert</Button>
          )}
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(res.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Check-In</Table.Th>
            <Table.Th>Check-Out</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Guests</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={5} ta="center">No reservations for this room.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      {convertReservation && (
        <ConvertCheckinModal
          opened={convertOpened}
          onClose={closeConvert}
          reservation={convertReservation}
          room={room}
          configMap={configMap}
        />
      )}
    </>
  );
}
