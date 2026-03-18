import { useState } from 'react';
import {
  Tabs, Table, Card, Button, Badge, Stack, Group, Text, Loader, Center,
  NumberInput, TextInput, Select, Modal, Alert, ActionIcon, Textarea,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconPlus, IconInfoCircle, IconPackage, IconTrash, IconLogout, IconBan } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import {
  QUERY_KEYS, QUERY_KEYS_OPS,
  fetchRoom, fetchActiveLogs, fetchRoomTypes, fetchRoomReservations,
  fetchGroupCustomers, fetchAmenities,
} from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import CustomerSelectWithAdd from '../components/CustomerSelectWithAdd';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getActiveLog(roomId, logs) {
  return logs.find(l => l.room === roomId && l.check_out === null) ?? null;
}

// ── Customer list (badges — used in reservation rows) ─────────────────────────

function CustomerList({ groupId }) {
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

function CustomerTable({ groupId, allowRemove = false, mainCustomerId = null }) {
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
    onError: (e) => notifyError(e.response?.data?.error ?? 'Failed to remove guest.'),
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
  );
}

// ── Description row ────────────────────────────────────────────────────────────

function DescRow({ label, value }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={500}>{value}</Text>
    </Group>
  );
}

// ── Tab 1: Status / Actions ────────────────────────────────────────────────────

