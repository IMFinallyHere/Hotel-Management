import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Stepper, Button, Group, Stack, Text, Paper, Badge, Grid,
  NumberInput, TextInput, Select, Switch, Autocomplete, FileInput,
  Divider, SegmentedControl, ActionIcon, Table, Loader,
  ThemeIcon, SimpleGrid, Card, Box, Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCheck, IconTrash, IconUserPlus, IconUpload, IconX, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import {
  QUERY_KEYS, searchCustomers,
  fetchRooms, fetchRoomTypes, fetchActiveLogs, fetchReservations,
  fetchPriceChart, fetchConfigurations, fetchCountryCodes, fetchPaymentMethods,
  addStayVehicle,
} from '../api/queries';
import { parseApiError } from '../api/errorUtils';
import { parseConfigs } from '../utils/configUtils';
import { compressImage } from '../utils/imageUtils';
import { notifySuccess } from '../api/notify';

// ── Shared constants ──────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLOR = {
  available: 'teal', cleaning: 'violet', out_of_order: 'dark',
  occupied: 'red', reserved: 'orange', overtime: 'yellow',
};

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

function createRoomConfig(room, indiaId, priceChart = []) {
  const today = new Date().toISOString().slice(0, 10);
  const chartPrice = priceChart.find(e => e.room === room.id && e.date === today)?.price;
  return {
    price: Number(chartPrice ?? room.price ?? 0),
    extraBed: 0,
    extraPerBedPrice: 0,
    isAc: room.is_ac,
    guestRows: [createEmptyGuest(indiaId)],
  };
}

// ── GuestForm (same pattern as RoomDetail) ────────────────────────────────────

