import { useState } from 'react';
import {
  Tabs, Button, Badge, Group, Text, Loader, Center,
  NumberInput, Select, Modal, Divider, Textarea, Checkbox, Alert,
} from '@mantine/core';
import { IconArrowLeft, IconLogout, IconAlertTriangle } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
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

  const checkoutMutation = useMutation({
    mutationFn: ({ logId, overtime_fee_charged }) => api.post(`/v1/checkout/${logId}/`, { overtime_fee_charged }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Checkout failed.')),
  });

  const [shiftOpened, { open: openShift, close: closeShift }] = useDisclosure(false);
  const [shiftRoomId, setShiftRoomId] = useState(null);
  const [shiftReason, setShiftReason] = useState('');
  const [shiftPrice, setShiftPrice] = useState(0);
  const [applyExtraBeds, setApplyExtraBeds] = useState(true);
  const [shiftExtraBed, setShiftExtraBed] = useState(0);
  const [shiftExtraBedPrice, setShiftExtraBedPrice] = useState(0);

  const [payCheckoutOpened, { open: openPayCheckout, close: closePayCheckout }] = useDisclosure(false);
  const [payCheckoutAmount, setPayCheckoutAmount] = useState(0);
  const [payCheckoutType, setPayCheckoutType] = useState(null);

  const [cancelStayOpened, { open: openCancelStay, close: closeCancelStay }] = useDisclosure(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFee, setCancelFee] = useState(0);

  const [overtimeFeeOpened, { open: openOvertimeFee, close: closeOvertimeFee }] = useDisclosure(false);
  const [overtimeFeeCharged, setOvertimeFeeCharged] = useState(0);

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

  const payAndCheckoutMutation = useMutation({
    mutationFn: async ({ logId, payment_method, amount, overtime_fee_charged }) => {
      await api.post(`/v1/stay-logs/${logId}/payments/`, { payment_method, amount, note: 'Collected at checkout' });
      await api.post(`/v1/checkout/${logId}/`, { overtime_fee_charged });
    },
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closePayCheckout();
      notifySuccess('Payment recorded and checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Pay & checkout failed.')),
  });

  const cancelStayMutation = useMutation({
    mutationFn: ({ logId, reason, cancellation_fee }) =>
      api.post(`/v1/stay-logs/${logId}/cancel/`, { reason, cancellation_fee }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeCancelStay();
      setCancelReason('');
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
  if (activeLog) { statusColor = 'red'; statusLabel = 'Occupied'; }
  else if (room.status === 'cleaning') { statusColor = 'violet'; statusLabel = 'Cleaning'; }
  else if (room.status === 'out_of_order') { statusColor = 'dark'; statusLabel = 'Out of Order'; }
  else if (nextReservation) { statusColor = 'orange'; statusLabel = 'Reserved'; }

  const proceedCheckout = (overtimeFee) => {
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomTotal = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const amenityTotal = (activeLog.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const gstAmount = computeGst(activeLog, nights, configMap['gst_percent']);
    const billTotal = activeLog.is_nc ? 0 : (activeLog.gst_inclusive ? (roomTotal + amenityTotal + overtimeFee) : (roomTotal + amenityTotal + overtimeFee + gstAmount));
    const gstPct = Number(configMap['gst_percent'] ?? 0) / 100;
    const foodEffective = (o) => Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct));
    const unpaidFood = (activeLog.food_orders || []).filter(o => !o.is_paid).reduce((s, o) => s + foodEffective(o), 0);
    const totalPaid = (activeLog.payments || []).reduce((s, p) => s + Number(p.amount), 0);
    const outstandingAmt = billTotal + unpaidFood - totalPaid;

    if (outstandingAmt > 0) {
      setPayCheckoutAmount(outstandingAmt);
      setPayCheckoutType(null);
      openPayCheckout();
    } else {
      modals.openConfirmModal({
        title: 'Confirm checkout',
        children: <Text size="sm">Check out this room?</Text>,
        labels: { confirm: 'Checkout', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => checkoutMutation.mutate({ logId: activeLog.id, overtime_fee_charged: overtimeFee }),
      });
    }
  };

  const handleCheckout = () => {
    if (isLogOvertime(activeLog) && Number(room.overtime_fee) > 0) {
      setOvertimeFeeCharged(Number(room.overtime_fee));
      openOvertimeFee();
    } else {
      proceedCheckout(0);
    }
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
                setCancelFee(Number(room.cancellation_fee ?? 0));
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

      {/* Pay + Checkout Modal */}
      <Modal opened={payCheckoutOpened} onClose={closePayCheckout} title="Outstanding Balance">
        <Text size="sm" c="dimmed" mb="md">
          Full payment is required before checkout. Please collect the outstanding amount.
        </Text>
        <Text fw={600} size="lg" mb="md" c="red">
          Outstanding: ₹{payCheckoutAmount}
        </Text>
        <Select
          label="Payment Type"
          placeholder="Select type"
          data={paymentTypeOptions}
          value={payCheckoutType}
          onChange={setPayCheckoutType}
          mb="sm"
        />
        <NumberInput
          label="Amount (₹)"
          value={payCheckoutAmount}
          onChange={setPayCheckoutAmount}
          min={1}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closePayCheckout}>Cancel</Button>
          <Button
            color="teal"
            disabled={!payCheckoutType || !payCheckoutAmount}
            loading={payAndCheckoutMutation.isPending}
            onClick={() => payAndCheckoutMutation.mutate({
              logId: activeLog.id,
              payment_method: Number(payCheckoutType),
              amount: payCheckoutAmount,
              overtime_fee_charged: overtimeFeeCharged,
            })}
          >
            Pay & Checkout
          </Button>
        </Group>
      </Modal>

      {/* Overtime Fee Confirmation Modal */}
      <Modal opened={overtimeFeeOpened} onClose={closeOvertimeFee} title="Overtime Fee">
        <Alert icon={<IconAlertTriangle size={16} />} color="yellow" mb="md">
          This room is overtime. Confirm the overtime fee to charge before proceeding.
        </Alert>
        <NumberInput
          label="Overtime Fee (₹)"
          description="Set to 0 to waive the fee."
          min={0}
          value={overtimeFeeCharged}
          onChange={setOvertimeFeeCharged}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeOvertimeFee}>Cancel</Button>
          <Button
            color="red"
            onClick={() => {
              closeOvertimeFee();
              proceedCheckout(overtimeFeeCharged);
            }}
          >
            Proceed to Checkout
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
          description="Leave at 0 to waive."
          min={0}
          value={cancelFee}
          onChange={setCancelFee}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCancelStay}>Back</Button>
          <Button
            color="orange"
            disabled={!cancelReason.trim()}
            loading={cancelStayMutation.isPending}
            onClick={() => cancelStayMutation.mutate({
              logId: activeLog.id,
              reason: cancelReason,
              cancellation_fee: cancelFee,
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
        </Tabs.List>
        <Tabs.Panel value="status" pt="xs" keepMounted>
          <StatusTab room={room} activeLogs={activeLogs} isReservedToday={isReservedToday} />
          <Divider my="lg" label="Status Change Log" labelPosition="left" />
          <RoomStatusLogSection roomId={room.id} />
        </Tabs.Panel>
        <Tabs.Panel value="reservations" pt="xs">
          <ReservationsTab room={room} reservations={reservations} isOccupied={!!activeLog} configMap={configMap} />
        </Tabs.Panel>
        <Tabs.Panel value="details" pt="xs">
          <RoomDetailsTab room={room} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
