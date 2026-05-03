import { useState } from 'react';
import {
  Tabs, Button, Badge, Group, Text, Loader, Center,
  NumberInput, Select, Modal, Textarea, Checkbox, Alert,
} from '@mantine/core';
import { IconArrowLeft, IconLogout, IconAlertTriangle } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../api/client';
import {
  QUERY_KEYS,
  fetchRoom, fetchRooms, fetchActiveLogs, fetchRoomReservations, fetchConfigurations, fetchPaymentMethods,
} from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';
import { parseConfigs, isLogOvertime, computeOvertimeFee, computeGst } from '../../utils/configUtils';
import StatusTab from './StatusTab';
import ReservationsTab from './ReservationsTab';
import RoomDetailsTab from './RoomDetailsTab';
import RoomStatusLogSection from './RoomStatusLogSection';

export default function RoomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: QUERY_KEYS.room(id),
    queryFn: () => fetchRoom(id),
  });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const { data: reservations = [] } = useQuery({
    queryKey: QUERY_KEYS.roomReservations(id),
    queryFn: () => fetchRoomReservations(id),
  });
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);
  const { data: allRooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods() });

  const [checkoutOpened, { open: openCheckoutModal, close: closeCheckoutModal }] = useDisclosure(false);
  const [coOvertimeFee, setCoOvertimeFee] = useState(0);
  const [coPaymentType, setCoPaymentType] = useState(null);
  const [coPaymentAmount, setCoPaymentAmount] = useState(0);

  const [shiftOpened, { open: openShift, close: closeShift }] = useDisclosure(false);
  const [shiftRoomId, setShiftRoomId] = useState(null);
  const [shiftReason, setShiftReason] = useState('');
  const [shiftPrice, setShiftPrice] = useState(0);
  const [applyExtraBeds, setApplyExtraBeds] = useState(true);
  const [shiftExtraBed, setShiftExtraBed] = useState(0);
  const [shiftExtraBedPrice, setShiftExtraBedPrice] = useState(0);


  const [cancelStayOpened, { open: openCancelStay, close: closeCancelStay }] = useDisclosure(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFee, setCancelFee] = useState(0);
  const [cancelFeePaymentMethod, setCancelFeePaymentMethod] = useState(null);
  const [cancelRefundPaymentMethod, setCancelRefundPaymentMethod] = useState(null);
  const [cancelRefundNote, setCancelRefundNote] = useState('');


  const shiftMutation = useMutation({
    mutationFn: ({ logId, new_room, reason, price, apply_extra_beds, extra_bed, extra_per_bed_price }) =>
      api.post(`/v1/stay-logs/${logId}/shift/`, { new_room, reason, price, apply_extra_beds, extra_bed, extra_per_bed_price }),
    onSuccess: (res) => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeShift();
      setShiftRoomId(null);
      setShiftReason('');
      notifySuccess(`Guest shifted to room ${res.data.new_room_number}.`);
      navigate(`/rooms/${res.data.new_room_id}`);
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to shift room.')),
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ logId, overtime_fee_charged, payment_method, amount }) => {
      if (payment_method && amount > 0) {
        await api.post(`/v1/stay-logs/${logId}/payments/`, { payment_method, amount, note: 'Collected at checkout' });
      }
      await api.post(`/v1/checkout/${logId}/`, { overtime_fee_charged });
    },
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeCheckoutModal();
      notifySuccess('Checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Checkout failed.')),
  });

  const cancelStayMutation = useMutation({
    mutationFn: ({ logId, reason, cancellation_fee, cancellation_fee_payment_method, refund_amount, refund_payment_method, refund_note }) =>
      api.post(`/v1/stay-logs/${logId}/cancel/`, {
        reason,
        cancellation_fee,
        cancellation_fee_payment_method,
        refund_amount,
        refund_payment_method,
        refund_note,
      }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeCancelStay();
      setCancelReason('');
      setCancelFeePaymentMethod(null);
      setCancelRefundPaymentMethod(null);
      setCancelRefundNote('');
      notifySuccess('Stay cancelled. Room moved to cleaning.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to cancel stay.')),
  });

  const markAvailableMutation = useMutation({
    mutationFn: () => api.patch(`/v1/room/${room.id}/`, { status: 'available' }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.room(id));
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Room marked as available.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to update room status.')),
  });

  if (roomLoading) {
    return <Center h={200}><Loader size="lg" /></Center>;
  }

  if (!room) {
    return <Text>Room not found.</Text>;
  }

  const activeLog = activeLogs.find(l => l.room === room.id && l.check_out === null) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const nextReservation = reservations
    .filter(r => r.check_in_date <= today && r.check_out_date >= today)
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0] ?? null;

  const isReservedToday = !activeLog && !!nextReservation;

  let statusColor = 'teal';
  let statusLabel = 'Available';
  if (!room.is_active) { statusColor = 'gray'; statusLabel = 'Inactive'; }
  else if (activeLog) { statusColor = 'red'; statusLabel = 'Occupied'; }
  else if (room.status === 'cleaning') { statusColor = 'violet'; statusLabel = 'Cleaning'; }
  else if (room.status === 'out_of_order') { statusColor = 'dark'; statusLabel = 'Out of Order'; }
  else if (nextReservation) { statusColor = 'orange'; statusLabel = 'Reserved'; }

  const computeCheckoutOutstanding = (overtimeFee) => {
    if (!activeLog) return 0;
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomTotal = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const amenityTotal = (activeLog.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const gstAmount = computeGst(activeLog, nights, configMap['gst_percent']);
    const billTotal = activeLog.is_nc ? 0 : (activeLog.gst_inclusive ? (roomTotal + amenityTotal + overtimeFee) : (roomTotal + amenityTotal + overtimeFee + gstAmount));
    const gstPct = Number(configMap['gst_percent'] ?? 0) / 100;
    const unpaidFood = (activeLog.food_orders || []).filter(o => !o.is_paid)
      .reduce((s, o) => s + Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct)), 0);
    const totalPaid = (activeLog.payments || []).reduce((s, p) => s + Number(p.amount), 0);
    return Math.max(0, billTotal + unpaidFood - totalPaid);
  };

  const handleCheckout = () => {
    const initialFee = isLogOvertime(activeLog)
      ? (Number(room.overtime_fee) > 0 ? Number(room.overtime_fee) : computeOvertimeFee(activeLog))
      : 0;
    setCoOvertimeFee(initialFee);
    setCoPaymentType(null);
    setCoPaymentAmount(computeCheckoutOutstanding(initialFee));
    openCheckoutModal();
  };

  const occupiedIds = new Set(activeLogs.map(l => l.room));
  const availableRooms = allRooms.filter(r => r.id !== room.id && !occupiedIds.has(r.id));

  const handleOpenShift = () => {
    setShiftRoomId(null);
    setShiftReason('');
    setShiftPrice(activeLog ? Number(activeLog.price) : 0);
    setApplyExtraBeds(activeLog ? activeLog.extra_bed > 0 : false);
    setShiftExtraBed(activeLog ? activeLog.extra_bed : 0);
    setShiftExtraBedPrice(activeLog ? Number(activeLog.extra_per_bed_price) : 0);
    openShift();
  };

  const paymentTypeOptions = paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }));
  const activeLogPaidTotal = activeLog ? (activeLog.payments || []).reduce((sum, p) => sum + Number(p.amount), 0) : 0;
  const cancelRefundAmount = Math.max(0, activeLogPaidTotal - Number(cancelFee || 0));

  return (
    <div>
      <Group mb="xs" align="center">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/rooms')}>
          Back
        </Button>
        <div>
          <Text fw={700} size="lg">Room {room.room_number}</Text>
          <Badge color={statusColor} size="sm" mt={2}>{statusLabel}</Badge>
          {activeLog && isLogOvertime(activeLog) && (
            <Badge color="yellow" size="sm" ml="xs">Overtime</Badge>
          )}
          {(activeLog ? (activeLog.is_ac ?? room.is_ac) : room.is_ac)
            ? <Badge color="blue" size="sm" ml="xs">AC</Badge>
            : <Badge color="gray" variant="outline" size="sm" ml="xs">Non-AC</Badge>
          }
        </div>
        {!activeLog && room.status === 'cleaning' && (
          <Button
            size="xs"
            color="violet"
            variant="light"
            loading={markAvailableMutation.isPending}
            onClick={() => markAvailableMutation.mutate()}
          >
            Mark Available
          </Button>
        )}
        {activeLog && (
          <Group gap="xs" style={{ marginLeft: 'clamp(16px, 8vw, 130px)' }}>
            <Button variant="outline" color="blue" onClick={handleOpenShift}>
              Shift Room
            </Button>
            <Button
              color="orange"
              variant="outline"
              onClick={() => {
                setCancelReason('');
                const fee = Number(room.cancellation_fee ?? 0);
                const lastPayment = (activeLog.payments || []).slice(-1)[0];
                setCancelFee(fee);
                setCancelRefundPaymentMethod(lastPayment?.payment_method ? String(lastPayment.payment_method) : null);
                setCancelRefundNote('');
                openCancelStay();
              }}
            >
              Cancel Stay
            </Button>
            <Button color="red" variant="outline" leftSection={<IconLogout size={16} />} onClick={handleCheckout} loading={checkoutMutation.isPending}>
              Checkout
            </Button>
          </Group>
        )}
      </Group>

      {/* Shift Room Modal */}
      <Modal opened={shiftOpened} onClose={closeShift} title="Shift Room">
        <Select
          label="Move guest to"
          placeholder="Select available room"
          data={availableRooms.map(r => ({ value: String(r.id), label: `Room ${r.room_number} — ${r.beds} bed${r.beds !== 1 ? 's' : ''} — ₹${r.price}` }))}
          value={shiftRoomId}
          onChange={setShiftRoomId}
          searchable
          mb="xs"
        />
        <NumberInput
          label="Price (₹/night)"
          min={0}
          value={shiftPrice}
          onChange={setShiftPrice}
          mb="sm"
        />
        {activeLog?.extra_bed > 0 && (
          <>
            <Checkbox
              label="Apply extra beds to new room"
              checked={applyExtraBeds}
              onChange={(e) => setApplyExtraBeds(e.currentTarget.checked)}
              mb="sm"
            />
            {applyExtraBeds && (
              <Group grow mb="sm">
                <NumberInput label="Extra Beds" min={0} value={shiftExtraBed} onChange={setShiftExtraBed} />
                <NumberInput label="Price/Extra Bed (₹)" min={0} value={shiftExtraBedPrice} onChange={setShiftExtraBedPrice} />
              </Group>
            )}
          </>
        )}
        <Textarea
          label="Reason"
          placeholder="Why is this guest being shifted?"
          value={shiftReason}
          onChange={(e) => setShiftReason(e.target.value)}
          rows={3}
          mb="md"
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeShift}>Cancel</Button>
          <Button
            color="blue"
            disabled={!shiftRoomId || !shiftReason.trim()}
            loading={shiftMutation.isPending}
            onClick={() => shiftMutation.mutate({
              logId: activeLog.id,
              new_room: Number(shiftRoomId),
              reason: shiftReason,
              price: shiftPrice,
              apply_extra_beds: applyExtraBeds,
              extra_bed: shiftExtraBed,
              extra_per_bed_price: shiftExtraBedPrice,
            })}
          >
            Confirm Shift
          </Button>
        </Group>
      </Modal>

      {/* Unified Checkout Modal */}
      <Modal opened={checkoutOpened} onClose={closeCheckoutModal} title={`Checkout — Room ${room.room_number}`} size="sm">
        {activeLog && (activeLog.notes || []).length > 0 && (
          <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
            <Text size="xs" fw={600} c="dimmed" mb={4}>STAY NOTES</Text>
            {activeLog.notes.map(n => (
              <Group key={n.id} gap={6} align="flex-start" wrap="nowrap" mb={4}
                style={{ background: 'var(--mantine-color-yellow-0)', border: '1px solid var(--mantine-color-yellow-3)', borderRadius: 6, padding: '4px 8px' }}>
                <Text size="xs" style={{ flex: 1 }}>{n.text}</Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{n.created_by_name}</Text>
              </Group>
            ))}
          </div>
        )}
        {activeLog && isLogOvertime(activeLog) && (
          <NumberInput
            label="Overtime Fee (₹)"
            description="Set to 0 to waive."
            min={0}
            value={coOvertimeFee}
            onChange={(val) => {
              setCoOvertimeFee(val);
              setCoPaymentAmount(computeCheckoutOutstanding(val ?? 0));
            }}
            mb="md"
          />
        )}
        {coPaymentAmount > 0 ? (
          <>
            <Text size="sm" c="red" fw={600} mb="sm">Outstanding: ₹{computeCheckoutOutstanding(coOvertimeFee)}</Text>
            <Select
              label="Payment Method"
              placeholder="Select method"
              data={paymentTypeOptions}
              value={coPaymentType}
              onChange={setCoPaymentType}
              mb="sm"
            />
            <NumberInput
              label="Amount (₹)"
              value={coPaymentAmount}
              onChange={setCoPaymentAmount}
              min={1}
              mb="md"
            />
          </>
        ) : (
          <Text size="sm" c="dimmed" mb="md">No outstanding balance.</Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCheckoutModal}>Cancel</Button>
          <Button
            color="red"
            disabled={coPaymentAmount > 0 && (!coPaymentType || !coPaymentAmount)}
            loading={checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate({
              logId: activeLog.id,
              overtime_fee_charged: coOvertimeFee,
              payment_method: coPaymentType ? Number(coPaymentType) : null,
              amount: coPaymentAmount,
            })}
          >
            Confirm Checkout
          </Button>
        </Group>
      </Modal>

      {/* Cancel Stay Modal */}
      <Modal opened={cancelStayOpened} onClose={closeCancelStay} title="Cancel Stay">
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" mb="md">
          This will cancel the stay and move the room to cleaning.
        </Alert>
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
          description={activeLogPaidTotal === 0 ? "Guest pays this directly — no advance to deduct from." : "Amount retained from collected payments."}
          min={0}
          value={cancelFee}
          onChange={setCancelFee}
          mb="sm"
        />
        {cancelFee > 0 && activeLogPaidTotal === 0 && (
          <Select
            label="Fee Payment Method"
            description="How the guest is paying the cancellation fee."
            placeholder="Select method"
            data={paymentTypeOptions}
            value={cancelFeePaymentMethod}
            onChange={setCancelFeePaymentMethod}
            mb="sm"
            required
          />
        )}
        <NumberInput
          label="Refund Amount (₹)"
          description={`Payments collected: ₹${activeLogPaidTotal.toLocaleString()} · Cancellation fee retained: ₹${Number(cancelFee || 0).toLocaleString()}`}
          value={cancelRefundAmount}
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
          value={cancelRefundPaymentMethod}
          onChange={setCancelRefundPaymentMethod}
          disabled={!cancelRefundAmount}
          mb="sm"
        />
        <Textarea
          label="Refund Note"
          placeholder="Optional note..."
          value={cancelRefundNote}
          onChange={(e) => setCancelRefundNote(e.currentTarget.value)}
          rows={2}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCancelStay}>Back</Button>
          <Button
            color="orange"
            disabled={
              !cancelReason.trim() ||
              (Number(cancelRefundAmount) > 0 && !cancelRefundPaymentMethod) ||
              (Number(cancelFee) > 0 && activeLogPaidTotal === 0 && !cancelFeePaymentMethod)
            }
            loading={cancelStayMutation.isPending}
            onClick={() => cancelStayMutation.mutate({
              logId: activeLog.id,
              reason: cancelReason,
              cancellation_fee: cancelFee,
              cancellation_fee_payment_method: cancelFeePaymentMethod ? Number(cancelFeePaymentMethod) : null,
              refund_amount: cancelRefundAmount,
              refund_payment_method: cancelRefundPaymentMethod ? Number(cancelRefundPaymentMethod) : null,
              refund_note: cancelRefundNote,
            })}
          >
            Confirm Cancellation
          </Button>
        </Group>
      </Modal>

      <Tabs defaultValue="status">
        <Tabs.List mb="md">
          <Tabs.Tab value="status">Status / Actions</Tabs.Tab>
          <Tabs.Tab value="reservations">Reservations</Tabs.Tab>
          <Tabs.Tab value="details">Room Details</Tabs.Tab>
          <Tabs.Tab value="logs">Logs</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="status" pt="xs" keepMounted>
          <StatusTab room={room} activeLogs={activeLogs} isReservedToday={isReservedToday} />
        </Tabs.Panel>
        <Tabs.Panel value="reservations" pt="xs">
          <ReservationsTab room={room} reservations={reservations} isOccupied={!!activeLog} configMap={configMap} />
        </Tabs.Panel>
        <Tabs.Panel value="details" pt="xs">
          <RoomDetailsTab room={room} />
        </Tabs.Panel>
        <Tabs.Panel value="logs" pt="xs">
          <RoomStatusLogSection roomId={room.id} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
