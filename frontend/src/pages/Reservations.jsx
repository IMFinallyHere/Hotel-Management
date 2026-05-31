import { useState } from 'react';
import {
  Stack, Text, Group, TextInput, Button, Badge, Table, ActionIcon,
  Loader, Center, Paper, Select, Pagination, Tooltip, Modal, Textarea, NumberInput, Checkbox,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconSearch, IconX, IconDoor, IconBan, IconArrowRight, IconPlus } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchPaymentMethods, fetchRooms } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';
import ConvertCheckinModal from './RoomDetail/ConvertCheckinModal';

const PAGE_SIZE = 20;

function buildParams({ customer, roomNumber, checkInRange, checkOutRange }) {
  const p = {};
  if (customer.trim()) p.customer = customer.trim();
  if (roomNumber.trim()) p.room_number = roomNumber.trim();
  if (checkInRange[0]) p.check_in_from = dayjs(checkInRange[0]).format('YYYY-MM-DD');
  if (checkInRange[1]) p.check_in_to = dayjs(checkInRange[1]).format('YYYY-MM-DD');
  if (checkOutRange[0]) p.check_out_from = dayjs(checkOutRange[0]).format('YYYY-MM-DD');
  if (checkOutRange[1]) p.check_out_to = dayjs(checkOutRange[1]).format('YYYY-MM-DD');
  return p;
}