function StatusTab({ room, activeLogs, isReservedToday }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Edit beds modal (item 6)
  const [bedsOpened, { open: openBeds, close: closeBeds }] = useDisclosure(false);
  // Add guest modal (item 7)
  const [addGuestOpened, { open: openAddGuest, close: closeAddGuest }] = useDisclosure(false);
  // Amenity modal
  const [amenityOpened, { open: openAmenity, close: closeAmenity }] = useDisclosure(false);
  const [newAmenityId, setNewAmenityId] = useState(null);
  const [newAmenityQty, setNewAmenityQty] = useState(1);

  // NC Request modal
  const [ncOpened, { open: openNc, close: closeNc }] = useDisclosure(false);
  const [ncReason, setNcReason] = useState('');

  const checkinForm = useForm({
    initialValues: { customers: [], price: 0, extra_bed: 0, extra_per_bed_price: 0 },
    validate: { customers: (v) => v.length > 0 ? null : 'Select at least one customer.' },
  });

  const activeLog = getActiveLog(room.id, activeLogs);

  // ── Edit beds form (item 6) ──
  const bedsForm = useForm({
    initialValues: {
      extra_bed: activeLog?.extra_bed ?? 0,
      extra_per_bed_price: activeLog?.extra_per_bed_price ?? 0,
    },
  });

  const bedsMutation = useMutation({
    mutationFn: (values) => api.patch(`/v1/stay-logs/${activeLog.id}/`, values),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      closeBeds();
      notifySuccess('Beds updated.');
    },
    onError: () => notifyError('Failed to update beds.'),
  });

  // ── Add guest (item 7) ──
  const { data: currentGuests = [] } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(activeLog?.group),
    queryFn: () => fetchGroupCustomers(activeLog?.group),
    enabled: !!activeLog?.group,
  });

  const addGuestForm = useForm({
    initialValues: { customers: [] },
    validate: { customers: (v) => v.length > 0 ? null : 'Select at least one customer.' },
  });

  const addGuestMutation = useMutation({
    mutationFn: (values) => api.post(`/v1/group/${activeLog.group}/customers/add/`, { customers: values.customers.map(Number) }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.groupCustomers(activeLog.group));
      closeAddGuest();
      addGuestForm.reset();
      notifySuccess('Guest(s) added.');
    },
    onError: () => notifyError('Failed to add guest(s).'),
  });

  // ── Amenities ──
  const { data: allAmenities = [] } = useQuery({ queryKey: QUERY_KEYS.amenities, queryFn: fetchAmenities });

  const addAmenityMutation = useMutation({
    mutationFn: ({ logId, amenity, quantity }) => api.post(`/v1/stay-logs/${logId}/amenities/`, { amenity, quantity }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      setNewAmenityId(null);
      setNewAmenityQty(1);
      notifySuccess('Amenity added.');
    },
    onError: (e) => notifyError(e.response?.data?.non_field_errors?.[0] ?? e.response?.data?.amenity?.[0] ?? 'Failed to add amenity.'),
  });

  const removeAmenityMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/stay-logs/amenities/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      notifySuccess('Amenity removed.');
    },
    onError: () => notifyError('Failed to remove amenity.'),
  });

  // ── Single-step check-in (item 4) ──
  const handleCheckin = async (values) => {
    const guestCount = values.customers.length;
    const maxAllowed = room.beds + values.extra_bed;
    if (guestCount > maxAllowed) {
      notifyError(`Too many guests: ${guestCount} selected but max is ${maxAllowed} (${room.beds} beds + ${values.extra_bed} extra).`);
      return;
    }
    setSubmitLoading(true);
    try {
      const { data: groupData } = await api.post('/v1/group/customers/', { customers: values.customers.map(Number) });
      await api.post('/v1/checkin/', {
        room: room.id,
        group: groupData.group_id,
        price: values.price,
        extra_bed: values.extra_bed,
        extra_per_bed_price: values.extra_per_bed_price,
      });
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      setShowForm(false);
      checkinForm.reset();
      notifySuccess('Check-in successful.');
    } catch (e) {
      const errors = e.response?.data;
      const msg = typeof errors === 'object' ? Object.values(errors).flat().join(' ') : 'Check-in failed.';
      notifyError(msg);
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── NC Request ──
  const createNcMutation = useMutation({
    mutationFn: ({ stay_log, reason }) => api.post('/v1/nc-requests/', { stay_log, reason }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS_OPS.ncRequests);
      closeNc();
      setNcReason('');
      notifySuccess('NC request submitted.');
    },
    onError: () => notifyError('Failed to submit NC request.'),
  });

  // ── Occupied (items 5, 6, 7) ──
  if (activeLog) {
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomCost = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const logAmenities = activeLog.amenities || [];
    const amenityCost = logAmenities.reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const totalCost = roomCost + amenityCost;
    const maxBeds = room.beds + activeLog.extra_bed;
    const currentGuestCount = currentGuests.length;
    const canAddGuest = currentGuestCount < maxBeds;

    const amenityOptions = allAmenities.map(a => ({
      value: String(a.id),
      label: `${a.name} — ₹${a.price} (${a.charge_type === 'per_night' ? 'Per Night' : 'Flat'})`,
    }));

    return (
      <Stack gap="sm" maw={600}>
        <Stack gap={0} maw={400}>
          <DescRow label="Check-In" value={dayjs(activeLog.check_in).format('DD MMM YYYY, hh:mm A')} />
          <DescRow label="Price" value={`₹${activeLog.price}`} />
          <DescRow label="Extra Beds" value={activeLog.extra_bed} />
          {activeLog.extra_bed > 0 && (
            <DescRow label="Price/Extra Bed" value={`₹${activeLog.extra_per_bed_price}`} />
          )}
          <DescRow label="Nights" value={nights} />
          {amenityCost > 0 && (
            <DescRow label="Amenities" value={`₹${amenityCost}`} />
          )}
          <DescRow label="Total Cost" value={`₹${totalCost}`} />
        </Stack>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => {
            bedsForm.setValues({ extra_bed: activeLog.extra_bed, extra_per_bed_price: Number(activeLog.extra_per_bed_price) });
            openBeds();
          }}>
            Edit Beds
          </Button>
          <Button size="xs" variant="light" onClick={() => { addGuestForm.reset(); openAddGuest(); }} disabled={!canAddGuest}>
            Add Guest
          </Button>
          <Button size="xs" variant="light" leftSection={<IconPackage size={14} />} onClick={() => { setNewAmenityId(null); setNewAmenityQty(1); openAmenity(); }}>
            Amenities
          </Button>
          {!activeLog.is_nc && (!activeLog.nc_status || activeLog.nc_status.status === 'rejected') && (
            <Button size="xs" variant="light" color="grape" leftSection={<IconBan size={14} />} onClick={() => { setNcReason(''); openNc(); }}>
              Mark NC
            </Button>
          )}
          {activeLog.nc_status?.status === 'pending' && (
            <Badge color="orange" variant="light">NC Pending</Badge>
          )}
          {activeLog.is_nc && (
            <Badge color="grape" variant="light">NC Approved</Badge>
          )}
        </Group>
        {logAmenities.length > 0 && (
          <div>
            <Text size="sm" fw={500} mb="xs">Amenities:</Text>
            <Group gap="xs" wrap="wrap">
              {logAmenities.map(a => (
                <Badge key={a.id} variant="light" size="lg">
                  {a.name} x{a.quantity} — ₹{Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1)}
                </Badge>
              ))}
            </Group>
          </div>
        )}
        <div>
          <Text size="sm" fw={500} mb="xs">Guests:</Text>
          <CustomerTable groupId={activeLog.group} allowRemove />
        </div>


        {/* Edit Beds Modal (item 6) */}
        <Modal opened={bedsOpened} onClose={closeBeds} title="Edit Beds">
          <form onSubmit={bedsForm.onSubmit(v => {
            const totalBeds = room.beds + v.extra_bed;
            if (currentGuestCount > totalBeds) {
              notifyError(`Cannot reduce beds: ${currentGuestCount} guest(s) currently in room, but total beds would be ${totalBeds}.`);
              return;
            }
            bedsMutation.mutate(v);
          })}>
            <NumberInput label="Extra Beds" min={0} {...bedsForm.getInputProps('extra_bed')} mb="sm" />
            <NumberInput label="Price per Extra Bed (₹)" min={0} {...bedsForm.getInputProps('extra_per_bed_price')} mb="md" />
            <Text size="xs" c="dimmed" mb="md">
              {room.beds} room bed{room.beds !== 1 ? 's' : ''} + {bedsForm.values.extra_bed} extra = {room.beds + bedsForm.values.extra_bed} total — {currentGuestCount} guest(s) in room
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeBeds}>Cancel</Button>
              <Button type="submit" loading={bedsMutation.isPending}>Save</Button>
            </Group>
          </form>
        </Modal>

        {/* Add Guest Modal (item 7) */}
        <Modal opened={addGuestOpened} onClose={closeAddGuest} title="Add Guest">
          <form onSubmit={addGuestForm.onSubmit(v => addGuestMutation.mutate(v))}>
            <CustomerSelectWithAdd
              label="Customers"
              value={addGuestForm.values.customers}
              onChange={(val) => addGuestForm.setFieldValue('customers', val)}
              error={addGuestForm.errors.customers}
              maxValues={maxBeds - currentGuestCount}
              helperText={`${currentGuestCount} of ${maxBeds} spots filled`}
              excludeIds={currentGuests.map(c => c.id)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeAddGuest}>Cancel</Button>
              <Button type="submit" loading={addGuestMutation.isPending}>Add</Button>
            </Group>
          </form>
        </Modal>

        {/* NC Request Modal */}
        <Modal opened={ncOpened} onClose={closeNc} title="Mark as Not Chargeable">
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
            <Button variant="default" onClick={closeNc}>Cancel</Button>
            <Button
              color="grape"
              disabled={!ncReason.trim()}
              loading={createNcMutation.isPending}
              onClick={() => createNcMutation.mutate({ stay_log: activeLog.id, reason: ncReason })}
            >
              Submit NC Request
            </Button>
          </Group>
        </Modal>

        {/* Amenity Modal */}
        <Modal opened={amenityOpened} onClose={closeAmenity} title="Manage Amenities" size="lg">
          {logAmenities.length > 0 ? (
            <Table striped withTableBorder mb="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Qty</Table.Th>
                  <Table.Th>Unit Price</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Cost</Table.Th>
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
                    <Table.Td>₹{Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1)}</Table.Td>
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
              <Button
                onClick={() => { if (newAmenityId && activeLog) addAmenityMutation.mutate({ logId: activeLog.id, amenity: newAmenityId, quantity: newAmenityQty }); }}
                loading={addAmenityMutation.isPending}
                disabled={!newAmenityId}
              >
                Add Amenity
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    );
  }

  // ── Available / Reserved: idle (item 1) ──
  if (!showForm) {
    return (
      <Stack gap="sm" maw={400}>
        {isReservedToday ? (
          <Alert icon={<IconInfoCircle size={16} />} color="orange" title="Reserved">
            Room is reserved for today. Convert from the Reservations tab.
          </Alert>
        ) : (
          <Button onClick={() => setShowForm(true)}>Check-In Now</Button>
        )}
      </Stack>
    );
  }

  // ── Single check-in form (item 4) ──
  const guestCount = checkinForm.values.customers.length;
  const maxAllowed = room.beds + checkinForm.values.extra_bed;
  const guestExceeded = guestCount > maxAllowed;

  return (
    <Card withBorder maw={500}>
      <Text fw={600} mb="md">Check-In</Text>
      <form onSubmit={checkinForm.onSubmit(handleCheckin)}>
        <CustomerSelectWithAdd
          label="Customers"
          value={checkinForm.values.customers}
          onChange={(val) => checkinForm.setFieldValue('customers', val)}
          error={checkinForm.errors.customers}
          maxValues={maxAllowed}
          helperText={`${guestCount} of ${maxAllowed} guest${maxAllowed !== 1 ? 's' : ''} selected`}
          required
        />
        <NumberInput
          label="Price (₹, 0 = auto)"
          min={0}
          {...checkinForm.getInputProps('price')}
          mt="sm"
          mb="sm"
          placeholder={String(room.price)}
        />
        <NumberInput label="Extra Beds" min={0} {...checkinForm.getInputProps('extra_bed')} mb="sm" />
        <NumberInput label="Price per Extra Bed (₹)" min={0} {...checkinForm.getInputProps('extra_per_bed_price')} mb="sm" />
        <Text size="sm" c={guestExceeded ? 'red' : 'dimmed'} mb="md">
          {guestCount} guest{guestCount !== 1 ? 's' : ''} selected — {room.beds} bed{room.beds !== 1 ? 's' : ''} + {checkinForm.values.extra_bed} extra = max {maxAllowed}
        </Text>
        <Group>
          <Button variant="default" onClick={() => { setShowForm(false); checkinForm.reset(); }}>Cancel</Button>
          <Button type="submit" loading={submitLoading} disabled={guestExceeded}>Confirm Check-In</Button>
        </Group>
      </form>
    </Card>
  );
}