function GuestForm({ row, isMain, showIdCard, onChange, onSelectCustomer }) {
  const autocompleteData = row.searchResults.map(c => ({
    value: String(c.id),
    label: `${c.name}${c.number ? ` — ${c.number}` : ''}`,
  }));

  return (
    <Grid gutter="xs">
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Autocomplete
          label="Phone" size="xs" maxLength={10} value={row.number}
          required={isMain && showIdCard}
          error={row.errors.number}
          onChange={(val) => onChange('number', val)}
          onOptionSubmit={(val) => onSelectCustomer(val)}
          data={autocompleteData}
          rightSection={row.searchLoading ? <Loader size="xs" /> : null}
          filter={({ options }) => options}
          onKeyDown={(e) => {
            if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Full Name" size="xs" value={row.name} required error={row.errors.name}
          onChange={(e) => onChange('name', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (!/^[A-Za-z\s]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Select size="xs" label="Gender" data={GENDER_OPTIONS} value={row.gender} onChange={(v) => onChange('gender', v)} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <DatePickerInput size="xs" label="Date of Birth" value={row.date_of_birth} clearable
          onChange={(date) => { onChange('date_of_birth', date); onChange('age', date ? dayjs().diff(dayjs(date), 'year') : null); }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <NumberInput size="xs" label="Age" min={0} max={120} disabled={!!row.date_of_birth}
          value={row.age ?? ''} onChange={(v) => onChange('age', v === '' ? null : v)} />
      </Grid.Col>
      {showIdCard && (
        <Grid.Col span={12}>
          {row.selectedCustomerId ? (
            <Text size="xs" c="dimmed">ID cards on file — no re-upload needed.</Text>
          ) : (
            <>
              <FileInput
                size="xs"
                label="Identity Card (1 required, 2nd optional)"
                leftSection={<IconUpload size={12} />}
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
                <Text size="xs" c="dimmed" mt={2}>
                  {[row.identity_card_1?.name, row.identity_card_2?.name].filter(Boolean).join(' • ')}
                </Text>
              )}
            </>
          )}
        </Grid.Col>
      )}
    </Grid>
  );
}

// ── Billing helpers ───────────────────────────────────────────────────────────

function computeRoomBilling(room, config, nights, gstMode, gstPercent, priceChart) {
  const today = new Date().toISOString().slice(0, 10);
  const chartPrice = priceChart?.find(e => e.room === room.id && e.date === today)?.price;
  const effectivePrice = Number(config.price) > 0 ? Number(config.price) : Number(chartPrice ?? room.price ?? 0);
  const perNight = effectivePrice + Number(config.extraBed) * Number(config.extraPerBedPrice);
  const subtotal = perNight * nights;
  const rate = parseFloat(gstPercent) / 100;
  const gstAmount = gstMode === 'added'
    ? Math.round(subtotal * rate)
    : gstMode === 'inclusive'
      ? Math.round(subtotal * rate / (1 + rate))
      : 0;
  const total = gstMode === 'added' ? subtotal + gstAmount : subtotal;
  return { effectivePrice, perNight, subtotal, gstAmount, total };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BulkBooking() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const { data: reservations = [] } = useQuery({ queryKey: QUERY_KEYS.reservations, queryFn: fetchReservations });
  const { data: priceChart = [] } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods() });

  const configMap = parseConfigs(configs);
  const gstPercent = configMap['gst_percent'] ?? '0';
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);

  const roomTypeMap = useMemo(() =>
    Object.fromEntries(roomTypes.map(t => [t.id, t.name])), [roomTypes]);

  const occupiedIds = useMemo(() =>
    new Set(activeLogs.map(l => l.room)), [activeLogs]);

  // ── Wizard state ──
  const [step, setStep] = useState(0);
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());
  const [ciDate, setCiDate] = useState(null);
  const [checkoutDate, setCheckoutDate] = useState(null);
  const [gstMode, setGstMode] = useState('added');
  const [roomConfigs, setRoomConfigs] = useState({});
  const [advPaymentType, setAdvPaymentType] = useState(null);
  const [advPaymentAmount, setAdvPaymentAmount] = useState(0);
  const [maleCount, setMaleCount] = useState(0);
  const [femaleCount, setFemaleCount] = useState(0);
  const [childCount, setChildCount] = useState(0);
  const [vehicleInputs, setVehicleInputs] = useState([]);
  const [vehicleInputText, setVehicleInputText] = useState('');
  const [resAdvPaymentType, setResAdvPaymentType] = useState(null);
  const [resAdvPaymentAmount, setResAdvPaymentAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null); // array of { roomId, status, message }
  const [sharedGuest, setSharedGuest] = useState(() => createEmptyGuest(null));

  // booking type derived from check-in date: today = check-in now, future = reservation
  const bookingType = useMemo(() => {
    if (!ciDate) return null;
    return dayjs(ciDate).isSame(dayjs(), 'day') ? 'checkin' : 'reservation';
  }, [ciDate]);

  const reservedForRange = useMemo(() => {
    if (bookingType !== 'reservation' || !ciDate || !checkoutDate) return new Set();
    const startStr = dayjs(ciDate).format('YYYY-MM-DD');
    const endStr = dayjs(checkoutDate).format('YYYY-MM-DD');
    return new Set(
      reservations
        .filter(r => r.check_in_date < endStr && r.check_out_date > startStr)
        .map(r => r.room)
    );
  }, [bookingType, ciDate, checkoutDate, reservations]);

  const bookableRooms = useMemo(() => {
    if (!bookingType) return [];
    if (bookingType === 'reservation') return rooms.filter(r => r.is_active !== false && !reservedForRange.has(r.id));
    return rooms.filter(r => r.is_active !== false && !occupiedIds.has(r.id) && r.status === 'available');
  }, [bookingType, rooms, occupiedIds, reservedForRange]);

  const debounceTimers = useRef({});

  // Sync roomConfigs when selection changes
  useEffect(() => {
    setRoomConfigs(prev => {
      const next = {};
      selectedRoomIds.forEach(id => {
        const room = rooms.find(r => r.id === id);
        next[id] = prev[id] ?? (room ? createRoomConfig(room, indiaId, priceChart) : undefined);
      });
      return next;
    });
  }, [selectedRoomIds, indiaId, rooms]);

  const effectiveCheckIn = ciDate ? dayjs(ciDate) : dayjs();
  const nights = checkoutDate ? Math.max(1, dayjs(checkoutDate).diff(effectiveCheckIn.startOf('day'), 'day')) : 0;
  const selectedRooms = rooms.filter(r => selectedRoomIds.has(r.id));

  // ── Billing totals ──
  const billingPerRoom = useMemo(() => {
    const map = {};
    selectedRooms.forEach(room => {
      const config = roomConfigs[room.id];
      if (config) map[room.id] = computeRoomBilling(room, config, nights, gstMode, gstPercent, priceChart);
    });
    return map;
  }, [selectedRooms, roomConfigs, nights, gstMode, gstPercent, priceChart]);

  const grandTotal = useMemo(() =>
    Object.values(billingPerRoom).reduce((sum, b) => sum + b.total, 0),
    [billingPerRoom]);

  // ── Room toggle ──
  const toggleRoom = (roomId) => {
    setSelectedRoomIds(prev => {
      const next = new Set(prev);
      next.has(roomId) ? next.delete(roomId) : next.add(roomId);
      return next;
    });
  };

  // ── Guest update with phone autocomplete ──
  const updateGuest = (roomId, guestIdx, field, value) => {
    setRoomConfigs(prev => {
      const config = prev[roomId];
      if (!config) return prev;
      const newRows = config.guestRows.map((r, i) => i === guestIdx ? { ...r, [field]: value } : r);
      return { ...prev, [roomId]: { ...config, guestRows: newRows } };
    });

    if (field === 'number') {
      const key = `${roomId}-${guestIdx}`;
      clearTimeout(debounceTimers.current[key]);
      if (value.length >= 3) {
        debounceTimers.current[key] = setTimeout(async () => {
          setRoomConfigs(prev => {
            const config = prev[roomId];
            if (!config) return prev;
            const rows = config.guestRows.map((r, i) => i === guestIdx ? { ...r, searchLoading: true } : r);
            return { ...prev, [roomId]: { ...config, guestRows: rows } };
          });
          const results = await searchCustomers(value).catch(() => []);
          setRoomConfigs(prev => {
            const config = prev[roomId];
            if (!config) return prev;
            const rows = config.guestRows.map((r, i) =>
              i === guestIdx ? { ...r, searchResults: results, searchLoading: false } : r
            );
            return { ...prev, [roomId]: { ...config, guestRows: rows } };
          });
        }, 350);
      } else {
        setRoomConfigs(prev => {
          const config = prev[roomId];
          if (!config) return prev;
          const rows = config.guestRows.map((r, i) =>
            i === guestIdx ? { ...r, searchResults: [], selectedCustomerId: null } : r
          );
          return { ...prev, [roomId]: { ...config, guestRows: rows } };
        });
      }
    }
  };

  const autofillGuest = (roomId, guestIdx, customerId) => {
    setRoomConfigs(prev => {
      const config = prev[roomId];
      if (!config) return prev;
      const customer = config.guestRows[guestIdx]?.searchResults.find(c => String(c.id) === customerId);
      if (!customer) return prev;
      const rows = config.guestRows.map((r, i) => i !== guestIdx ? r : {
        ...r,
        name: customer.name ?? r.name,
        number: customer.number ?? r.number,
        gender: customer.gender ?? r.gender,
        date_of_birth: customer.date_of_birth ? new Date(customer.date_of_birth) : r.date_of_birth,
        age: customer.age ?? r.age,
        selectedCustomerId: customer.id,
        searchResults: [],
      });
      return { ...prev, [roomId]: { ...config, guestRows: rows } };
    });
  };

  const addGuest = (roomId) => {
    setRoomConfigs(prev => {
      const config = prev[roomId];
      if (!config) return prev;
      return { ...prev, [roomId]: { ...config, guestRows: [...config.guestRows, createEmptyGuest(indiaId)] } };
    });
  };

  const removeGuest = (roomId, guestIdx) => {
    setRoomConfigs(prev => {
      const config = prev[roomId];
      if (!config) return prev;
      return { ...prev, [roomId]: { ...config, guestRows: config.guestRows.filter((_, i) => i !== guestIdx) } };
    });
  };

  const updateConfig = (roomId, field, value) => {
    setRoomConfigs(prev => {
      const config = prev[roomId];
      if (!config) return prev;
      return { ...prev, [roomId]: { ...config, [field]: value } };
    });
  };

  const updateSharedGuest = (field, value) => {
    setSharedGuest(prev => ({ ...prev, [field]: value, errors: { ...prev.errors, [field]: undefined } }));
    if (field === 'number') {
      clearTimeout(debounceTimers.current['shared']);
      if (value.length >= 3) {
        debounceTimers.current['shared'] = setTimeout(async () => {
          setSharedGuest(prev => ({ ...prev, searchLoading: true }));
          const res = await searchCustomers(value).catch(() => []);
          setSharedGuest(prev => ({ ...prev, searchResults: res, searchLoading: false }));
        }, 350);
      } else {
        setSharedGuest(prev => ({ ...prev, searchResults: [], selectedCustomerId: null }));
      }
    }
  };

  const autofillSharedGuest = (customerId) => {
    setSharedGuest(prev => {
      const customer = prev.searchResults.find(c => String(c.id) === customerId);
      if (!customer) return prev;
      return {
        ...prev,
        name: customer.name ?? prev.name,
        number: customer.number ?? prev.number,
        gender: customer.gender ?? prev.gender,
        date_of_birth: customer.date_of_birth ? new Date(customer.date_of_birth) : prev.date_of_birth,
        age: customer.age ?? prev.age,
        selectedCustomerId: customer.id,
        searchResults: [],
      };
    });
  };

  // ── Validation ──
  const validateStep2 = () => {
    if (bookingType === 'reservation') {
      const errs = {};
      if (!sharedGuest.name?.trim()) errs.name = 'Required';
      if (!sharedGuest.number?.trim()) errs.number = 'Required';
      if (Object.keys(errs).length) {
        setSharedGuest(g => ({ ...g, errors: errs }));
        return false;
      }
      return true;
    }

    // check-in validation
    let valid = true;
    setRoomConfigs(prev => {
      const next = { ...prev };
      selectedRooms.forEach(room => {
        const config = next[room.id];
        if (!config) return;
        const updatedRows = config.guestRows.map((row, idx) => {
          const errs = {};
          if (!row.name?.trim()) errs.name = 'Required';
          if (idx === 0 && !row.number?.trim()) errs.number = 'Required';
          if (!row.selectedCustomerId && !row.identity_card_1) errs.identity_card_1 = 'Required';
          if (Object.keys(errs).length) valid = false;
          return { ...row, errors: errs };
        });
        next[room.id] = { ...config, guestRows: updatedRows };
      });
      return next;
    });

    return valid;
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitting(true);
    const roomResults = [];

    try {
      if (bookingType === 'reservation') {
        // 1. Create/reuse contact customer
        let contactId;
        if (sharedGuest.selectedCustomerId) {
          contactId = sharedGuest.selectedCustomerId;
        } else {
          const fd = new FormData();
          fd.append('name', sharedGuest.name.trim());
          if (sharedGuest.number?.trim()) fd.append('number', sharedGuest.number.trim());
          if (indiaId) fd.append('country_code', parseInt(indiaId));
          if (sharedGuest.gender) fd.append('gender', sharedGuest.gender);
          if (sharedGuest.date_of_birth) fd.append('date_of_birth', dayjs(sharedGuest.date_of_birth).format('YYYY-MM-DD'));
          else if (sharedGuest.age != null) fd.append('age', sharedGuest.age);
          const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          contactId = data.id;
        }
        // 2. Create one group for all rooms
        const { data: gd } = await api.post('/v1/group/customers/', { customers: [contactId] });
        const groupId = gd.group_id;
        // 3. Create one reservation per room
        for (const room of selectedRooms) {
          const config = roomConfigs[room.id];
          try {
            await api.post('/v1/reservations/', {
              room: room.id,
              group: groupId,
              check_in_date: dayjs(ciDate).format('YYYY-MM-DD'),
              check_out_date: dayjs(checkoutDate).format('YYYY-MM-DD'),
              price: config?.price ?? 0,
              advance_amount: 0,
              advance_payment_method: null,
              group_advance_amount: resAdvPaymentAmount || 0,
              group_advance_payment_method: resAdvPaymentAmount > 0 && resAdvPaymentType ? Number(resAdvPaymentType) : null,
            });
            roomResults.push({ roomId: room.id, status: 'success', message: 'Reserved' });
          } catch (e) {
            roomResults.push({ roomId: room.id, status: 'error', message: parseApiError(e, 'Failed') });
          }
        }
      } else {
        // Check-in: per-room customers → group → checkin → advance payment
        const [h, m] = defaultCheckoutTime.split(':').map(Number);
        for (const room of selectedRooms) {
          const config = roomConfigs[room.id];
          if (!config) continue;
          try {
            const createdIds = [];
            for (const row of config.guestRows) {
              if (row.selectedCustomerId) { createdIds.push(row.selectedCustomerId); continue; }
              const card1 = row.identity_card_1 instanceof File ? await compressImage(row.identity_card_1) : null;
              const card2 = row.identity_card_2 instanceof File ? await compressImage(row.identity_card_2) : null;
              const fd = new FormData();
              fd.append('name', row.name.trim());
              if (row.number?.trim()) fd.append('number', row.number.trim());
              if (indiaId) fd.append('country_code', parseInt(indiaId));
              if (row.gender) fd.append('gender', row.gender);
              if (row.date_of_birth) fd.append('date_of_birth', dayjs(row.date_of_birth).format('YYYY-MM-DD'));
              else if (row.age != null) fd.append('age', row.age);
              if (card1) fd.append('identity_card_1', card1);
              if (card2) fd.append('identity_card_2', card2);
              const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
              createdIds.push(data.id);
            }
            const { data: gd } = await api.post('/v1/group/customers/', { customers: createdIds });
            const groupId = gd.group_id;
            const expectedCheckout = dayjs(checkoutDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
            const { data: ci } = await api.post('/v1/checkin/', {
              room: room.id, group: groupId,
              price: config.price, extra_bed: config.extraBed,
              extra_per_bed_price: config.extraPerBedPrice,
              expected_checkout: expectedCheckout,
              gst_applied: gstMode !== 'none', gst_inclusive: gstMode === 'inclusive',
              is_ac: config.isAc,
              male_count: maleCount,
              female_count: femaleCount,
              child_count: childCount,
            });
            if (advPaymentAmount > 0 && ci.log_id) {
              await api.post(`/v1/stay-logs/${ci.log_id}/payments/`, {
                payment_method: Number(advPaymentType), amount: advPaymentAmount,
              }).catch(() => {});
            }
            if (vehicleInputs.length > 0 && ci.log_id) {
              await Promise.all(vehicleInputs.map(v => addStayVehicle(ci.log_id, v).catch(() => {})));
            }
            roomResults.push({ roomId: room.id, status: 'success', message: 'Checked in' });
          } catch (e) {
            roomResults.push({ roomId: room.id, status: 'error', message: parseApiError(e, 'Failed') });
          }
        }
      }
    } catch (e) {
      // Top-level failure (e.g. creating contact customer/group for reservation)
      selectedRooms.forEach(room => {
        if (!roomResults.find(r => r.roomId === room.id))
          roomResults.push({ roomId: room.id, status: 'error', message: parseApiError(e, 'Failed') });
      });
    }

    setResults(roomResults);
    setSubmitting(false);

    const succeeded = roomResults.filter(r => r.status === 'success').length;
    if (succeeded > 0) {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.rooms });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.activeLogs });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reservations });
      notifySuccess(`${succeeded} room${succeeded > 1 ? 's' : ''} ${bookingType === 'checkin' ? 'checked in' : 'reserved'} successfully.`);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setStep(0);
    setSelectedRoomIds(new Set());
    setCiDate(null);
    setCheckoutDate(null);
    setGstMode('added');
    setRoomConfigs({});
    setSharedGuest(createEmptyGuest(indiaId));
    setAdvPaymentType('cash'); setAdvPaymentAmount(0);
    setMaleCount(0); setFemaleCount(0); setChildCount(0);
    setVehicleInputs([]); setVehicleInputText('');
    setResAdvPaymentType('cash'); setResAdvPaymentAmount(0);
    setResults(null);
    navigate('/rooms');
  };

  // ── Step renders ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="xs">Select dates</Text>
        <DatePickerInput
          type="range"
          label="Check-in → Check-out"
          value={[ciDate, checkoutDate]}
          onChange={([start, end]) => {
            let finalEnd = end ?? null;
            if (start && finalEnd && dayjs(start).isSame(dayjs(finalEnd), 'day')) {
              const [h, m] = defaultCheckoutTime.split(':').map(Number);
              const now = dayjs();
              if (now.hour() > h || (now.hour() === h && now.minute() >= m)) {
                finalEnd = dayjs(start).add(1, 'day').toDate();
              }
            }
            setCiDate(start ?? null);
            setCheckoutDate(finalEnd);
            setSelectedRoomIds(new Set());
            setSharedGuest(createEmptyGuest(indiaId));
          }}
          minDate={new Date()}
          allowSingleDateInRange
          required
          size="sm"
        />
        {ciDate && checkoutDate && (
          <Group gap="sm" mt="sm" align="center">
            <Badge
              color={bookingType === 'checkin' ? 'teal' : 'blue'}
              size="md"
              variant="light"
            >
              {bookingType === 'checkin' ? 'Check-In Now' : 'Reserve for Later'}
            </Badge>
            <Text size="xs" c="dimmed">{nights} night{nights !== 1 ? 's' : ''}</Text>
          </Group>
        )}
        {!ciDate && (
          <Text size="xs" c="dimmed" mt={4}>Select check-in date to see available rooms.</Text>
        )}
      </Paper>
      <Text size="sm" c="dimmed">
        {bookingType === 'reservation'
          ? 'All rooms shown — rooms already reserved for these dates are hidden.'
          : bookingType === 'checkin'
          ? 'Only available rooms are shown.'
          : ''}
        {selectedRoomIds.size > 0 && <Text span fw={600} c="teal"> {selectedRoomIds.size} room{selectedRoomIds.size > 1 ? 's' : ''} selected.</Text>}
      </Text>
      {(ciDate && checkoutDate) && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }}>
            {bookableRooms.map(room => {
              const selected = selectedRoomIds.has(room.id);
              const statusCfg = STATUS_COLOR[room.status] ? { color: STATUS_COLOR[room.status], label: room.status.replace('_', ' ') } : null;
              return (
                <Card
                  key={room.id}
                  withBorder
                  style={{
                    borderColor: selected ? 'var(--mantine-color-teal-6)' : undefined,
                    borderWidth: selected ? 2 : 1,
                    cursor: 'pointer',
                    background: selected ? 'var(--mantine-color-teal-0)' : undefined,
                  }}
                  onClick={() => toggleRoom(room.id)}
                  p="sm"
                >
                  <Group justify="space-between" mb={4}>
                    <Text fw={700}>{room.room_number}</Text>
                    {selected
                      ? <ThemeIcon size="xs" color="teal" radius="xl"><IconCheck size={10} /></ThemeIcon>
                      : bookingType === 'reservation' && statusCfg && room.status !== 'available' && (
                        <Badge size="xs" color={statusCfg.color} variant="light">{statusCfg.label}</Badge>
                      )
                    }
                  </Group>
                  <Text size="xs" c="dimmed">{roomTypeMap[room.room_type] ?? '—'}</Text>
                  <Text size="xs" c="dimmed">{room.beds} bed{room.beds !== 1 ? 's' : ''}</Text>
                  <Text size="xs" fw={500} c="teal">₹{room.price}/night</Text>
                  {room.is_ac && <Badge size="xs" color="blue" mt={4}>AC</Badge>}
                </Card>
              );
            })}
          </SimpleGrid>
          {bookableRooms.length === 0 && (
            <Text c="dimmed" ta="center">
              {bookingType === 'reservation' ? 'All rooms are already reserved for these dates.' : 'No available rooms.'}
            </Text>
          )}
        </>
      )}
    </Stack>
  );

  const renderStep2 = () => (
    <Grid gutter="md">
      {/* Left: room configs */}
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Stack gap="sm" mb="md">
          {/* Shared settings */}
          <Paper withBorder p="md" radius="md">
            <Text fw={600} size="sm" mb="sm">Shared Settings</Text>
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, sm: 7 }}>
                <Paper bg="gray.0" p="sm" radius="sm">
                  <Group gap="md" wrap="wrap" align="center">
                    <Stack gap={0}>
                      <Text size="xs" c="dimmed">Check-in</Text>
                      <Text fw={600} size="sm">{ciDate ? dayjs(ciDate).format('DD MMM YYYY') : '—'}</Text>
                    </Stack>
                    <Text c="dimmed">→</Text>
                    <Stack gap={0}>
                      <Text size="xs" c="dimmed">Check-out</Text>
                      <Text fw={600} size="sm">{checkoutDate ? dayjs(checkoutDate).format('DD MMM YYYY') : '—'}</Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed">{nights} night{nights !== 1 ? 's' : ''}</Text>
                      <Badge color={bookingType === 'checkin' ? 'teal' : 'blue'} size="xs" variant="light">
                        {bookingType === 'checkin' ? 'Check-In Now' : 'Reserve for Later'}
                      </Badge>
                    </Stack>
                  </Group>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <Text size="xs" fw={500} mb={4}>GST</Text>
                <SegmentedControl
                  fullWidth
                  value={gstMode}
                  onChange={setGstMode}
                  size="xs"
                  data={[
                    { value: 'none', label: 'None' },
                    { value: 'added', label: `+${gstPercent}%` },
                    { value: 'inclusive', label: `Incl.` },
                  ]}
                />
              </Grid.Col>
            </Grid>
          </Paper>

          {/* Reservation: single contact guest */}
          {bookingType === 'reservation' && (
            <Paper withBorder p="md" radius="md">
              <Text fw={600} size="sm" mb={4}>Contact Guest</Text>
              <Text size="xs" c="dimmed" mb="sm">This person will be linked to all reservations in this bulk booking.</Text>
              <GuestForm
                row={sharedGuest}
                isMain={true}
                showIdCard={false}
                onChange={updateSharedGuest}
                onSelectCustomer={autofillSharedGuest}
              />
            </Paper>
          )}
        </Stack>

        {/* Per-room panels */}
        <Stack gap="md">
          {selectedRooms.map(room => {
              const config = roomConfigs[room.id];
              if (!config) return null;
              const maxGuests = room.beds + config.extraBed;
              const billing = billingPerRoom[room.id];

              return (
                <Paper key={room.id} withBorder p="md" radius="md">
                  {/* Room header */}
                  <Group justify="space-between" mb="sm">
                    <Group gap="xs">
                      <Text fw={700} size="lg">{room.room_number}</Text>
                      <Text size="sm" c="dimmed">{roomTypeMap[room.room_type] ?? ''}</Text>
                      <Badge size="xs" color={room.is_ac ? 'blue' : 'gray'} variant="outline">
                        {room.is_ac ? 'AC' : 'Non-AC'}
                      </Badge>
                      <Badge size="xs" color="teal" variant="light">{room.beds} beds</Badge>
                    </Group>
                    {billing && (
                      <Text size="sm" fw={600} c="teal">₹{billing.total.toLocaleString()}</Text>
                    )}
                  </Group>

                  {/* Stay config */}
                  <Grid gutter="xs" mb="sm">
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput size="xs" label="Price (₹)" min={0}
                        value={config.price} onChange={(v) => updateConfig(room.id, 'price', v)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput size="xs" label="Extra Beds" min={0}
                        value={config.extraBed} onChange={(v) => updateConfig(room.id, 'extraBed', v)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput size="xs" label="Per Extra Bed (₹)" min={0}
                        value={config.extraPerBedPrice} onChange={(v) => updateConfig(room.id, 'extraPerBedPrice', v)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <Text size="xs" fw={500} mb={4}>AC Override</Text>
                      <Switch size="sm" checked={config.isAc ?? false}
                        onChange={(e) => updateConfig(room.id, 'isAc', e.currentTarget.checked)} />
                    </Grid.Col>
                  </Grid>

                  {bookingType === 'checkin' && (
                    <>
                      <Divider mb="sm" label="Guests" labelPosition="left" />
                      <Stack gap="sm">
                        {config.guestRows.map((row, gi) => (
                          <Paper key={row._key} withBorder p="sm" radius="sm" bg="gray.0">
                            <Group justify="space-between" mb="xs">
                              <Text size="xs" fw={600}>{gi === 0 ? 'Main Guest' : `Guest ${gi + 1}`}</Text>
                              {gi > 0 && (
                                <ActionIcon size="xs" color="red" variant="subtle"
                                  onClick={() => removeGuest(room.id, gi)}>
                                  <IconTrash size={12} />
                                </ActionIcon>
                              )}
                            </Group>
                            <GuestForm
                              row={row}
                              isMain={gi === 0}
                              showIdCard={true}
                              onChange={(field, val) => updateGuest(room.id, gi, field, val)}
                              onSelectCustomer={(val) => autofillGuest(room.id, gi, val)}
                            />
                          </Paper>
                        ))}
                        <div>
                          <Button size="xs" variant="subtle" leftSection={<IconUserPlus size={12} />}
                            disabled={config.guestRows.length >= maxGuests}
                            onClick={() => addGuest(room.id)}>
                            Add Guest
                          </Button>
                          {config.guestRows.length >= maxGuests && (
                            <Text size="xs" c="dimmed" mt={2}>Max {maxGuests} guest{maxGuests !== 1 ? 's' : ''} for this room</Text>
                          )}
                        </div>
                      </Stack>
                    </>
                  )}
                </Paper>
              );
          })}
        </Stack>
      </Grid.Col>

      {/* Right: billing summary */}
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card withBorder style={{ position: 'sticky', top: 16 }}>
          <Text fw={700} size="md" mb="sm">Billing Summary</Text>

          {/* Date header */}
          <Paper bg="gray.0" p="sm" radius="sm" mb="sm">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Check-in</Text>
                <Text fw={700} size="sm">{ciDate ? dayjs(ciDate).format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY')}</Text>
              </Stack>
              <Text c="dimmed">→</Text>
              <Stack gap={2} align="flex-end">
                <Text size="xs" c="dimmed">Check-out</Text>
                <Text fw={700} size="sm">{checkoutDate ? dayjs(checkoutDate).format('DD/MM/YYYY') : '—'}</Text>
              </Stack>
            </Group>
          </Paper>

          {selectedRooms.length === 0 ? (
            <Text size="sm" c="dimmed">Select rooms to see estimate.</Text>
          ) : (
            <Stack gap="xs">
              {selectedRooms.map(room => {
                const b = billingPerRoom[room.id];
                if (!b) return null;
                return (
                  <Group key={room.id} justify="space-between">
                    <Text size="sm">Room {room.room_number}</Text>
                    <Text size="sm">₹{b.subtotal.toLocaleString()}</Text>
                  </Group>
                );
              })}

              {gstMode !== 'none' && (
                <Group justify="space-between">
                  <Text size="sm" c={gstMode === 'inclusive' ? 'dimmed' : undefined}>
                    {gstMode === 'inclusive' ? `Incl. GST (${gstPercent}%)` : `+ GST (${gstPercent}%)`}
                  </Text>
                  <Text size="sm" c={gstMode === 'inclusive' ? 'dimmed' : undefined}>
                    ₹{Object.values(billingPerRoom).reduce((s, b) => s + b.gstAmount, 0).toLocaleString()}
                  </Text>
                </Group>
              )}

              <Divider />
              <Group justify="space-between">
                <Text fw={700}>Grand Total</Text>
                <Text fw={700} size="lg" c="teal">₹{grandTotal.toLocaleString()}</Text>
              </Group>

              {bookingType === 'checkin' && (
                <>
                  <Divider mt="xs" label="Occupants" labelPosition="left" />
                  <Group grow>
                    <NumberInput size="sm" label="Male" min={0} value={maleCount} onChange={setMaleCount} />
                    <NumberInput size="sm" label="Female" min={0} value={femaleCount} onChange={setFemaleCount} />
                    <NumberInput size="sm" label="Children" min={0} value={childCount} onChange={setChildCount} />
                  </Group>
                  <Divider mt="xs" label="Vehicles" labelPosition="left" />
                  <Group gap="xs">
                    <TextInput
                      size="sm"
                      placeholder="e.g. DL 01 AB 1234"
                      value={vehicleInputText}
                      onChange={(e) => setVehicleInputText(e.currentTarget.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const v = vehicleInputText.trim();
                          if (v) { setVehicleInputs(prev => [...prev, v]); setVehicleInputText(''); }
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button size="sm" variant="light" onClick={() => {
                      const v = vehicleInputText.trim();
                      if (v) { setVehicleInputs(prev => [...prev, v]); setVehicleInputText(''); }
                    }}>Add</Button>
                  </Group>
                  {vehicleInputs.length > 0 && (
                    <Group gap="xs" wrap="wrap" mt="xs">
                      {vehicleInputs.map((v, i) => (
                        <Badge key={i} variant="light" size="lg" rightSection={
                          <ActionIcon size="xs" color="red" variant="transparent"
                            onClick={() => setVehicleInputs(prev => prev.filter((_, idx) => idx !== i))}>
                            ×
                          </ActionIcon>
                        }>{v}</Badge>
                      ))}
                    </Group>
                  )}
                  <Divider mt="xs" label="Advance Payment" labelPosition="left" />
                  <Select size="sm" label="Payment Method"
                    data={paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
                    value={advPaymentType} onChange={setAdvPaymentType}
                  />
                  <NumberInput size="sm" label="Amount per room (₹)" min={0}
                    value={advPaymentAmount} onChange={setAdvPaymentAmount} placeholder="0 = no advance" />
                </>
              )}
              {bookingType === 'reservation' && (
                <>
                  <Divider mt="xs" label="Advance Payment" labelPosition="left" />
                  <Select size="sm" label="Payment Method"
                    data={paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
                    value={resAdvPaymentType} onChange={setResAdvPaymentType}
                  />
                  <NumberInput size="sm" label="Advance amount (₹)" min={0}
                    value={resAdvPaymentAmount} onChange={setResAdvPaymentAmount} placeholder="0 = no advance" />
                </>
              )}
            </Stack>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );

  const renderStep3 = () => {
    if (results) {
      // Show outcome
      return (
        <Stack gap="md">
          <Text fw={600} size="lg">
            {results.filter(r => r.status === 'success').length} / {results.length} rooms processed
          </Text>
          {results.map(r => {
            const room = rooms.find(rm => rm.id === r.roomId);
            return (
              <Group key={r.roomId} gap="sm">
                <ThemeIcon size="sm" color={r.status === 'success' ? 'teal' : 'red'} radius="xl">
                  {r.status === 'success' ? <IconCheck size={12} /> : <IconX size={12} />}
                </ThemeIcon>
                <Text size="sm" fw={500}>Room {room?.room_number}</Text>
                <Text size="sm" c={r.status === 'error' ? 'red' : 'dimmed'}>{r.message}</Text>
              </Group>
            );
          })}
          <Button mt="md" leftSection={<IconArrowLeft size={14} />} onClick={handleClose}>Back to Rooms</Button>
        </Stack>
      );
    }

    return (
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Review your booking before confirming.
          {bookingType === 'checkin' ? ' Rooms will be checked in immediately.' : ' Reservations will be created for the selected dates.'}
        </Text>
        <Table withBorder withColumnBorders striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Room</Table.Th>
              <Table.Th>Guests</Table.Th>
              <Table.Th>Price/night</Table.Th>
              <Table.Th>Nights</Table.Th>
              <Table.Th>Subtotal</Table.Th>
              {gstMode !== 'none' && <Table.Th>GST</Table.Th>}
              <Table.Th>Total</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selectedRooms.map(room => {
              const config = roomConfigs[room.id];
              const b = billingPerRoom[room.id];
              if (!config || !b) return null;
              return (
                <Table.Tr key={room.id}>
                  <Table.Td fw={600}>{room.room_number}</Table.Td>
                  <Table.Td>{bookingType === 'reservation' ? (sharedGuest.name || '—') : config.guestRows.map(g => g.name || '—').join(', ')}</Table.Td>
                  <Table.Td>₹{b.effectivePrice.toLocaleString()}{config.extraBed > 0 ? ` +${config.extraBed}xEB` : ''}</Table.Td>
                  <Table.Td>{nights}</Table.Td>
                  <Table.Td>₹{b.subtotal.toLocaleString()}</Table.Td>
                  {gstMode !== 'none' && <Table.Td>₹{b.gstAmount.toLocaleString()}</Table.Td>}
                  <Table.Td fw={600}>₹{b.total.toLocaleString()}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={gstMode !== 'none' ? 6 : 5} style={{ textAlign: 'right' }}>
                <Text fw={700}>Grand Total</Text>
              </Table.Td>
              <Table.Td><Text fw={700} c="teal">₹{grandTotal.toLocaleString()}</Text></Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>

        {bookingType === 'checkin' && advPaymentAmount > 0 && (
          <Text size="sm" c="dimmed">
            Advance payment of ₹{advPaymentAmount} ({paymentMethods.find(p => String(p.id) === advPaymentType)?.name ?? '—'}) will be recorded per room.
          </Text>
        )}
      </Stack>
    );
  };

  // ── Navigation ──
  const handleNext = () => {
    if (step === 0) {
      if (!ciDate || !checkoutDate || selectedRoomIds.size < 1) return;
      setStep(1);
    } else if (step === 1) {
      if (validateStep2()) setStep(2);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={handleClose}
            disabled={submitting}
            px="xs"
          >
            Back to Rooms
          </Button>
          <Title order={3}>New Booking</Title>
        </Group>
      </Group>

      <Stepper active={step} size="sm">
        <Stepper.Step label="Select Rooms" description={selectedRoomIds.size > 0 ? `${selectedRoomIds.size} room${selectedRoomIds.size !== 1 ? 's' : ''} selected` : undefined} />
        <Stepper.Step label="Configure" description="Guests & pricing" />
        <Stepper.Step label="Confirm" description={bookingType === 'checkin' ? 'Check-in' : 'Reserve'} />
      </Stepper>

      <Box>
        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
      </Box>

      {!results && (
        <Group justify="space-between">
          <Button variant="default" onClick={step === 0 ? handleClose : handleBack} disabled={submitting}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 2 ? (
            <Button
              onClick={handleNext}
              disabled={step === 0 && (!ciDate || !checkoutDate || selectedRoomIds.size < 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              loading={submitting}
              color={bookingType === 'checkin' ? 'teal' : 'blue'}
              onClick={handleSubmit}
            >
              {bookingType === 'checkin'
                ? `Confirm Check-In (${selectedRooms.length} rooms)`
                : `Create Reservations (${selectedRooms.length} rooms)`}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}