export default function Reservations() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const today = dayjs().format('YYYY-MM-DD');

  const [customer, setCustomer] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [checkInRange, setCheckInRange] = useState([null, null]);
  const [checkOutRange, setCheckOutRange] = useState([null, null]);
  const [status, setStatus] = useState('upcoming');
  const [page, setPage] = useState(1);

  // Selection for bulk cancel (only 1 group at a time)
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [convertReservation, setConvertReservation] = useState(null);
  const [convertRoom, setConvertRoom] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);

  // Single cancel
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFee, setCancelFee] = useState(0);
  const [refundPaymentMethod, setRefundPaymentMethod] = useState(null);
  const [refundNote, setRefundNote] = useState('');
  const [cancelOpened, { open: openCancel, close: closeCancel }] = useDisclosure(false);

  // Bulk cancel
  const [bulkReason, setBulkReason] = useState('');
  const [bulkFee, setBulkFee] = useState(0);
  const [bulkRefundMethod, setBulkRefundMethod] = useState(null);
  const [bulkRefundNote, setBulkRefundNote] = useState('');
  const [bulkOpened, { open: openBulk, close: closeBulk }] = useDisclosure(false);

  // Add advance
  const [advanceTarget, setAdvanceTarget] = useState(null);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advanceOpened, { open: openAdvance, close: closeAdvance }] = useDisclosure(false);

  const [activeParams, setActiveParams] = useState({ status: 'upcoming' });

  const { data: reservationsRaw = [], isFetching } = useQuery({
    queryKey: ['reservations-search', activeParams],
    queryFn: () => {
      const p = { ...activeParams };
      const s = activeParams.status;
      if (s === 'upcoming') p.check_out_from = today;
      else if (s === 'past') p.check_out_to = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      delete p.status;
      return api.get('/v1/reservations/', { params: p }).then(r => r.data);
    },
    keepPreviousData: true,
  });

  const reservations = reservationsRaw.filter(r => {
    const s = activeParams.status;
    if (s === 'cancelled') return r.is_cancelled;
    if (s === 'converted') return r.is_converted;
    if (s === 'upcoming' || s === 'past' || s === 'all') return !r.is_cancelled && !r.is_converted;
    return true;
  });

  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods(true) });

  const paymentTypeOptions = paymentMethods.map(p => ({ value: String(p.id), label: p.name }));

  // Derived selection info
  const selectedReservations = reservations.filter(r => selectedIds.has(r.id));
  const selGroupId = selectedReservations[0]?.group ?? null;
  const bulkIsFullCancel = selectedReservations.length > 0 &&
    selectedReservations.length === Number(selectedReservations[0]?.group_active_reservation_count ?? 0);
  const bulkGroupAdvance = Number(selectedReservations[0]?.group_advance_available ?? 0);
  const bulkTotalFee = Number(bulkFee || 0) * selectedReservations.length;
  const bulkRefundAmount = bulkIsFullCancel ? Math.max(0, bulkGroupAdvance - bulkTotalFee) : 0;

  const toggleSelect = (r) => {
    if (selectedIds.has(r.id)) {
      setSelectedIds(prev => { const s = new Set(prev); s.delete(r.id); return s; });
      return;
    }
    if (selGroupId !== null && r.group !== selGroupId) {
      notifyError('Only reservations from the same group can be selected together.');
      return;
    }
    setSelectedIds(prev => new Set([...prev, r.id]));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openCancelReservation = (reservation) => {
    const roomData = rooms.find(rm => rm.id === reservation.room);
    const fee = Number(roomData?.cancellation_fee ?? 0);
    setCancelTarget(reservation);
    setCancelReason('');
    setCancelFee(fee);
    setRefundPaymentMethod(reservation.group_advance_payment_methods?.[0]?.id ? String(reservation.group_advance_payment_methods[0].id) : null);
    setRefundNote('');
    openCancel();
  };

  const openBulkCancel = () => {
    const firstRoom = rooms.find(rm => rm.id === selectedReservations[0]?.room);
    setBulkReason('');
    setBulkFee(Number(firstRoom?.cancellation_fee ?? 0));
    setBulkRefundMethod(selectedReservations[0]?.group_advance_payment_methods?.[0]?.id
      ? String(selectedReservations[0].group_advance_payment_methods[0].id) : null);
    setBulkRefundNote('');
    openBulk();
  };

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, cancellation_fee, refund_amount, refund_payment_method, refund_note }) =>
      api.post(`/v1/reservation/${id}/cancel/`, { reason, cancellation_fee, refund_amount, refund_payment_method, refund_note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations-search'] });
      closeCancel();
      setCancelReason(''); setCancelFee(0); setRefundPaymentMethod(null); setRefundNote('');
      notifySuccess('Reservation cancelled.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to cancel reservation.')),
  });

  const bulkCancelMutation = useMutation({
    mutationFn: ({ reservation_ids, reason, cancellation_fee, refund_amount, refund_payment_method, refund_note }) =>
      api.post('/v1/reservations/bulk-cancel/', { reservation_ids, reason, cancellation_fee, refund_amount, refund_payment_method, refund_note }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reservations-search'] });
      closeBulk();
      clearSelection();
      notifySuccess(res.data?.success_message ?? 'Reservations cancelled.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Bulk cancel failed.')),
  });

  const addAdvanceMutation = useMutation({
    mutationFn: ({ groupId, amount, payment_method, note }) =>
      api.post(`/v1/groups/${groupId}/advance/`, { amount, payment_method, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations-search'] });
      closeAdvance();
      setAdvanceAmount(0); setAdvanceMethod(null); setAdvanceNote('');
      notifySuccess('Advance payment recorded.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to record advance.')),
  });

  const handleSearch = () => {
    setPage(1);
    clearSelection();
    setActiveParams({ ...buildParams({ customer, roomNumber, checkInRange, checkOutRange }), status });
  };

  const handleClear = () => {
    setCustomer(''); setRoomNumber('');
    setCheckInRange([null, null]); setCheckOutRange([null, null]);
    setStatus('upcoming'); setPage(1);
    clearSelection();
    setActiveParams({ status: 'upcoming' });
  };

  const paged = reservations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(reservations.length / PAGE_SIZE);

  const canCancel = permissions.delete_reservation || permissions.is_superuser;
  const canConvert = permissions.add_roomstaylogs || permissions.is_superuser;
  const canAddReservation = permissions.add_reservation || permissions.is_superuser;

  // Single cancel derived
  const cancelGroupAdvance = Number(cancelTarget?.group_advance_available ?? 0);
  const isPartialGroupCancel = Number(cancelTarget?.group_active_reservation_count ?? 0) > 1;
  const refundAmount = isPartialGroupCancel ? 0 : Math.max(0, cancelGroupAdvance - Number(cancelFee || 0));

  const handleConvert = (reservation) => {
    const room = rooms.find(r => r.id === reservation.room);
    if (!room) { notifyError('Room data not loaded yet, try again.'); return; }
    setConvertReservation(reservation);
    setConvertRoom(room);
    openConvert();
  };

  const showCheckboxes = canCancel && ['upcoming', 'past', 'all'].includes(activeParams.status);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600} size="xl">Reservations</Text>
        {canAddReservation && (
          <Button leftSection={<IconPlus size={16} />} color="teal" onClick={() => navigate('/bulk-booking')}>
            Add Reservation
          </Button>
        )}
      </Group>

      {/* Filters */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <TextInput
              placeholder="Customer name or phone"
              leftSection={<IconSearch size={14} />}
              value={customer}
              onChange={(e) => setCustomer(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              w={220}
            />
            <TextInput
              placeholder="Room number"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              w={120}
            />
            <Select
              value={status}
              onChange={setStatus}
              w={140}
              data={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
                { value: 'all', label: 'All' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'converted', label: 'Converted' },
              ]}
            />
          </Group>
          <Group gap="sm" wrap="wrap">
            <DatePickerInput
              type="range"
              placeholder="Check-in range"
              value={checkInRange}
              onChange={setCheckInRange}
              clearable size="sm" w={240} label="Check-in"
            />
            <DatePickerInput
              type="range"
              placeholder="Check-out range"
              value={checkOutRange}
              onChange={setCheckOutRange}
              clearable size="sm" w={240} label="Check-out"
            />
            <Group gap="xs" mt={20}>
              <Button onClick={handleSearch} leftSection={<IconSearch size={14} />}>Search</Button>
              <Button variant="default" onClick={handleClear} leftSection={<IconX size={14} />}>Clear</Button>
            </Group>
          </Group>
        </Stack>
      </Paper>

      {/* Results */}
      {isFetching ? (
        <Center h={200}><Loader /></Center>
      ) : reservations.length === 0 ? (
        <Center h={150}><Text c="dimmed">No reservations found.</Text></Center>
      ) : (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">{reservations.length} reservation{reservations.length !== 1 ? 's' : ''} found</Text>
            {selectedIds.size > 0 && (
              <Group gap="xs">
                <Text size="sm" c="dimmed">{selectedIds.size} selected</Text>
                <Button size="xs" variant="subtle" onClick={clearSelection}>Clear</Button>
                <Button size="xs" color="red" leftSection={<IconBan size={13} />} onClick={openBulkCancel}>
                  Cancel Selected ({selectedIds.size})
                </Button>
              </Group>
            )}
          </Group>
          <Table withBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {showCheckboxes && <Table.Th w={36} />}
                <Table.Th>Room</Table.Th>
                <Table.Th>Guests</Table.Th>
                <Table.Th>Check-in</Table.Th>
                <Table.Th>Check-out</Table.Th>
                <Table.Th>Nights</Table.Th>
                <Table.Th>Price/night</Table.Th>
                <Table.Th>Advance</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.map(r => {
                const ciDate = dayjs(r.check_in_date);
                const coDate = dayjs(r.check_out_date);
                const nights = coDate.diff(ciDate, 'day');
                const isPast = r.check_out_date < today;
                const isToday = r.check_in_date === today;
                const isCancelled = r.is_cancelled;
                const isConverted = r.is_converted;
                const isActive = !isCancelled && !isConverted;
                const isSelected = selectedIds.has(r.id);
                const statusLabel = isCancelled ? 'Cancelled' : isConverted ? 'Converted' : isPast ? 'Past' : isToday ? 'Today' : 'Upcoming';
                const statusColor = isCancelled ? 'red' : isConverted ? 'blue' : isPast ? 'gray' : isToday ? 'orange' : 'teal';
                return (
                  <Table.Tr key={r.id} bg={isSelected ? 'var(--mantine-color-red-0)' : undefined}>
                    {showCheckboxes && (
                      <Table.Td>
                        {isActive && (
                          <Checkbox
                            size="xs"
                            checked={isSelected}
                            onChange={() => toggleSelect(r)}
                          />
                        )}
                      </Table.Td>
                    )}
                    <Table.Td fw={600}>
                      <Group gap={6}>
                        <Text fw={600}>{r.room_number ?? r.room}</Text>
                        {Number(r.group_reservation_count ?? 0) > 1 && <Badge size="xs" variant="light">Group</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {r.customers?.length > 0
                        ? r.customers.map(c => (
                            <Text key={c.id} size="sm">{c.name}{c.number ? ` (${c.number})` : ''}</Text>
                          ))
                        : <Text size="sm" c="dimmed">—</Text>
                      }
                    </Table.Td>
                    <Table.Td>{ciDate.format('DD MMM YYYY')}</Table.Td>
                    <Table.Td>{coDate.format('DD MMM YYYY')}</Table.Td>
                    <Table.Td>{nights}</Table.Td>
                    <Table.Td>₹{Number(r.price).toLocaleString()}</Table.Td>
                    <Table.Td>
                      {Number(r.advance_amount) > 0 || Number(r.group_advance_total) > 0
                        ? (
                          <>
                            <Text size="sm">
                              Room ₹{Number(r.advance_amount).toLocaleString()}
                              <Text span size="xs" c="dimmed">
                                {' '}({(r.group_advance_payment_methods || []).map(m => m.name).join(', ') || '—'})
                              </Text>
                            </Text>
                            <Text size="xs" c="dimmed">
                              Group ₹{Number(r.group_advance_total).toLocaleString()} · Available ₹{Number(r.group_advance_available ?? 0).toLocaleString()}
                            </Text>
                          </>
                        )
                        : <Text size="sm" c="dimmed">—</Text>
                      }
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor} size="sm">{statusLabel}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Tooltip label="View room">
                          <ActionIcon size="sm" variant="subtle" color="teal" onClick={() => navigate(`/rooms/${r.room}`)}>
                            <IconDoor size={14} />
                          </ActionIcon>
                        </Tooltip>
                        {isActive && (
                          <Tooltip label="Add advance payment">
                            <ActionIcon size="sm" variant="subtle" color="green"
                              onClick={() => { setAdvanceTarget(r); setAdvanceAmount(0); setAdvanceMethod(null); setAdvanceNote(''); openAdvance(); }}>
                              <IconPlus size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {canConvert && !isPast && isActive && (
                          <Tooltip label="Convert to check-in">
                            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => handleConvert(r)}>
                              <IconArrowRight size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {canCancel && isActive && (
                          <Tooltip label="Cancel reservation">
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => openCancelReservation(r)}>
                              <IconBan size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {totalPages > 1 && (
            <Pagination total={totalPages} value={page} onChange={(p) => { setPage(p); clearSelection(); }} size="sm" />
          )}
        </Stack>
      )}

      {convertReservation && convertRoom && (
        <ConvertCheckinModal
          opened={convertOpened}
          onClose={() => { closeConvert(); qc.invalidateQueries({ queryKey: ['reservations-search'] }); }}
          reservation={convertReservation}
          room={convertRoom}
        />
      )}

      {/* Single Cancel Modal */}
      <Modal opened={cancelOpened} onClose={closeCancel} title="Cancel Reservation">
        {cancelTarget && (
          <Text size="sm" c="dimmed" mb="sm">
            Room {cancelTarget.room_number} · {dayjs(cancelTarget.check_in_date).format('DD MMM')} – {dayjs(cancelTarget.check_out_date).format('DD MMM YYYY')}
          </Text>
        )}
        <Textarea label="Reason for Cancellation" placeholder="Enter reason..." value={cancelReason}
          onChange={(e) => setCancelReason(e.currentTarget.value)} rows={3} mb="sm" required />
        <NumberInput label="Cancellation Fee (₹)" description="Amount retained from the advance."
          min={0} value={cancelFee} onChange={setCancelFee} mb="sm" />
        <NumberInput
          label="Refund Amount (₹)"
          description={isPartialGroupCancel
            ? 'Partial group cancellation: advance remains against the remaining rooms.'
            : `Group advance available: ₹${cancelGroupAdvance.toLocaleString()} · Fee retained: ₹${Number(cancelFee || 0).toLocaleString()}`}
          value={refundAmount} readOnly hideControls
          styles={{ input: { backgroundColor: 'var(--mantine-color-gray-1)', color: 'var(--mantine-color-dark-7)', fontWeight: 600 } }}
          mb="sm"
        />
        <Select label="Refund Method" placeholder="Select payment method" data={paymentTypeOptions}
          value={refundPaymentMethod} onChange={setRefundPaymentMethod} disabled={!refundAmount} mb="sm" />
        <Textarea label="Refund Note" placeholder="Optional note..." value={refundNote}
          onChange={(e) => setRefundNote(e.currentTarget.value)} rows={2} mb="md" />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeCancel}>Back</Button>
          <Button color="red"
            disabled={!cancelReason.trim() || (Number(refundAmount) > 0 && !refundPaymentMethod)}
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({
              id: cancelTarget.id, reason: cancelReason, cancellation_fee: cancelFee,
              refund_amount: refundAmount, refund_payment_method: refundPaymentMethod ? Number(refundPaymentMethod) : null,
              refund_note: refundNote,
            })}>
            Confirm Cancellation
          </Button>
        </Group>
      </Modal>

      {/* Bulk Cancel Modal */}
      <Modal opened={bulkOpened} onClose={closeBulk} title={`Cancel ${selectedIds.size} Reservation${selectedIds.size !== 1 ? 's' : ''}`}>
        <Text size="sm" c="dimmed" mb="sm">
          {selectedReservations.map(r => `Room ${r.room_number}`).join(', ')}
          {!bulkIsFullCancel && (
            <Text span size="xs" c="orange"> · Partial group cancel — no refund allowed</Text>
          )}
        </Text>
        <Textarea label="Reason for Cancellation" placeholder="Enter reason..." value={bulkReason}
          onChange={(e) => setBulkReason(e.currentTarget.value)} rows={3} mb="sm" required />
        <NumberInput
          label="Cancellation Fee per room (₹)"
          description={`Total fee: ₹${bulkTotalFee.toLocaleString()} across ${selectedIds.size} room${selectedIds.size !== 1 ? 's' : ''}`}
          min={0} value={bulkFee} onChange={setBulkFee} mb="sm" />
        <NumberInput
          label="Refund Amount (₹)"
          description={bulkIsFullCancel
            ? `Group advance available: ₹${bulkGroupAdvance.toLocaleString()} · Total fee: ₹${bulkTotalFee.toLocaleString()}`
            : 'Partial group cancellation: advance remains against the remaining rooms.'}
          value={bulkRefundAmount} readOnly hideControls
          styles={{ input: { backgroundColor: 'var(--mantine-color-gray-1)', color: 'var(--mantine-color-dark-7)', fontWeight: 600 } }}
          mb="sm"
        />
        <Select label="Refund Method" placeholder="Select payment method" data={paymentTypeOptions}
          value={bulkRefundMethod} onChange={setBulkRefundMethod} disabled={!bulkRefundAmount} mb="sm" />
        <Textarea label="Refund Note" placeholder="Optional note..." value={bulkRefundNote}
          onChange={(e) => setBulkRefundNote(e.currentTarget.value)} rows={2} mb="md" />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeBulk}>Back</Button>
          <Button color="red"
            disabled={!bulkReason.trim() || (bulkRefundAmount > 0 && !bulkRefundMethod)}
            loading={bulkCancelMutation.isPending}
            onClick={() => bulkCancelMutation.mutate({
              reservation_ids: [...selectedIds],
              reason: bulkReason,
              cancellation_fee: bulkFee,
              refund_amount: bulkRefundAmount,
              refund_payment_method: bulkRefundMethod ? Number(bulkRefundMethod) : null,
              refund_note: bulkRefundNote,
            })}>
            Confirm Cancellation
          </Button>
        </Group>
      </Modal>

      {/* Add Advance Modal */}
      <Modal opened={advanceOpened} onClose={closeAdvance} title="Add Advance Payment">
        {advanceTarget && (
          <Text size="sm" c="dimmed" mb="sm">
            Room {advanceTarget.room_number} · {dayjs(advanceTarget.check_in_date).format('DD MMM')} – {dayjs(advanceTarget.check_out_date).format('DD MMM YYYY')}
          </Text>
        )}
        <NumberInput label="Amount (₹)" min={1} value={advanceAmount} onChange={setAdvanceAmount} mb="sm" required />
        <Select label="Payment Method" placeholder="Select method" data={paymentTypeOptions}
          value={advanceMethod} onChange={setAdvanceMethod} mb="sm" required />
        <Textarea label="Note" placeholder="Optional note..." value={advanceNote}
          onChange={(e) => setAdvanceNote(e.currentTarget.value)} rows={2} mb="md" />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeAdvance}>Back</Button>
          <Button color="green" disabled={!advanceAmount || !advanceMethod} loading={addAdvanceMutation.isPending}
            onClick={() => addAdvanceMutation.mutate({
              groupId: advanceTarget.group, amount: advanceAmount,
              payment_method: Number(advanceMethod), note: advanceNote,
            })}>
            Record Advance
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
