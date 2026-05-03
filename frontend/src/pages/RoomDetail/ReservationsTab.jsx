import { useState } from 'react';
import { Table, Button, Group, Text, Modal, Textarea, NumberInput, Badge, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { QUERY_KEYS, fetchPaymentMethods } from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';
import { CustomerList } from '../../components/CustomerTable';
import ReminderPopover from './ReminderPopover';
import ConvertCheckinModal from './ConvertCheckinModal';
import usePermissions from '../../hooks/usePermissions';

export default function ReservationsTab({ room, reservations, isOccupied, configMap = {} }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const canViewReminders = permissions.view_reservationreminder || permissions.is_superuser;
  const canCancel = permissions.delete_reservation || permissions.is_superuser;
  const canAddBooking = permissions.add_roomstaylogs || permissions.is_superuser;
  const [convertReservation, setConvertReservation] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFee, setCancelFee] = useState(0);
  const [refundPaymentMethod, setRefundPaymentMethod] = useState(null);
  const [refundNote, setRefundNote] = useState('');
  const [cancelOpened, { open: openCancel, close: closeCancel }] = useDisclosure(false);

  const [advanceTarget, setAdvanceTarget] = useState(null);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advanceOpened, { open: openAdvance, close: closeAdvance }] = useDisclosure(false);

  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods(true) });
  const paymentTypeOptions = paymentMethods.map(p => ({ value: String(p.id), label: p.name }));

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, cancellation_fee, refund_amount, refund_payment_method, refund_note }) =>
      api.post(`/v1/reservation/${id}/cancel/`, {
        reason,
        cancellation_fee,
        refund_amount,
        refund_payment_method,
        refund_note,
      }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      closeCancel();
      setCancelReason('');
      setCancelFee(0);
      setRefundPaymentMethod(null);
      setRefundNote('');
      notifySuccess('Reservation cancelled.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to cancel reservation.')),
  });

  const addAdvanceMutation = useMutation({
    mutationFn: ({ groupId, amount, payment_method, note }) =>
      api.post(`/v1/groups/${groupId}/advance/`, { amount, payment_method, note }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      closeAdvance();
      setAdvanceAmount(0);
      setAdvanceMethod(null);
      setAdvanceNote('');
      notifySuccess('Advance payment recorded.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to record advance.')),
  });

  const handleConvert = (reservation) => {
    setConvertReservation(reservation);
    openConvert();
  };

  const cancelGroupAdvance = Number(cancelTarget?.group_advance_available ?? 0);
  const isPartialGroupCancel = Number(cancelTarget?.group_active_reservation_count ?? 0) > 1;
  const refundAmount = isPartialGroupCancel ? 0 : Math.max(0, cancelGroupAdvance - Number(cancelFee || 0));

  const rows = reservations.map((res) => (
    <Table.Tr key={res.id}>
      <Table.Td>{res.check_in_date}</Table.Td>
      <Table.Td>{res.check_out_date}</Table.Td>
      <Table.Td>₹{res.price}</Table.Td>
      <Table.Td><CustomerList groupId={res.group} /></Table.Td>
      <Table.Td>
        {res.is_converted && <Badge color="blue" size="sm" mr="xs">Converted</Badge>}
        {res.is_cancelled && <Badge color="red" size="sm" mr="xs">Cancelled</Badge>}
        <Group gap="xs">
          {canViewReminders && !res.is_cancelled && !res.is_converted && <ReminderPopover reservation={res} />}
          {!isOccupied && !res.is_cancelled && !res.is_converted && (
            <Button size="xs" variant="light" onClick={() => handleConvert(res)}>Convert</Button>
          )}
          {!res.is_cancelled && !res.is_converted && (
            <Button
              size="xs"
              variant="light"
              color="teal"
              onClick={() => {
                setAdvanceTarget(res);
                setAdvanceAmount(0);
                setAdvanceMethod(null);
                setAdvanceNote('');
                openAdvance();
              }}
            >
              Add Advance
            </Button>
          )}
          {canCancel && !res.is_cancelled && !res.is_converted && (
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => {
                setCancelTarget(res);
                setCancelReason('');
                const fee = Number(room.cancellation_fee ?? 0);
                setCancelFee(fee);
                setRefundPaymentMethod(res.group_advance_payment_methods?.[0]?.id ? String(res.group_advance_payment_methods[0].id) : null);
                setRefundNote('');
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

      <Modal opened={advanceOpened} onClose={closeAdvance} title="Add Advance Payment">
        {advanceTarget && (
          <Text size="sm" c="dimmed" mb="sm">
            Group advance for {advanceTarget.check_in_date} – {advanceTarget.check_out_date}
          </Text>
        )}
        <NumberInput
          label="Amount (₹)"
          min={1}
          value={advanceAmount}
          onChange={setAdvanceAmount}
          mb="sm"
          required
        />
        <Select
          label="Payment Method"
          placeholder="Select method"
          data={paymentTypeOptions}
          value={advanceMethod}
          onChange={setAdvanceMethod}
          mb="sm"
          required
        />
        <Textarea
          label="Note"
          placeholder="Optional note..."
          value={advanceNote}
          onChange={(e) => setAdvanceNote(e.currentTarget.value)}
          rows={2}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeAdvance}>Back</Button>
          <Button
            color="teal"
            disabled={!advanceAmount || !advanceMethod}
            loading={addAdvanceMutation.isPending}
            onClick={() => addAdvanceMutation.mutate({
              groupId: advanceTarget.group,
              amount: advanceAmount,
              payment_method: Number(advanceMethod),
              note: advanceNote,
            })}
          >
            Record Advance
          </Button>
        </Group>
      </Modal>

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
          description="Amount retained from the advance."
          min={0}
          value={cancelFee}
          onChange={setCancelFee}
          mb="sm"
        />
        <NumberInput
          label="Refund Amount (₹)"
          description={
            isPartialGroupCancel
              ? 'Partial group cancellation: advance remains against the remaining rooms.'
              : `Group advance available: ₹${cancelGroupAdvance.toLocaleString()} · Cancellation fee retained: ₹${Number(cancelFee || 0).toLocaleString()}`
          }
          value={refundAmount}
          readOnly
          hideControls
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-gray-1)',
              color: 'var(--mantine-color-dark-7)',
              fontWeight: 600,
            },
          }}
          mb="sm"
        />
        <Select
          label="Refund Method"
          placeholder="Select payment method"
          data={paymentTypeOptions}
          value={refundPaymentMethod}
          onChange={setRefundPaymentMethod}
          disabled={!refundAmount}
          mb="sm"
        />
        <Textarea
          label="Refund Note"
          placeholder="Optional note..."
          value={refundNote}
          onChange={(e) => setRefundNote(e.currentTarget.value)}
          rows={2}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCancel}>Back</Button>
          <Button
            color="red"
            disabled={!cancelReason.trim() || (Number(refundAmount) > 0 && !refundPaymentMethod)}
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({
              id: cancelTarget.id,
              reason: cancelReason,
              cancellation_fee: cancelFee,
              refund_amount: refundAmount,
              refund_payment_method: refundPaymentMethod ? Number(refundPaymentMethod) : null,
              refund_note: refundNote,
            })}
          >
            Confirm Cancellation
          </Button>
        </Group>
      </Modal>
    </>
  );
}
