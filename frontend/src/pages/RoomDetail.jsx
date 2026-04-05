import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Tabs, Table, Card, Button, Badge, Stack, Group, Text, Loader, Center,
  NumberInput, TextInput, Select, Modal, Alert, ActionIcon, Textarea, SegmentedControl,
  Grid, FileInput, Paper, Divider, Switch, Popover, Autocomplete,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconPlus, IconInfoCircle, IconPackage, IconTrash, IconLogout, IconBan, IconUserPlus, IconUpload, IconBell } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import {
  QUERY_KEYS, QUERY_KEYS_OPS,
  fetchRoom, fetchRooms, fetchActiveLogs, fetchRoomTypes, fetchRoomReservations,
  fetchGroupCustomers, fetchAmenities, fetchConfigurations, fetchCountryCodes,
  fetchPriceChart, searchCustomers, fetchDueReminders, fetchRoomStatusLogs,
} from '../api/queries';
import { compressImage } from '../utils/imageUtils';
import CustomerSelectWithAdd from '../components/CustomerSelectWithAdd';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import { parseConfigs, isLogOvertime, computeOvertimeFee, computeGst } from '../utils/configUtils';
import usePermissions from '../hooks/usePermissions';

// ── Guest form helpers ─────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

function createEmptyGuest(countryCodeId = null) {
  return {
    _key: Date.now() + Math.random(),
    name: '', number: '', country_code: countryCodeId,
    gender: null, date_of_birth: null, age: null,
    address: '', pincode: '',
    identity_card_1: null, identity_card_2: null,
    errors: {},
    searchResults: [], searchLoading: false, selectedCustomerId: null,
  };
}

