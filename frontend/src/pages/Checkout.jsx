import { useState } from 'react';
import { Table, Button, Badge, Group, TextInput, Text, Modal, NumberInput, Select, Stack, ActionIcon, Loader, Textarea, Checkbox } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconSearch, IconPackage, IconTrash, IconCash, IconBan, IconFileText } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, QUERY_KEYS_OPS, fetchActiveLogs, fetchRooms, fetchAmenities, fetchGroupCustomers, fetchConfigurations, fetchRoomTypes } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import { parseConfigs, computeOvertimeFee, computeGst } from '../utils/configUtils';
import InvoiceDocument from '../components/InvoiceDocument';

// ── Customer chips (badges that open detail modal) ──────────────────────────

function GuestChips({ customers, groupId }) {
  const [opened, { open, close }] = useDisclosure(false);
  if (!customers || customers.length === 0) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <>
      <Group gap={4} wrap="wrap">
        {customers.map(c => (
          <Badge key={c.id} variant="light" style={{ cursor: 'pointer' }} onClick={open}>
            {c.name}
          </Badge>
        ))}
      </Group>
      <Modal opened={opened} onClose={close} title="Guest Details" size="xl">
        <GuestDetailTable groupId={groupId} />
      </Modal>
    </>
  );
}

function GuestDetailTable({ groupId }) {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(groupId),
    queryFn: () => fetchGroupCustomers(groupId),
    enabled: !!groupId,
  });
  const genderLabel = { male: 'Male', female: 'Female', trans: 'Trans', other: 'Other' };
  if (isLoading) return <Loader size="sm" />;
  if (customers.length === 0) return <Text size="sm" c="dimmed">No guests.</Text>;
  return (
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
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {customers.map(c => (
          <Table.Tr key={c.id}>
            <Table.Td>{c.name}</Table.Td>
            <Table.Td>{c.number}</Table.Td>
            <Table.Td>{genderLabel[c.gender] ?? c.gender ?? '—'}</Table.Td>
            <Table.Td>{[c.address, c.pincode].filter(Boolean).join(', ') || '—'}</Table.Td>
            <Table.Td>{c.date_of_birth ?? '—'}</Table.Td>
            <Table.Td>{c.identity_card_1 ? <a href={c.identity_card_1} target="_blank" rel="noopener noreferrer">View</a> : '—'}</Table.Td>
            <Table.Td>{c.identity_card_2 ? <a href={c.identity_card_2} target="_blank" rel="noopener noreferrer">View</a> : '—'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export default function Checkout() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: logs = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: amenities = [] } = useQuery({ queryKey: QUERY_KEYS.amenities, queryFn: fetchAmenities });
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const configMap = parseConfigs(configs);
  const roomTypeMap = Object.fromEntries(roomTypes.map(rt => [rt.id, rt.name]));

  // Amenity modal
  const [amenityModal, { open: openAmenityModal, close: closeAmenityModal }] = useDisclosure(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [newAmenityId, setNewAmenityId] = useState(null);
  const [newAmenityQty, setNewAmenityQty] = useState(1);

  // Payment modal
  const [paymentModal, { open: openPaymentModal, close: closePaymentModal }] = useDisclosure(false);
  const [paymentLog, setPaymentLog] = useState(null);
  const [newPaymentType, setNewPaymentType] = useState(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState(0);
  const [newPaymentNote, setNewPaymentNote] = useState('');

  // Pay + Checkout modal (for enforced payment at checkout)
  const [payCheckoutModal, { open: openPayCheckoutModal, close: closePayCheckoutModal }] = useDisclosure(false);
  const [payCheckoutLog, setPayCheckoutLog] = useState(null);
  const [payCheckoutAmount, setPayCheckoutAmount] = useState(0);
  const [payCheckoutType, setPayCheckoutType] = useState(null);

  // NC Request modal
  const [ncModal, { open: openNcModal, close: closeNcModal }] = useDisclosure(false);
  const [ncLog, setNcLog] = useState(null);
  const [ncReason, setNcReason] = useState('');

  // Shift Room modal
  const [shiftModal, { open: openShiftModal, close: closeShiftModal }] = useDisclosure(false);
  const [shiftLog, setShiftLog] = useState(null);
  const [shiftRoomId, setShiftRoomId] = useState(null);
  const [shiftReason, setShiftReason] = useState('');
  const [applyExtraBeds, setApplyExtraBeds] = useState(true);
  const [shiftExtraBed, setShiftExtraBed] = useState(0);
  const [shiftExtraBedPrice, setShiftExtraBedPrice] = useState(0);

  const roomMap = Object.fromEntries(rooms.map(r => [r.id, r]));
  const occupiedRoomIds = new Set(logs.map(l => l.room));

  const filteredLogs = search
    ? logs.filter(l => {
        const q = search.toLowerCase();
        const roomNum = (roomMap[l.room]?.room_number ?? String(l.room)).toLowerCase();
        const guestNames = (l.customers || []).map(c => c.name.toLowerCase()).join(' ');
        return roomNum.includes(q) || guestNames.includes(q);
      })
    : logs;

  const checkoutMutation = useMutation({
    mutationFn: (id) => api.post(`/v1/checkout/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Checkout failed.')),
  });

  const payAndCheckoutMutation = useMutation({
    mutationFn: async ({ logId, payment_type, amount }) => {
      await api.post(`/v1/stay-logs/${logId}/payments/`, { payment_type, amount, note: 'Collected at checkout' });
      await api.post(`/v1/checkout/${logId}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closePayCheckoutModal();
      setPayCheckoutLog(null);
      setPayCheckoutType(null);
      notifySuccess('Payment recorded and checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Pay & checkout failed.')),
  });

  const addAmenityMutation = useMutation({
    mutationFn: ({ logId, amenity, quantity }) => api.post(`/v1/stay-logs/${logId}/amenities/`, { amenity, quantity }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      setNewAmenityId(null);
      setNewAmenityQty(1);
      notifySuccess('Amenity added.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to add amenity.')),
  });

  const removeAmenityMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/stay-logs/amenities/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      notifySuccess('Amenity removed.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to remove amenity.')),
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ logId, payment_type, amount, note }) =>
      api.post(`/v1/stay-logs/${logId}/payments/`, { payment_type, amount, note }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      setNewPaymentType(null);
      setNewPaymentAmount(0);
      setNewPaymentNote('');
      notifySuccess('Payment recorded.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to record payment.')),
  });

  const removePaymentMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/stay-logs/payments/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      notifySuccess('Payment removed.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to remove payment.')),
  });

  const createNcMutation = useMutation({
    mutationFn: ({ stay_log, reason }) => api.post('/v1/nc-requests/', { stay_log, reason }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS_OPS.ncRequests);
      closeNcModal();
      setNcReason('');
      notifySuccess('NC request submitted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to submit NC request.')),
  });

  const shiftMutation = useMutation({
    mutationFn: ({ logId, new_room, reason, apply_extra_beds, extra_bed, extra_per_bed_price }) =>
      api.post(`/v1/stay-logs/${logId}/shift/`, { new_room, reason, apply_extra_beds, extra_bed, extra_per_bed_price }),
    onSuccess: (res) => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeShiftModal();
      setShiftRoomId(null);
      setShiftReason('');
      notifySuccess(`Guest shifted to room ${res.data.new_room_number}.`);
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to shift room.')),
  });

  const openShift = (log) => {
    setShiftLog(log);
    setShiftRoomId(null);
    setShiftReason('');
    setApplyExtraBeds(log.extra_bed > 0);
    setShiftExtraBed(log.extra_bed);
    setShiftExtraBedPrice(Number(log.extra_per_bed_price));
    openShiftModal();
  };

  const handleCheckout = (record) => {
    const nights = Math.max(1, dayjs().diff(dayjs(record.check_in), 'day'));
    const roomTotal = (Number(record.price) + record.extra_bed * Number(record.extra_per_bed_price)) * nights;
    const amenityTotal = (record.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const overtimeFee = computeOvertimeFee(record);
    const gstAmount = computeGst(record, nights, configMap['gst_percent']);
    const billTotal = record.is_nc ? 0 : (record.gst_inclusive ? (roomTotal + amenityTotal + overtimeFee) : (roomTotal + amenityTotal + overtimeFee + gstAmount));
    const totalPaid = (record.payments || []).reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = billTotal - totalPaid;

    if (outstanding > 0) {
      setPayCheckoutLog(record);
      setPayCheckoutAmount(outstanding);
      setPayCheckoutType(null);
      openPayCheckoutModal();
    } else {
      modals.openConfirmModal({
        title: 'Confirm checkout',
        children: <Text size="sm">Check out room {roomMap[record.room]?.room_number ?? record.room}?</Text>,
        labels: { confirm: 'Checkout', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => checkoutMutation.mutate(record.id),
      });
    }
  };

  const openAmenities = (log) => {
    setSelectedLog(log);
    setNewAmenityId(null);
    setNewAmenityQty(1);
    openAmenityModal();
  };

  const openPayments = (log) => {
    setPaymentLog(log);
    setNewPaymentType(null);
    setNewPaymentAmount(0);
    setNewPaymentNote('');
    openPaymentModal();
  };

  const openNc = (log) => {
    setNcLog(log);
    setNcReason('');
    openNcModal();
  };

  const handleAddAmenity = () => {
    if (!newAmenityId || !selectedLog) return;
    addAmenityMutation.mutate({ logId: selectedLog.id, amenity: newAmenityId, quantity: newAmenityQty });
  };

  const handleAddPayment = () => {
    if (!newPaymentType || !newPaymentAmount || !paymentLog) return;
    addPaymentMutation.mutate({ logId: paymentLog.id, payment_type: newPaymentType, amount: newPaymentAmount, note: newPaymentNote });
  };

  // Keep selected logs in sync with latest data
  const currentLog = selectedLog ? logs.find(l => l.id === selectedLog.id) ?? selectedLog : null;
  const currentPaymentLog = paymentLog ? logs.find(l => l.id === paymentLog.id) ?? paymentLog : null;

  const paymentTypeOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' },
  ];

  const rows = filteredLogs.map((log) => {
    const nights = Math.max(1, dayjs().diff(dayjs(log.check_in), 'day'));
    const roomTotal = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
    const amenityTotal = (log.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const overtimeFee = computeOvertimeFee(log);
    const gstAmount = computeGst(log, nights, configMap['gst_percent']);
    const total = log.is_nc ? 0 : (log.gst_inclusive ? (roomTotal + amenityTotal + overtimeFee) : (roomTotal + amenityTotal + overtimeFee + gstAmount));
    const ncStatus = log.nc_status;

    const room = roomMap[log.room];
    const roomNumber = room?.room_number ?? log.room;
    const roomTypeName = room ? roomTypeMap[room.room_type] : undefined;

    return (
      <Table.Tr key={log.id}>
        <Table.Td>
          <Group gap={4}>
            {roomNumber}
            {log.is_nc && <Badge size="xs" color="grape">NC</Badge>}
            {!log.is_nc && ncStatus?.status === 'pending' && <Badge size="xs" color="orange">NC Pending</Badge>}
            {log.is_early_checkin && <Badge size="xs" color="cyan">Early</Badge>}
            {log.gst_applied && <Badge size="xs" color="teal">GST</Badge>}
          </Group>
        </Table.Td>
        <Table.Td><GuestChips customers={log.customers} groupId={log.group} /></Table.Td>
        <Table.Td>{dayjs(log.check_in).format('DD MMM YYYY, hh:mm A')}</Table.Td>
        <Table.Td>{log.price > 0 ? `₹${log.price}` : '—'}</Table.Td>
        <Table.Td>{log.extra_bed}</Table.Td>
        <Table.Td>{log.extra_per_bed_price > 0 ? `₹${log.extra_per_bed_price}` : '—'}</Table.Td>
        <Table.Td>{nights}</Table.Td>
        <Table.Td>{amenityTotal > 0 ? `₹${amenityTotal}` : '—'}</Table.Td>
        <Table.Td>{overtimeFee > 0 ? <Badge color="yellow" variant="light">₹{overtimeFee}</Badge> : '—'}</Table.Td>
        <Table.Td>{gstAmount > 0 ? <Badge color="teal" variant="light">₹{gstAmount}</Badge> : '—'}</Table.Td>
        <Table.Td fw={600}>{log.is_nc ? <Badge color="grape" variant="light">₹0 (NC)</Badge> : `₹${total}`}</Table.Td>
        <Table.Td>
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconPackage size={14} />} onClick={() => openAmenities(log)}>
              Amenities
            </Button>
            <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={() => openPayments(log)}>
              Payments
            </Button>
            {!log.is_nc && (!ncStatus || ncStatus.status === 'rejected') && (
              <Button size="xs" variant="light" color="grape" leftSection={<IconBan size={14} />} onClick={() => openNc(log)}>
                Mark NC
              </Button>
            )}
            <Button size="xs" variant="light" color="blue" onClick={() => openShift(log)}>
              Shift Room
            </Button>
            {log.gst_applied && log.check_out && (
              <Button
                size="xs" variant="light" color="green" leftSection={<IconFileText size={14} />}
                onClick={async () => {
                  const blob = await pdf(
                    <InvoiceDocument log={log} roomNumber={roomNumber} roomTypeName={roomTypeName} configMap={configMap} nights={nights} />
                  ).toBlob();
                  window.open(URL.createObjectURL(blob), '_blank');
                }}
              >
                Invoice
              </Button>
            )}
            <Button size="xs" color="red" variant="light" onClick={() => handleCheckout(log)}>
              Checkout
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  const amenityOptions = amenities.map(a => ({
    value: String(a.id),
    label: `${a.name} — ₹${a.price} (${a.charge_type === 'per_night' ? 'Per Night' : 'Flat'})`,
  }));

  const logAmenities = currentLog?.amenities || [];
  const logPayments = currentPaymentLog?.payments || [];
  const totalPaid = logPayments.reduce((s, p) => s + Number(p.amount), 0);

  const currentPaymentNights = currentPaymentLog
    ? Math.max(1, dayjs().diff(dayjs(currentPaymentLog.check_in), 'day'))
    : 0;
  const paymentRoomTotal = currentPaymentLog
    ? (Number(currentPaymentLog.price) + currentPaymentLog.extra_bed * Number(currentPaymentLog.extra_per_bed_price)) * currentPaymentNights
    : 0;
  const paymentAmenityTotal = currentPaymentLog
    ? (currentPaymentLog.amenities || []).reduce((sum, a) =>
        sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? currentPaymentNights : 1), 0)
    : 0;
  const paymentOvertimeFee = currentPaymentLog ? computeOvertimeFee(currentPaymentLog) : 0;
  const paymentGstAmount = currentPaymentLog ? computeGst(currentPaymentLog, currentPaymentNights, configMap['gst_percent']) : 0;
  const billTotal = currentPaymentLog?.is_nc ? 0 : (currentPaymentLog?.gst_inclusive ? (paymentRoomTotal + paymentAmenityTotal + paymentOvertimeFee) : (paymentRoomTotal + paymentAmenityTotal + paymentOvertimeFee + paymentGstAmount));
  const outstanding = billTotal - totalPaid;

  return (
    <>
      <Group mb="md">
        <Badge color="orange" size="lg" variant="light">{logs.length} room(s) currently occupied</Badge>
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Filter by room or guest name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          w={260}
        />
      </Group>

      <Table.ScrollContainer minWidth={1100}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Room</Table.Th>
              <Table.Th>Guests</Table.Th>
              <Table.Th>Check-In</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Extra Beds</Table.Th>
              <Table.Th>Extra Bed Price</Table.Th>
              <Table.Th>Nights</Table.Th>
              <Table.Th>Amenities</Table.Th>
              <Table.Th>Overtime</Table.Th>
              <Table.Th>GST</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={12} ta="center">Loading...</Table.Td></Table.Tr>
            ) : rows.length === 0 ? (
              <Table.Tr><Table.Td colSpan={12} ta="center">No occupied rooms.</Table.Td></Table.Tr>
            ) : rows}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {/* Amenity Modal */}
      <Modal opened={amenityModal} onClose={closeAmenityModal} title={`Amenities — Room ${currentLog ? (roomMap[currentLog.room]?.room_number ?? currentLog.room) : ''}`} size="lg">
        {logAmenities.length > 0 ? (
          <Table striped withTableBorder mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Unit Price</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logAmenities.map(a => (
                <Table.Tr key={a.id}>
                  <Table.Td>{a.name}</Table.Td>
                  <Table.Td>{a.quantity}</Table.Td>
                  <Table.Td>₹{a.price}</Table.Td>
                  <Table.Td><Badge size="sm" variant="light">{a.charge_type === 'per_night' ? 'Per Night' : 'Flat'}</Badge></Table.Td>
                  <Table.Td>
                    <ActionIcon color="red" variant="light" onClick={() => removeAmenityMutation.mutate(a.id)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed" mb="md">No amenities added yet.</Text>
        )}

        <Stack gap="sm">
          <Group grow>
            <Select
              label="Amenity"
              placeholder="Select amenity"
              data={amenityOptions}
              value={newAmenityId ? String(newAmenityId) : null}
              onChange={(v) => setNewAmenityId(v ? Number(v) : null)}
              searchable
            />
            <NumberInput
              label="Quantity"
              value={newAmenityQty}
              onChange={setNewAmenityQty}
              min={1}
              max={100}
            />
          </Group>
          <Group justify="flex-end">
            <Button onClick={handleAddAmenity} loading={addAmenityMutation.isPending} disabled={!newAmenityId}>
              Add Amenity
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Payments Modal */}
      <Modal
        opened={paymentModal}
        onClose={closePaymentModal}
        title={`Payments — Room ${currentPaymentLog ? (roomMap[currentPaymentLog.room]?.room_number ?? currentPaymentLog.room) : ''}`}
        size="lg"
      >
        <Group mb="md" gap="xl">
          <Text size="sm">Bill: <strong>₹{billTotal}</strong></Text>
          {paymentOvertimeFee > 0 && (
            <Text size="sm" c="yellow">Overtime: <strong>₹{paymentOvertimeFee}</strong></Text>
          )}
          {paymentGstAmount > 0 && (
            <Text size="sm" c="teal">GST: <strong>₹{paymentGstAmount}</strong></Text>
          )}
          <Text size="sm">Paid: <strong style={{ color: 'green' }}>₹{totalPaid}</strong></Text>
          <Text size="sm">Outstanding: <strong style={{ color: outstanding > 0 ? 'red' : 'inherit' }}>₹{outstanding}</strong></Text>
        </Group>

        {logPayments.length > 0 ? (
          <Table striped withTableBorder mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>By</Table.Th>
                <Table.Th>Note</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logPayments.map(p => (
                <Table.Tr key={p.id}>
                  <Table.Td><Badge size="sm" variant="light">{p.payment_type.toUpperCase()}</Badge></Table.Td>
                  <Table.Td>₹{p.amount}</Table.Td>
                  <Table.Td>{p.processed_by_name ?? '—'}</Table.Td>
                  <Table.Td>{p.note || '—'}</Table.Td>
                  <Table.Td>
                    <ActionIcon color="red" variant="light" onClick={() => removePaymentMutation.mutate(p.id)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed" mb="md">No payments recorded yet.</Text>
        )}

        <Stack gap="sm">
          <Group grow>
            <Select
              label="Payment Type"
              placeholder="Select type"
              data={paymentTypeOptions}
              value={newPaymentType}
              onChange={setNewPaymentType}
            />
            <NumberInput
              label="Amount (₹)"
              value={newPaymentAmount}
              onChange={setNewPaymentAmount}
              min={1}
            />
          </Group>
          <TextInput
            label="Note (optional)"
            value={newPaymentNote}
            onChange={(e) => setNewPaymentNote(e.target.value)}
            placeholder="e.g. advance payment"
          />
          <Group justify="flex-end">
            <Button
              onClick={handleAddPayment}
              loading={addPaymentMutation.isPending}
              disabled={!newPaymentType || !newPaymentAmount}
            >
              Add Payment
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* NC Request Modal */}
      <Modal
        opened={ncModal}
        onClose={closeNcModal}
        title={`Mark as NC — Room ${ncLog ? (roomMap[ncLog.room]?.room_number ?? ncLog.room) : ''}`}
      >
        <Text size="sm" c="dimmed" mb="md">
          Submitting an NC request will mark this stay as Not Chargeable (pending admin approval).
        </Text>
        <Textarea
          label="Reason"
          placeholder="Explain why this stay should be non-chargeable..."
          value={ncReason}
          onChange={(e) => setNcReason(e.target.value)}
          rows={3}
          mb="md"
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeNcModal}>Cancel</Button>
          <Button
            color="grape"
            disabled={!ncReason.trim()}
            loading={createNcMutation.isPending}
            onClick={() => createNcMutation.mutate({ stay_log: ncLog.id, reason: ncReason })}
          >
            Submit NC Request
          </Button>
        </Group>
      </Modal>

      {/* Shift Room Modal */}
      <Modal
        opened={shiftModal}
        onClose={closeShiftModal}
        title={`Shift Room — Room ${shiftLog ? (roomMap[shiftLog.room]?.room_number ?? shiftLog.room) : ''}`}
      >
        <Select
          label="Move guest to"
          placeholder="Select available room"
          data={rooms
            .filter(r => !occupiedRoomIds.has(r.id))
            .map(r => ({ value: String(r.id), label: `Room ${r.room_number} — ${r.beds} bed${r.beds !== 1 ? 's' : ''} — ₹${r.price}` }))}
          value={shiftRoomId}
          onChange={setShiftRoomId}
          searchable
          mb="xs"
        />
        {shiftLog && (
          <Text size="xs" c="dimmed" mb="sm">
            Price ₹{shiftLog.price}/night from current room will be carried over (not the new room's default).
          </Text>
        )}
        {shiftLog?.extra_bed > 0 && (
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
          <Button variant="default" onClick={closeShiftModal}>Cancel</Button>
          <Button
            color="blue"
            disabled={!shiftRoomId || !shiftReason.trim()}
            loading={shiftMutation.isPending}
            onClick={() => shiftMutation.mutate({
              logId: shiftLog.id,
              new_room: Number(shiftRoomId),
              reason: shiftReason,
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
      <Modal
        opened={payCheckoutModal}
        onClose={closePayCheckoutModal}
        title={`Outstanding Balance — Room ${payCheckoutLog ? (roomMap[payCheckoutLog.room]?.room_number ?? payCheckoutLog.room) : ''}`}
      >
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
          <Button variant="default" onClick={closePayCheckoutModal}>Cancel</Button>
          <Button
            color="teal"
            disabled={!payCheckoutType || !payCheckoutAmount}
            loading={payAndCheckoutMutation.isPending}
            onClick={() => payAndCheckoutMutation.mutate({
              logId: payCheckoutLog.id,
              payment_type: payCheckoutType,
              amount: payCheckoutAmount,
            })}
          >
            Pay & Checkout
          </Button>
        </Group>
      </Modal>
    </>
  );
}
