import { useState } from 'react';
import { Table, Button, Group, Text, Modal, Textarea, NumberInput, Badge } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
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
  const canCancel = permissions.delete_reservation || permissions.is_superuser;
  const [convertReservation, setConvertReservation] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFee, setCancelFee] = useState(0);
  const [cancelOpened, { open: openCancel, close: closeCancel }] = useDisclosure(false);

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, cancellation_fee }) =>
      api.post(`/v1/reservation/${id}/cancel/`, { reason, cancellation_fee }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      closeCancel();
      setCancelReason('');
      notifySuccess('Reservation cancelled.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to cancel reservation.')),
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
        {res.is_cancelled && <Badge color="red" size="sm" mr="xs">Cancelled</Badge>}
        <Group gap="xs">
          {canViewReminders && !res.is_cancelled && <ReminderPopover reservation={res} />}
          {!isOccupied && !res.is_cancelled && (
            <Button size="xs" variant="light" onClick={() => handleConvert(res)}>Convert</Button>
          )}
          {canCancel && !res.is_cancelled && (
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => {
                setCancelTarget(res);
                setCancelReason('');
                setCancelFee(Number(room.cancellation_fee ?? 0));
                openCancel();
              }}
            >
              Cancel
            </Button>
          )}
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

      <Modal opened={cancelOpened} onClose={closeCancel} title="Cancel Reservation">
        {cancelTarget && (
          <Text size="sm" c="dimmed" mb="sm">
            {cancelTarget.check_in_date} – {cancelTarget.check_out_date}
          </Text>
        )}
        <Textarea
          label="Reason for Cancellation"
          placeholder="Enter reason..."
          value={cancelReason}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          rows={3}
          mb="sm"
          required
        />
        <NumberInput
          label="Cancellation Fee (₹)"
          description="Leave at 0 to waive."
          min={0}
          value={cancelFee}
          onChange={setCancelFee}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCancel}>Back</Button>
          <Button
            color="red"
            disabled={!cancelReason.trim()}
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({
              id: cancelTarget.id,
              reason: cancelReason,
              cancellation_fee: cancelFee,
            })}
          >
            Confirm Cancellation
          </Button>
        </Group>
      </Modal>
    </>
  );
}