// ── Tab 2: Reservations ────────────────────────────────────────────────────────

function ReservationsTab({ room, reservations, isOccupied }) {
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [convertingId, setConvertingId] = useState(null);

  const form = useForm({
    initialValues: { customers: [], dates: [null, null], price: 0 },
    validate: {
      customers: (v) => v.length > 0 ? null : 'Select at least one customer.',
      dates: (v) => (v && v[0] && v[1]) ? null : 'Select dates.',
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/reservation/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      notifySuccess('Reservation deleted.');
    },
    onError: () => notifyError('Failed to delete reservation.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete reservation',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const handleConvert = (reservation) => modals.openConfirmModal({
    title: 'Convert reservation',
    children: <Text size="sm">Convert this reservation to a live check-in?</Text>,
    labels: { confirm: 'Convert', cancel: 'Cancel' },
    onConfirm: async () => {
      setConvertingId(reservation.id);
      try {
        await api.post('/v1/checkin/', { room: room.id, group: reservation.group, price: reservation.price });
        await api.delete(`/v1/reservation/${reservation.id}/`);
        qc.invalidateQueries(QUERY_KEYS.activeLogs);
        qc.invalidateQueries(QUERY_KEYS.rooms);
        qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
        notifySuccess('Reservation converted to check-in.');
      } catch (e) {
        const errors = e.response?.data;
        const msg = typeof errors === 'object' ? Object.values(errors).flat().join(' ') : 'Failed to convert reservation.';
        notifyError(msg);
      } finally {
        setConvertingId(null);
      }
    },
  });

  const handleAdd = async (values) => {
    setLoading(true);
    try {
      const { data: groupData } = await api.post('/v1/group/customers/', { customers: values.customers.map(Number) });
      await api.post('/v1/reservations/', {
        room: room.id,
        group: groupData.group_id,
        check_in_date: dayjs(values.dates[0]).format('YYYY-MM-DD'),
        check_out_date: dayjs(values.dates[1]).format('YYYY-MM-DD'),
        price: values.price ?? 0,
      });
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      close();
      form.reset();
      notifySuccess('Reservation added.');
    } catch (e) {
      const errors = e.response?.data;
      const msg = typeof errors === 'object' ? Object.values(errors).flat().join(' ') : 'Failed to add reservation.';
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  const rows = reservations.map((res) => (
    <Table.Tr key={res.id}>
      <Table.Td>{res.check_in_date}</Table.Td>
      <Table.Td>{res.check_out_date}</Table.Td>
      <Table.Td>₹{res.price}</Table.Td>
      <Table.Td><CustomerList groupId={res.group} /></Table.Td>
      <Table.Td>
        <Group gap="xs">
          {!isOccupied && (
            <Button size="xs" variant="light" onClick={() => handleConvert(res)} loading={convertingId === res.id}>Convert</Button>
          )}
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(res.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={() => { form.reset(); open(); }}>
          Add Reservation
        </Button>
      </Group>

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

      <Modal opened={opened} onClose={close} title="Add Reservation">
        <form onSubmit={form.onSubmit(handleAdd)}>
          <CustomerSelectWithAdd
            label="Guests"
            value={form.values.customers}
            onChange={(val) => form.setFieldValue('customers', val)}
            error={form.errors.customers}
            required
          />
          <DatePickerInput
            type="range"
            label="Date Range"
            minDate={isOccupied ? dayjs().add(1, 'day').toDate() : new Date()}
            {...form.getInputProps('dates')}
            mt="sm"
            mb="sm"
            required
          />
          <NumberInput label="Price (₹, optional)" min={0} {...form.getInputProps('price')} mb="md" />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={loading}>Add</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}

// ── Tab 3: Room Details (edit) ─────────────────────────────────────────────────

function RoomDetailsTab({ room }) {
  const qc = useQueryClient();
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });

  const form = useForm({
    initialValues: {
      room_number: room.room_number,
      room_type: room.room_type ? String(room.room_type) : null,
      beds: room.beds,
      price: room.price,
    },
    validate: {
      room_number: (v) => v ? null : 'Required',
      room_type: (v) => v ? null : 'Required',
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values) => api.put(`/v1/room/${room.id}/`, {
      ...values,
      room_type: values.room_type ? parseInt(values.room_type) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.room(room.id));
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Room updated.');
    },
    onError: () => notifyError('Failed to save.'),
  });

  return (
    <Card withBorder maw={500}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Room Number" {...form.getInputProps('room_number')} mb="sm" required />
          <Select
            label="Room Type"
            data={roomTypes.map(t => ({ value: String(t.id), label: t.name }))}
            {...form.getInputProps('room_type')}
            mb="sm"
            required
          />
          <NumberInput label="Beds" min={1} {...form.getInputProps('beds')} mb="sm" required />
          <NumberInput label="Default Price (₹)" min={0} {...form.getInputProps('price')} mb="md" required />
          <Button type="submit" loading={saveMutation.isPending}>Save</Button>
        </form>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

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

  const checkoutMutation = useMutation({
    mutationFn: (logId) => api.post(`/v1/checkout/${logId}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Checkout successful.');
    },
    onError: (e) => notifyError(e.response?.data?.error ?? 'Checkout failed.'),
  });

  if (roomLoading) {
    return <Center h={200}><Loader size="lg" /></Center>;
  }

  if (!room) {
    return <Text>Room not found.</Text>;
  }

  const activeLog = getActiveLog(room.id, activeLogs);
  const today = new Date().toISOString().slice(0, 10);
  const nextReservation = reservations
    .filter(r => r.check_in_date <= today && r.check_out_date >= today)
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0] ?? null;

  const isReservedToday = !activeLog && !!nextReservation;

  let statusColor = 'teal';
  let statusLabel = 'Available';
  if (activeLog) { statusColor = 'red'; statusLabel = 'Occupied'; }
  else if (nextReservation) { statusColor = 'orange'; statusLabel = 'Reserved'; }

  const handleCheckout = () => modals.openConfirmModal({
    title: 'Confirm checkout',
    children: <Text size="sm">Check out this room?</Text>,
    labels: { confirm: 'Checkout', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => checkoutMutation.mutate(activeLog.id),
  });

  return (
    <div>
      <Group mb="xs" align="center">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/rooms')}>
          Back
        </Button>
        <div>
          <Text fw={700} size="lg">Room {room.room_number}</Text>
          <Badge color={statusColor} size="sm" mt={2}>{statusLabel}</Badge>
        </div>
        {activeLog && (
          <Button color="red" variant="outline" leftSection={<IconLogout size={16} />} onClick={handleCheckout} loading={checkoutMutation.isPending} style={{ marginLeft: 'clamp(16px, 8vw, 130px)' }}>
            Checkout
          </Button>
        )}
      </Group>

      <Tabs defaultValue="status">
        <Tabs.List mb="md">
          <Tabs.Tab value="status">Status / Actions</Tabs.Tab>
          <Tabs.Tab value="reservations">Reservations</Tabs.Tab>
          <Tabs.Tab value="details">Room Details</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="status" pt="xs" keepMounted>
          <StatusTab room={room} activeLogs={activeLogs} isReservedToday={isReservedToday} />
        </Tabs.Panel>
        <Tabs.Panel value="reservations" pt="xs">
          <ReservationsTab room={room} reservations={reservations} isOccupied={!!activeLog} />
        </Tabs.Panel>
        <Tabs.Panel value="details" pt="xs">
          <RoomDetailsTab room={room} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