function GuestForm({ row, isMain, onChange, onSelectCustomer }) {
  const autocompleteData = row.searchResults.map(c => ({
    value: String(c.id),
    label: `${c.name}${c.number ? ` — ${c.number}` : ''}`,
  }));

  return (
    <Grid gutter="sm">
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Autocomplete
          label="Phone Number" maxLength={10} value={row.number}
          required={isMain} error={row.errors.number}
          onChange={(val) => onChange('number', val)}
          onOptionSubmit={(val) => onSelectCustomer(val)}
          data={autocompleteData}
          rightSection={row.searchLoading ? <Loader size="xs" /> : null}
          filter={({ options }) => options}
          onKeyDown={(e) => {
            if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Full Name" value={row.name} required error={row.errors.name}
          onChange={(e) => onChange('name', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (!/^[A-Za-z\s]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Select label="Gender" data={GENDER_OPTIONS} value={row.gender} onChange={(v) => onChange('gender', v)} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <DatePickerInput
          label="Date of Birth" value={row.date_of_birth} clearable
          onChange={(date) => { onChange('date_of_birth', date); onChange('age', date ? dayjs().diff(dayjs(date), 'year') : null); }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <NumberInput label="Age" min={0} max={120} disabled={!!row.date_of_birth}
          value={row.age ?? ''} onChange={(v) => onChange('age', v === '' ? null : v)} />
      </Grid.Col>
      <Grid.Col span={12}>
        {row.selectedCustomerId ? (
          <Text size="sm" c="dimmed">Identity cards already on file — no re-upload needed.</Text>
        ) : (
          <>
            <FileInput
              label="Identity Card (1 required, 2nd optional)"
              leftSection={<IconUpload size={14} />}
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              value={[row.identity_card_1, row.identity_card_2].filter(Boolean)}
              required
              error={row.errors.identity_card_1}
              onChange={(files) => {
                onChange('identity_card_1', files[0] ?? null);
                onChange('identity_card_2', files[1] ?? null);
              }}
            />
            {(row.identity_card_1 || row.identity_card_2) && (
              <Text size="xs" c="dimmed" mt={4}>
                {[row.identity_card_1?.name, row.identity_card_2?.name].filter(Boolean).join(' • ')}
              </Text>
            )}
          </>
        )}
      </Grid.Col>
    </Grid>
  );
}

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

  // Extend Stay modal
  const [extendOpened, { open: openExtend, close: closeExtend }] = useDisclosure(false);
  const [extendDate, setExtendDate] = useState(null);

  // Grant Grace modal
  const [graceOpened, { open: openGrace, close: closeGrace }] = useDisclosure(false);
  const [graceHours, setGraceHours] = useState('1');

  // Configurations
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

  // Check-in inline form state
  const [guestRows, setGuestRows] = useState([createEmptyGuest()]);
  const [checkinPrice, setCheckinPrice] = useState(0);
  const [checkinExtraBed, setCheckinExtraBed] = useState(0);
  const [checkinExtraPerBedPrice, setCheckinExtraPerBedPrice] = useState(0);
  const [checkinCheckoutDate, setCheckinCheckoutDate] = useState(null);
  const [checkinGstMode, setCheckinGstMode] = useState('added');
  const [checkinIsAc, setCheckinIsAc] = useState(room.is_ac);
  const [checkinError, setCheckinError] = useState(null);
  const [checkinDateError, setCheckinDateError] = useState(null);
  const [sharedCountryCode, setSharedCountryCode] = useState(null);
  const [sharedAddress, setSharedAddress] = useState('');
  const [sharedPincode, setSharedPincode] = useState('');
  const [advPaymentType, setAdvPaymentType] = useState('cash');
  const [advPaymentAmount, setAdvPaymentAmount] = useState(0);
  const ciDebounceTimers = useRef({});

  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const { data: priceChart = [] } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });
  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);
  useEffect(() => {
    if (!indiaId) return;
    setSharedCountryCode(prev => prev || indiaId);
  }, [indiaId]);

  const resetCheckinForm = () => {
    setGuestRows([createEmptyGuest()]);
    setCheckinPrice(0);
    setCheckinExtraBed(0);
    setCheckinExtraPerBedPrice(0);
    setCheckinCheckoutDate(null);
    setCheckinGstMode('added');
    setCheckinIsAc(room.is_ac);
    setCheckinError(null);
    setCheckinDateError(null);
    setSharedCountryCode(indiaId);
    setSharedAddress('');
    setSharedPincode('');
    setAdvPaymentType('cash');
    setAdvPaymentAmount(0);
  };

  // Guest row update with phone autocomplete
  const updateCheckinGuest = (idx, field, value) => {
    setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    if (field === 'number') {
      clearTimeout(ciDebounceTimers.current[idx]);
      if (value.length >= 3) {
        ciDebounceTimers.current[idx] = setTimeout(async () => {
          setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchLoading: true } : r));
          const results = await searchCustomers(value).catch(() => []);
          setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchResults: results, searchLoading: false } : r));
        }, 350);
      } else {
        setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchResults: [], selectedCustomerId: null } : r));
      }
    }
  };

  const autofillCheckinGuest = (idx, customerId) => {
    const customer = guestRows[idx]?.searchResults.find(c => String(c.id) === customerId);
    if (!customer) return;
    setGuestRows(rows => rows.map((r, i) => i !== idx ? r : {
      ...r,
      name: customer.name ?? r.name,
      number: customer.number ?? r.number,
      gender: customer.gender ?? r.gender,
      date_of_birth: customer.date_of_birth ? new Date(customer.date_of_birth) : r.date_of_birth,
      age: customer.age ?? r.age,
      selectedCustomerId: customer.id,
      searchResults: [],
    }));
  };

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
    onError: (e) => notifyError(parseApiError(e, 'Failed to update beds.')),
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
    onError: (e) => notifyError(parseApiError(e, 'Failed to add guest(s).')),
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

  // ── Single-step check-in (item 4) ──
  const handleCheckin = async () => {
    let hasErrors = false;
    if (!checkinCheckoutDate) { setCheckinDateError('Select a checkout date.'); hasErrors = true; }
    else setCheckinDateError(null);

    let guestsValid = true;
    const updatedRows = guestRows.map((row, idx) => {
      const errs = {};
      if (!row.name?.trim()) errs.name = 'Required';
      if (idx === 0 && !row.number?.trim()) errs.number = 'Required';
      if (!row.selectedCustomerId) {
        if (!row.identity_card_1) errs.identity_card_1 = 'Required';
      }
      if (Object.keys(errs).length) guestsValid = false;
      return { ...row, errors: errs };
    });
    setGuestRows(updatedRows);
    if (!guestsValid || hasErrors) return;

    const maxAllowed = room.beds + checkinExtraBed;
    if (guestRows.length > maxAllowed) {
      notifyError(`Too many guests: ${guestRows.length} selected but max is ${maxAllowed}.`);
      return;
    }

    setSubmitLoading(true);
    setCheckinError(null);
    const createdIds = [];

    for (let i = 0; i < guestRows.length; i++) {
      const row = guestRows[i];

      // Returning customer — skip creation
      if (row.selectedCustomerId) {
        createdIds.push(row.selectedCustomerId);
        continue;
      }

      try {
        const card1 = row.identity_card_1 instanceof File ? await compressImage(row.identity_card_1) : null;
        const card2 = row.identity_card_2 instanceof File ? await compressImage(row.identity_card_2) : null;
        const fd = new FormData();
        fd.append('name', row.name.trim());
        if (row.number?.trim()) fd.append('number', row.number.trim());
        if (sharedCountryCode) fd.append('country_code', parseInt(sharedCountryCode));
        if (row.gender) fd.append('gender', row.gender);
        if (row.date_of_birth) {
          fd.append('date_of_birth', dayjs(row.date_of_birth).format('YYYY-MM-DD'));
        } else if (row.age !== null && row.age !== undefined) {
          fd.append('age', row.age);
        }
        if (sharedAddress?.trim()) fd.append('address', sharedAddress.trim());
        if (sharedPincode?.trim()) fd.append('pincode', sharedPincode.trim());
        if (card1) fd.append('identity_card_1', card1);
        if (card2) fd.append('identity_card_2', card2);
        const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        createdIds.push(data.id);
      } catch (e) {
        const label = i === 0 ? 'Main Guest' : `Guest ${i + 1}`;
        setCheckinError(`${label}: ${parseApiError(e, 'Failed to save customer.')}`);
        setSubmitLoading(false);
        return;
      }
    }

    try {
      const { data: groupData } = await api.post('/v1/group/customers/', { customers: createdIds });
      const [h, m] = defaultCheckoutTime.split(':').map(Number);
      const expectedCheckout = dayjs(checkinCheckoutDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
      const { data: checkinData } = await api.post('/v1/checkin/', {
        room: room.id,
        group: groupData.group_id,
        price: checkinPrice,
        extra_bed: checkinExtraBed,
        extra_per_bed_price: checkinExtraPerBedPrice,
        expected_checkout: expectedCheckout,
        gst_applied: checkinGstMode !== 'none',
        gst_inclusive: checkinGstMode === 'inclusive',
        is_ac: checkinIsAc,
      });

      // Record advance payment if provided
      if (advPaymentAmount > 0 && checkinData.log_id) {
        try {
          await api.post(`/v1/stay-logs/${checkinData.log_id}/payments/`, {
            payment_type: advPaymentType,
            amount: advPaymentAmount,
          });
        } catch {
          notifyError('Check-in done, but advance payment failed — add it manually.');
        }
      }

      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      setShowForm(false);
      resetCheckinForm();
      notifySuccess('Check-in successful.');
    } catch (e) {
      setCheckinError(parseApiError(e, 'Check-in failed.'));
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
    onError: (e) => notifyError(parseApiError(e, 'Failed to submit NC request.')),
  });

  // ── Extend Stay ──
  const extendMutation = useMutation({
    mutationFn: ({ logId, expected_checkout }) => api.patch(`/v1/stay-logs/${logId}/extend/`, { expected_checkout }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      closeExtend();
      setExtendDate(null);
      notifySuccess('Stay extended.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to extend stay.')),
  });

  // ── Grant Grace ──
  const graceMutation = useMutation({
    mutationFn: ({ logId, hours }) => api.post(`/v1/stay-logs/${logId}/grace/`, { hours }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      closeGrace();
      notifySuccess('Grace period granted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to grant grace period.')),
  });

  // ── Occupied (items 5, 6, 7) ──
  if (activeLog) {
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomCost = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const logAmenities = activeLog.amenities || [];
    const amenityCost = logAmenities.reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const overtimeFee = computeOvertimeFee(activeLog);
    const gstAmount = computeGst(activeLog, nights, configMap['gst_percent']);
    const totalCost = activeLog.is_nc ? 0 : (roomCost + amenityCost + overtimeFee + gstAmount);
    const maxBeds = room.beds + activeLog.extra_bed;
    const currentGuestCount = currentGuests.length;
    const canAddGuest = currentGuestCount < maxBeds;
    const overtime = isLogOvertime(activeLog);

    const amenityOptions = allAmenities.map(a => ({
      value: String(a.id),
      label: `${a.name} — ₹${a.price} (${a.charge_type === 'per_night' ? 'Per Night' : 'Flat'})`,
    }));

    const extendMinDate = activeLog.expected_checkout
      ? dayjs(activeLog.expected_checkout).add(1, 'day').toDate()
      : dayjs().add(1, 'day').toDate();

    return (
      <Stack gap="sm">
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
          <DescRow label="Expected Checkout"
            value={activeLog.expected_checkout
              ? dayjs(activeLog.expected_checkout).format('DD MMM YYYY, hh:mm A') : '—'} />
          {overtime && (
            <DescRow label="Overtime Fee" value={`₹${overtimeFee}`} />
          )}
          {gstAmount > 0 && (
            <DescRow label={`GST (${configMap['gst_percent']}%)`} value={`₹${gstAmount}`} />
          )}
          <DescRow label="Total Cost" value={`₹${totalCost}`} />
        </Stack>
        {activeLog.is_early_checkin && (
          <Badge color="cyan" variant="light" size="sm">Early Check-In</Badge>
        )}
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
          <Button size="xs" variant="light" color="blue" onClick={openExtend}>
            Extend Stay
          </Button>
          {overtime && activeLog.expected_checkout && dayjs(activeLog.expected_checkout).isSame(dayjs(), 'day') && (
            <Button size="xs" variant="light" color="yellow" onClick={openGrace}>
              Grant Grace
            </Button>
          )}
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

        {/* Extend Stay Modal */}
        <Modal opened={extendOpened} onClose={closeExtend} title="Extend Stay">
          <DatePickerInput
            label="New Checkout Date"
            minDate={extendMinDate}
            value={extendDate}
            onChange={setExtendDate}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeExtend}>Cancel</Button>
            <Button
              color="blue"
              loading={extendMutation.isPending}
              disabled={!extendDate}
              onClick={() => {
                const [h, m] = defaultCheckoutTime.split(':').map(Number);
                const dt = dayjs(extendDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
                extendMutation.mutate({ logId: activeLog.id, expected_checkout: dt });
              }}
            >
              Extend
            </Button>
          </Group>
        </Modal>

        {/* Grant Grace Modal */}
        <Modal opened={graceOpened} onClose={closeGrace} title="Grant Grace Period">
          <Text size="sm" c="dimmed" mb="sm">Select how long to pause the overtime clock.</Text>
          <SegmentedControl
            fullWidth
            value={graceHours}
            onChange={setGraceHours}
            data={[
              { value: '1', label: '1 hr' },
              { value: '2', label: '2 hrs' },
              { value: '3', label: '3 hrs' },
            ]}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeGrace}>Cancel</Button>
            <Button
              color="yellow"
              loading={graceMutation.isPending}
              onClick={() => graceMutation.mutate({ logId: activeLog.id, hours: Number(graceHours) })}
            >
              Grant
            </Button>
          </Group>
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

  // ── Inline check-in form (item 4) ──
  const ciNights = checkinCheckoutDate ? dayjs(checkinCheckoutDate).diff(dayjs().startOf('day'), 'day') : 0;
  const ciMaxAllowed = room.beds + checkinExtraBed;
  const ciGuestExceeded = guestRows.length > ciMaxAllowed;
  const gstPercent = configMap['gst_percent'] ?? '0';

  // Billing computations for summary panel
  const ciToday = new Date().toISOString().slice(0, 10);
  const ciChartPrice = priceChart.find(e => e.room === room.id && e.date === ciToday)?.price;
  const ciEffectivePrice = checkinPrice > 0 ? checkinPrice : (ciChartPrice ?? room.price ?? 0);
  const ciPerNight = Number(ciEffectivePrice) + checkinExtraBed * Number(checkinExtraPerBedPrice);
  const ciRoomSubtotal = ciPerNight * ciNights;
  const ciGstRate = parseFloat(gstPercent) / 100;
  const ciGstAmount = checkinGstMode === 'added'
    ? Math.round(ciRoomSubtotal * ciGstRate)
    : checkinGstMode === 'inclusive'
      ? Math.round(ciRoomSubtotal * ciGstRate / (1 + ciGstRate))
      : 0;
  const ciEstimatedTotal = checkinGstMode === 'added' ? ciRoomSubtotal + ciGstAmount : ciRoomSubtotal;

  return (
    <Grid gutter="md">
      {/* Left: form */}
      <Grid.Col span={{ base: 12, xl: 7 }}>
        <Card withBorder>
          <Text fw={600} mb="md">Check-In</Text>

          {/* Room & Stay Details */}
          <Text fw={500} size="sm" mb="sm">Room & Stay Details</Text>
          <Grid gutter="sm" mb="md">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Price (₹, 0 = auto)" min={0} value={checkinPrice}
                onChange={setCheckinPrice} placeholder={String(room.price)} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Extra Beds" min={0} value={checkinExtraBed} onChange={setCheckinExtraBed} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Price per Extra Bed (₹)" min={0} value={checkinExtraPerBedPrice} onChange={setCheckinExtraPerBedPrice} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <DatePickerInput
                type="range"
                label="Check-in → Checkout"
                value={[new Date(), checkinCheckoutDate]}
                onChange={([, end]) => { setCheckinCheckoutDate(end ?? null); setCheckinDateError(null); }}
                minDate={new Date(new Date().setDate(new Date().getDate() + 1))}
                required
                error={checkinDateError}
              />
              {checkinCheckoutDate && (
                <Text size="xs" c="dimmed" mt={4}>
                  Departure: {dayjs(checkinCheckoutDate).format('DD MMM YYYY')} at {defaultCheckoutTime} ({ciNights} night{ciNights !== 1 ? 's' : ''})
                </Text>
              )}
            </Grid.Col>
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={6}>GST</Text>
              <SegmentedControl
                value={checkinGstMode}
                onChange={setCheckinGstMode}
                data={[
                  { value: 'none', label: 'No GST' },
                  { value: 'added', label: `Add GST (${gstPercent}%)` },
                  { value: 'inclusive', label: `GST Incl. (${gstPercent}%)` },
                ]}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Switch
                label="AC Room"
                checked={checkinIsAc ?? false}
                onChange={(e) => setCheckinIsAc(e.currentTarget.checked)}
              />
            </Grid.Col>
          </Grid>

          <Divider mb="md" />

          {/* Guest Details */}
          <Text fw={500} size="sm" mb="sm">Guest Details</Text>
          <Stack gap="md" mb="md">
            {guestRows.map((row, idx) => (
              <Paper key={row._key} withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={600}>{idx === 0 ? 'Main Guest' : `Guest ${idx + 1}`}</Text>
                  {idx > 0 && (
                    <ActionIcon color="red" variant="light" size="sm"
                      onClick={() => setGuestRows(rows => rows.filter((_, i) => i !== idx))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
                <GuestForm
                  row={row} isMain={idx === 0}
                  onChange={(field, val) => updateCheckinGuest(idx, field, val)}
                  onSelectCustomer={(val) => autofillCheckinGuest(idx, val)}
                />
              </Paper>
            ))}
            <div>
              <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />}
                disabled={guestRows.length >= ciMaxAllowed}
                onClick={() => setGuestRows(rows => [...rows, createEmptyGuest()])}>
                Add Guest
              </Button>
            </div>
          </Stack>

          {/* Contact Details (shared across all guests) */}
          <Paper withBorder p="md" radius="md" mb="md">
            <Text size="sm" fw={600} mb="sm">Contact Details</Text>
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Select
                  label="Country Code" searchable value={sharedCountryCode}
                  data={codes.map(c => ({ value: String(c.id), label: `+${c.country_code} ${c.country_name}` }))}
                  onChange={setSharedCountryCode}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Pincode" maxLength={6} value={sharedPincode}
                  onChange={(e) => setSharedPincode(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
                      e.preventDefault();
                  }}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label="Address" value={sharedAddress}
                  onChange={(e) => setSharedAddress(e.currentTarget.value)} />
              </Grid.Col>
            </Grid>
          </Paper>

          {ciGuestExceeded && (
            <Text size="sm" c="red" mt="sm">
              Too many guests: {guestRows.length} selected but max is {ciMaxAllowed} ({room.beds} bed{room.beds !== 1 ? 's' : ''} + {checkinExtraBed} extra).
            </Text>
          )}
          {checkinError && <Alert color="red" title="Error" mt="sm">{checkinError}</Alert>}

          <Group mt="md">
            <Button variant="default" onClick={() => { setShowForm(false); resetCheckinForm(); }}>Cancel</Button>
            <Button loading={submitLoading} disabled={ciGuestExceeded} onClick={handleCheckin}>Confirm Check-In</Button>
          </Group>
        </Card>
      </Grid.Col>

      {/* Right: billing summary */}
      <Grid.Col span={{ base: 12, xl: 5 }}>
        <Card withBorder style={{ position: 'sticky', top: 16 }}>
          <Text fw={700} size="lg" mb="sm">Billing Summary</Text>

          {/* Check-in / Check-out date header */}
          <Paper bg="gray.0" p="md" radius="sm" mb="sm">
            <Group justify="space-between" align="center">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Check-in</Text>
                <Text fw={700} size="lg">{dayjs().format('DD/MM/YYYY')}</Text>
              </Stack>
              <Text c="dimmed" size="xl">→</Text>
              <Stack gap={4} align="flex-end">
                <Text size="xs" c="dimmed">Check-out</Text>
                <Text fw={700} size="lg">
                  {checkinCheckoutDate ? dayjs(checkinCheckoutDate).format('DD/MM/YYYY') : '—'}
                </Text>
              </Stack>
            </Group>
          </Paper>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Room</Text>
              <Text size="sm" fw={500}>{room.room_number}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Price/night</Text>
              <Text size="sm">₹{Number(ciEffectivePrice).toLocaleString()}</Text>
            </Group>
            {checkinExtraBed > 0 && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{checkinExtraBed} extra bed{checkinExtraBed > 1 ? 's' : ''} × ₹{checkinExtraPerBedPrice}</Text>
                <Text size="sm">₹{(checkinExtraBed * Number(checkinExtraPerBedPrice)).toLocaleString()}</Text>
              </Group>
            )}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Per night total</Text>
              <Text size="sm">₹{Number(ciPerNight).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">× {ciNights} night{ciNights !== 1 ? 's' : ''}</Text>
              <Text size="sm" fw={500}>₹{Number(ciRoomSubtotal).toLocaleString()}</Text>
            </Group>
            {checkinGstMode !== 'none' && ciGstAmount > 0 && (
              <Group justify="space-between">
                <Text size="sm" c={checkinGstMode === 'inclusive' ? 'dimmed' : undefined}>
                  {checkinGstMode === 'inclusive' ? `Incl. GST (${gstPercent}%)` : `+ GST (${gstPercent}%)`}
                </Text>
                <Text size="sm" c={checkinGstMode === 'inclusive' ? 'dimmed' : undefined}>
                  ₹{Number(ciGstAmount).toLocaleString()}
                </Text>
              </Group>
            )}
            <Divider />
            <Group justify="space-between">
              <Text fw={700}>Estimated Total</Text>
              <Text fw={700} size="lg" c="teal">₹{Number(ciEstimatedTotal).toLocaleString()}</Text>
            </Group>
          </Stack>

          <Divider my="md" />

          <Text fw={600} size="sm" mb="xs">Advance Payment</Text>
          <Stack gap="xs">
            <Select
              label="Payment Type"
              data={[
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI' },
                { value: 'card', label: 'Card' },
                { value: 'other', label: 'Other' },
              ]}
              value={advPaymentType}
              onChange={setAdvPaymentType}
              size="sm"
            />
            <NumberInput
              label="Amount (₹)"
              min={0}
              value={advPaymentAmount}
              onChange={setAdvPaymentAmount}
              size="sm"
              placeholder="0 = no advance"
            />
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}

// ── Tab 2: Reservations ────────────────────────────────────────────────────────

const REMINDER_PRESETS = [
  { value: '0', label: 'Same day' },
  { value: '1', label: '1 day before' },
  { value: '3', label: '3 days before' },
  { value: '5', label: '5 days before' },
  { value: '7', label: '7 days before' },
  { value: '10', label: '10 days before' },
  { value: '14', label: '14 days before' },
  { value: '30', label: '30 days before' },
];

function ReminderPopover({ reservation }) {
  const qc = useQueryClient();
  const [selectedDays, setSelectedDays] = useState(null);
  const reminders = reservation.reminders || [];
  const existingDays = new Set(reminders.map(r => String(r.days_before)));
  const availablePresets = REMINDER_PRESETS.filter(p => !existingDays.has(p.value));

  const addMutation = useMutation({
    mutationFn: ({ reservationId, daysBefore }) =>
      api.post('/v1/reminders/', { reservation: reservationId, days_before: daysBefore }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomReservations(reservation.room) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      setSelectedDays(null);
      notifySuccess('Reminder added.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to add reminder.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (reminderId) => api.delete(`/v1/reminder/${reminderId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomReservations(reservation.room) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
    },
    onError: () => notifyError('Failed to delete reminder.'),
  });

  return (
    <Popover width={260} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <ActionIcon variant="subtle" color={reminders.length > 0 ? 'orange' : 'gray'} size="sm">
          <IconBell size={14} />
          {reminders.length > 0 && (
            <Badge size="xs" color="orange" circle style={{ position: 'absolute', top: -4, right: -4 }}>
              {reminders.length}
            </Badge>
          )}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="xs" fw={600} mb="xs">Reminders</Text>
        {reminders.length === 0 ? (
          <Text size="xs" c="dimmed" mb="xs">No reminders set.</Text>
        ) : (
          <Group gap={4} mb="xs" wrap="wrap">
            {reminders.map(r => (
              <Badge
                key={r.id}
                size="sm"
                color="orange"
                variant="light"
                rightSection={
                  <ActionIcon size="xs" color="orange" variant="transparent" onClick={() => deleteMutation.mutate(r.id)}>
                    ×
                  </ActionIcon>
                }
              >
                {r.days_before === 0 ? 'Same day' : `${r.days_before}d before`}
              </Badge>
            ))}
          </Group>
        )}
        <Select
          size="xs"
          placeholder={availablePresets.length === 0 ? 'All reminders set' : 'Select days before'}
          data={availablePresets}
          value={selectedDays}
          onChange={setSelectedDays}
          disabled={availablePresets.length === 0}
          comboboxProps={{ withinPortal: false }}
          mb="xs"
          clearable
        />
        <Button
          size="xs"
          fullWidth
          disabled={selectedDays === null}
          loading={addMutation.isPending}
          onClick={() => addMutation.mutate({ reservationId: reservation.id, daysBefore: parseInt(selectedDays) })}
        >
          Add Reminder
        </Button>
      </Popover.Dropdown>
    </Popover>
  );
}

function ConvertCheckinModal({ opened, onClose, reservation, room, configMap = {} }) {
  const qc = useQueryClient();
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

  const { data: existingGuests = [], isLoading: guestsLoading } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(reservation?.group),
    queryFn: () => fetchGroupCustomers(reservation.group),
    enabled: opened && !!reservation?.group,
  });

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const configMap2 = parseConfigs(configs);
  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);

  const [guestRows, setGuestRows] = useState([]);
  const [price, setPrice] = useState(0);
  const [extraBed, setExtraBed] = useState(0);
  const [extraPerBedPrice, setExtraPerBedPrice] = useState(0);
  const [checkoutDate, setCheckoutDate] = useState(null);
  const [gstApplied, setGstApplied] = useState(true);
  const [isAc, setIsAc] = useState(room.is_ac);
  const [sharedCountryCode, setSharedCountryCode] = useState(null);
  const [sharedAddress, setSharedAddress] = useState('');
  const [sharedPincode, setSharedPincode] = useState('');
  const [checkoutDateError, setCheckoutDateError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Initialise form when guests load or modal opens
  useEffect(() => {
    if (!opened) return;
    setPrice(reservation?.price ?? 0);
    setCheckoutDate(reservation?.check_out_date ? new Date(reservation.check_out_date) : null);
    setIsAc(room.is_ac);
    setSharedCountryCode(indiaId);
    setSubmitError(null);
    setCheckoutDateError(null);
  }, [opened, reservation, indiaId]);

  useEffect(() => {
    if (!opened || guestsLoading) return;
    if (existingGuests.length > 0) {
      setGuestRows(existingGuests.map((g, i) => ({
        _key: g.id,
        id: g.id,
        name: g.name ?? '',
        number: g.number ?? '',
        gender: g.gender ?? null,
        date_of_birth: g.date_of_birth ? new Date(g.date_of_birth) : null,
        age: g.age ?? null,
        identity_card_1: null,
        identity_card_2: null,
        errors: {},
      })));
    } else {
      setGuestRows([createEmptyGuest()]);
    }
  }, [existingGuests, opened, guestsLoading]);

  const handleClose = () => {
    setGuestRows([]);
    setSubmitError(null);
    setCheckoutDateError(null);
    onClose();
  };

  const handleSubmit = async () => {
    let hasErrors = false;
    if (!checkoutDate) { setCheckoutDateError('Select a checkout date.'); hasErrors = true; }
    else setCheckoutDateError(null);

    const updatedRows = guestRows.map((row, idx) => {
      const errs = {};
      if (!row.name?.trim()) errs.name = 'Required';
      if (idx === 0 && !row.number?.trim()) errs.number = 'Required';
      if (!row.identity_card_1) errs.identity_card_1 = 'Required';
      if (Object.keys(errs).length) hasErrors = true;
      return { ...row, errors: errs };
    });
    setGuestRows(updatedRows);
    if (hasErrors) return;

    setSubmitLoading(true);
    setSubmitError(null);

    for (let i = 0; i < guestRows.length; i++) {
      const row = guestRows[i];
      try {
        const card1 = row.identity_card_1 instanceof File ? await compressImage(row.identity_card_1) : null;
        const card2 = row.identity_card_2 instanceof File ? await compressImage(row.identity_card_2) : null;
        const fd = new FormData();
        fd.append('name', row.name.trim());
        if (row.number?.trim()) fd.append('number', row.number.trim());
        if (sharedCountryCode) fd.append('country_code', parseInt(sharedCountryCode));
        if (row.gender) fd.append('gender', row.gender);
        if (row.date_of_birth) {
          fd.append('date_of_birth', dayjs(row.date_of_birth).format('YYYY-MM-DD'));
        } else if (row.age !== null && row.age !== undefined) {
          fd.append('age', row.age);
        }
        if (sharedAddress?.trim()) fd.append('address', sharedAddress.trim());
        if (sharedPincode?.trim()) fd.append('pincode', sharedPincode.trim());
        if (card1) fd.append('identity_card_1', card1);
        if (card2) fd.append('identity_card_2', card2);
        // PATCH if existing customer, POST if new
        if (row.id) {
          await api.patch(`/v1/customers/${row.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
          await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      } catch (e) {
        const label = i === 0 ? 'Main Guest' : `Guest ${i + 1}`;
        setSubmitError(`${label}: ${parseApiError(e, 'Failed to save customer.')}`);
        setSubmitLoading(false);
        return;
      }
    }

    try {
      const [h, m] = defaultCheckoutTime.split(':').map(Number);
      const expectedCheckout = dayjs(checkoutDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
      await api.post('/v1/checkin/', {
        room: room.id,
        group: reservation.group,
        price,
        extra_bed: extraBed,
        extra_per_bed_price: extraPerBedPrice,
        expected_checkout: expectedCheckout,
        gst_applied: gstApplied,
        is_ac: isAc,
      });
      await api.delete(`/v1/reservation/${reservation.id}/`);
      qc.invalidateQueries({ queryKey: QUERY_KEYS.activeLogs });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.rooms });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomReservations(room.id) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      notifySuccess('Reservation converted to check-in.');
      handleClose();
    } catch (e) {
      setSubmitError(parseApiError(e, 'Check-in failed.'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const maxAllowed = room.beds + extraBed;
  const guestExceeded = guestRows.length > maxAllowed;

  return (
    <Modal opened={opened} onClose={handleClose} title="Convert Reservation to Check-In" size="xl">
      {guestsLoading ? (
        <Center h={100}><Loader /></Center>
      ) : (
        <Stack gap="md">
          {/* Stay Details */}
          <Text fw={500} size="sm">Stay Details</Text>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Price (₹)" min={0} value={price} onChange={setPrice} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Extra Beds" min={0} value={extraBed} onChange={setExtraBed} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Price per Extra Bed (₹)" min={0} value={extraPerBedPrice} onChange={setExtraPerBedPrice} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <DatePickerInput
                label="Checkout Date"
                value={checkoutDate}
                onChange={(d) => { setCheckoutDate(d); setCheckoutDateError(null); }}
                minDate={new Date()}
                required
                error={checkoutDateError}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Checkbox
                label={`Apply GST (${configMap2['gst_percent'] ?? '0'}%)`}
                checked={gstApplied}
                onChange={(e) => setGstApplied(e.currentTarget.checked)}
                mt="sm"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Switch label="AC Room" checked={isAc ?? false} onChange={(e) => setIsAc(e.currentTarget.checked)} mt="sm" />
            </Grid.Col>
          </Grid>

          <Divider />

          {/* Guest Details */}
          <Text fw={500} size="sm">Guest Details</Text>
          <Stack gap="md">
            {guestRows.map((row, idx) => (
              <Paper key={row._key} withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={600}>{idx === 0 ? 'Main Guest' : `Guest ${idx + 1}`}</Text>
                  {idx > 0 && (
                    <ActionIcon color="red" variant="light" size="sm"
                      onClick={() => setGuestRows(rows => rows.filter((_, i) => i !== idx))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
                <GuestForm
                  row={row} isMain={idx === 0}
                  onChange={(field, val) => setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val } : r))}
                />
              </Paper>
            ))}
            <div>
              <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />}
                disabled={guestExceeded}
                onClick={() => setGuestRows(rows => [...rows, createEmptyGuest()])}>
                Add Guest
              </Button>
            </div>
          </Stack>

          {/* Shared Contact Details */}
          <Paper withBorder p="md" radius="md">
            <Text size="sm" fw={600} mb="sm">Contact Details</Text>
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Select
                  label="Country Code" searchable value={sharedCountryCode}
                  data={codes.map(c => ({ value: String(c.id), label: `+${c.country_code} ${c.country_name}` }))}
                  onChange={setSharedCountryCode}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Pincode" maxLength={6} value={sharedPincode}
                  onChange={(e) => setSharedPincode(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
                      e.preventDefault();
                  }}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label="Address" value={sharedAddress} onChange={(e) => setSharedAddress(e.currentTarget.value)} />
              </Grid.Col>
            </Grid>
          </Paper>

          {guestExceeded && (
            <Text size="sm" c="red">
              Too many guests: {guestRows.length} but max is {maxAllowed} ({room.beds} bed{room.beds !== 1 ? 's' : ''} + {extraBed} extra).
            </Text>
          )}
          {submitError && <Alert color="red" title="Error">{submitError}</Alert>}

          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>Cancel</Button>
            <Button loading={submitLoading} disabled={guestExceeded} onClick={handleSubmit}>Confirm Check-In</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

// ── Room Status Log ────────────────────────────────────────────────────────────

const STATUS_LABEL = { available: 'Available', cleaning: 'Cleaning', out_of_order: 'Out of Order', occupied: 'Occupied' };
const STATUS_COLOR = { available: 'teal', cleaning: 'violet', out_of_order: 'dark', occupied: 'red' };

function RoomStatusLogSection({ roomId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.roomStatusLogs(roomId),
    queryFn: () => fetchRoomStatusLogs(roomId),
  });

  if (isLoading) return <Loader size="xs" />;
  if (!logs.length) return <Text size="sm" c="dimmed">No status changes recorded yet.</Text>;

  return (
    <Stack gap="xs">
      {logs.map(log => (
        <Group key={log.id} gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed" w={140}>{dayjs(log.changed_on).format('DD MMM YYYY, hh:mm A')}</Text>
          <Badge color={STATUS_COLOR[log.old_status] ?? 'gray'} variant="light" size="sm">
            {STATUS_LABEL[log.old_status] ?? log.old_status}
          </Badge>
          <Text size="xs" c="dimmed">→</Text>
          <Badge color={STATUS_COLOR[log.new_status] ?? 'gray'} variant="light" size="sm">
            {STATUS_LABEL[log.new_status] ?? log.new_status}
          </Badge>
          <Text size="xs" c="dimmed">by {log.changed_by_name}</Text>
          {log.note ? <Text size="xs" c="dimmed">· {log.note}</Text> : null}
        </Group>
      ))}
    </Stack>
  );
}

function ReservationsTab({ room, reservations, isOccupied, configMap = {} }) {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canViewReminders = permissions.view_reservationreminder || permissions.is_superuser;
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [convertingId, setConvertingId] = useState(null);
  const [convertReservation, setConvertReservation] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

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
      notifyError(parseApiError(e, 'Failed to add reservation.'));
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
            simpleAdd
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

// ── Tab 3: Room Details (edit) ─────────────────────────────────────────────────

function RoomDetailsTab({ room }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });

  const form = useForm({
    initialValues: {
      room_number: room.room_number,
      room_type: room.room_type ? String(room.room_type) : null,
      beds: room.beds,
      price: room.price,
      is_ac: room.is_ac ?? false,
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
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/v1/room/${room.id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Room deleted.');
      navigate('/rooms');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete room.')),
  });

  const handleDelete = () => modals.openConfirmModal({
    title: 'Delete Room',
    children: <Text size="sm">This will permanently delete Room {room.room_number}. This cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(),
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
          <NumberInput label="Default Price (₹)" min={0} {...form.getInputProps('price')} mb="sm" required />
          <Switch
            label="AC Room"
            checked={form.values.is_ac}
            onChange={(e) => form.setFieldValue('is_ac', e.currentTarget.checked)}
            mb="md"
          />
          <Group justify="space-between">
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
            <Button color="red" variant="light" onClick={handleDelete} loading={deleteMutation.isPending}>
              Delete Room
            </Button>
          </Group>
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
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);
  const { data: allRooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });

  const checkoutMutation = useMutation({
    mutationFn: (logId) => api.post(`/v1/checkout/${logId}/`),
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
    mutationFn: async ({ logId, payment_type, amount }) => {
      await api.post(`/v1/stay-logs/${logId}/payments/`, { payment_type, amount, note: 'Collected at checkout' });
      await api.post(`/v1/checkout/${logId}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closePayCheckout();
      notifySuccess('Payment recorded and checkout successful.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Pay & checkout failed.')),
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

  const handleCheckout = () => {
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomTotal = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const amenityTotal = (activeLog.amenities || []).reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const overtimeFee = computeOvertimeFee(activeLog);
    const gstAmount = computeGst(activeLog, nights, configMap['gst_percent']);
    const billTotal = activeLog.is_nc ? 0 : (roomTotal + amenityTotal + overtimeFee + gstAmount);
    const totalPaid = (activeLog.payments || []).reduce((s, p) => s + Number(p.amount), 0);
    const outstandingAmt = billTotal - totalPaid;

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
        onConfirm: () => checkoutMutation.mutate(activeLog.id),
      });
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

  const paymentTypeOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' },
  ];

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
        {activeLog && (
          <Group gap="xs" style={{ marginLeft: 'clamp(16px, 8vw, 130px)' }}>
            <Button variant="outline" color="blue" onClick={handleOpenShift}>
              Shift Room
            </Button>
            <Button color="red" variant="outline" leftSection={<IconLogout size={16} />} onClick={handleCheckout} loading={checkoutMutation.isPending}>
              Checkout
            </Button>
          </Group>
        )}
      </Group>

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
              payment_type: payCheckoutType,
              amount: payCheckoutAmount,
            })}
          >
            Pay & Checkout
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
