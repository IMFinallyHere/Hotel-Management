import { useState, useEffect, useMemo } from 'react';
import {
  Select, NumberInput, Button, Card, Group, Stack, Title, Text,
  ThemeIcon, Center, Checkbox, Paper, ActionIcon, Alert, Grid,
  TextInput, FileInput, Divider,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCheck, IconTrash, IconUserPlus, IconUpload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchRooms, fetchActiveLogs, fetchConfigurations, fetchCountryCodes } from '../api/queries';
import { notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import { parseConfigs } from '../utils/configUtils';
import { compressImage } from '../utils/imageUtils';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

function createEmptyGuest(countryCodeId = null) {
  return {
    _key: Date.now() + Math.random(),
    name: '',
    number: '',
    country_code: countryCodeId,
    gender: null,
    date_of_birth: null,
    age: null,
    address: '',
    pincode: '',
    identity_card_1: null,
    identity_card_2: null,
    errors: {},
  };
}

// Defined at module level to avoid re-mounting on each render
function GuestForm({ row, isMain, codes, onChange }) {
  return (
    <Grid gutter="sm">
      {/* Row 1: Full Name | Phone Number */}
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Full Name"
          value={row.name}
          onChange={(e) => onChange('name', e.currentTarget.value)}
          required
          error={row.errors.name}
          onKeyDown={(e) => {
            if (!/^[A-Za-z\s]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Phone Number"
          maxLength={10}
          value={row.number}
          onChange={(e) => onChange('number', e.currentTarget.value)}
          required={isMain}
          error={row.errors.number}
          onKeyDown={(e) => {
            if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>

      {/* Row 2: Gender | Country Code */}
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Select
          label="Gender"
          data={GENDER_OPTIONS}
          value={row.gender}
          onChange={(v) => onChange('gender', v)}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Select
          label="Country Code"
          data={codes.map(c => ({ value: String(c.id), label: `+${c.country_code} ${c.country_name}` }))}
          searchable
          value={row.country_code}
          onChange={(v) => onChange('country_code', v)}
        />
      </Grid.Col>

      {/* Row 3: DOB | Age */}
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <DatePickerInput
          label="Date of Birth"
          value={row.date_of_birth}
          clearable
          onChange={(date) => {
            onChange('date_of_birth', date);
            onChange('age', date ? dayjs().diff(dayjs(date), 'year') : null);
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <NumberInput
          label="Age"
          min={0}
          max={120}
          disabled={!!row.date_of_birth}
          value={row.age ?? ''}
          onChange={(v) => onChange('age', v === '' ? null : v)}
        />
      </Grid.Col>

      {/* Row 4: Identity Card 1 | Identity Card 2 */}
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <FileInput
          label="Identity Card 1"
          leftSection={<IconUpload size={14} />}
          accept=".pdf,.jpg,.jpeg,.png"
          value={row.identity_card_1}
          onChange={(f) => onChange('identity_card_1', f)}
          required
          error={row.errors.identity_card_1}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <FileInput
          label="Identity Card 2"
          leftSection={<IconUpload size={14} />}
          accept=".pdf,.jpg,.jpeg,.png"
          value={row.identity_card_2}
          onChange={(f) => onChange('identity_card_2', f)}
          required
          error={row.errors.identity_card_2}
        />
      </Grid.Col>

      {/* Row 5: Address (full width) */}
      <Grid.Col span={12}>
        <TextInput
          label="Address"
          value={row.address}
          onChange={(e) => onChange('address', e.currentTarget.value)}
        />
      </Grid.Col>

      {/* Row 6: Pincode (full width) */}
      <Grid.Col span={12}>
        <TextInput
          label="Pincode"
          maxLength={6}
          value={row.pincode}
          onChange={(e) => onChange('pincode', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
    </Grid>
  );
}

export default function CheckIn() {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestRows, setGuestRows] = useState([createEmptyGuest()]);
  const [submitError, setSubmitError] = useState(null);

  // Room form state
  const [room, setRoom] = useState(null);
  const [price, setPrice] = useState(0);
  const [extraBed, setExtraBed] = useState(0);
  const [extraPerBedPrice, setExtraPerBedPrice] = useState(0);
  const [checkoutDate, setCheckoutDate] = useState(null);
  const [gstApplied, setGstApplied] = useState(true);
  const [roomError, setRoomError] = useState(null);
  const [checkoutDateError, setCheckoutDateError] = useState(null);

  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });

  const configMap = parseConfigs(configs);
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';
  const gstPercent = configMap['gst_percent'] ?? '0';

  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);

  useEffect(() => {
    if (!indiaId) return;
    setGuestRows(rows => rows.map(r => r.country_code ? r : { ...r, country_code: indiaId }));
  }, [indiaId]);

  const occupiedRoomIds = new Set(activeLogs.map(l => l.room));
  const availableRooms = rooms.filter(r => !occupiedRoomIds.has(r.id));
  const selectedRoom = availableRooms.find(r => String(r.id) === room) ?? null;
  const guestCount = guestRows.length;
  const maxGuests = selectedRoom ? selectedRoom.beds + extraBed : null;
  const guestExceeded = maxGuests !== null && guestCount > maxGuests;

  const nights = checkoutDate ? dayjs(checkoutDate).diff(dayjs().startOf('day'), 'day') : 0;

  const updateGuest = (idx, field, value) => {
    setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addGuest = () => setGuestRows(rows => [...rows, createEmptyGuest(indiaId)]);
  const removeGuest = (idx) => setGuestRows(rows => rows.filter((_, i) => i !== idx));

  const validateGuests = () => {
    let valid = true;
    const updated = guestRows.map((row, idx) => {
      const errs = {};
      if (!row.name?.trim()) errs.name = 'Required';
      if (idx === 0 && !row.number?.trim()) errs.number = 'Required';
      if (!row.identity_card_1) errs.identity_card_1 = 'Required';
      if (!row.identity_card_2) errs.identity_card_2 = 'Required';
      if (Object.keys(errs).length) valid = false;
      return { ...row, errors: errs };
    });
    setGuestRows(updated);
    return valid;
  };

  const handleSubmit = async () => {
    // Validate room section
    let hasRoomError = false;
    if (!room) { setRoomError('Select a room.'); hasRoomError = true; } else setRoomError(null);
    if (!checkoutDate) { setCheckoutDateError('Select a checkout date.'); hasRoomError = true; } else setCheckoutDateError(null);
    if (!validateGuests() || hasRoomError) return;

    if (guestExceeded) {
      notifyError(`Too many guests: ${guestCount} guests but max for this room is ${maxGuests}.`);
      return;
    }

    setLoading(true);
    setSubmitError(null);
    const createdIds = [];

    // Create customers sequentially
    for (let i = 0; i < guestRows.length; i++) {
      const row = guestRows[i];
      try {
        const card1 = row.identity_card_1 instanceof File ? await compressImage(row.identity_card_1) : null;
        const card2 = row.identity_card_2 instanceof File ? await compressImage(row.identity_card_2) : null;
        const fd = new FormData();
        fd.append('name', row.name.trim());
        if (row.number?.trim()) fd.append('number', row.number.trim());
        if (row.country_code) fd.append('country_code', parseInt(row.country_code));
        if (row.gender) fd.append('gender', row.gender);
        if (row.date_of_birth) {
          fd.append('date_of_birth', dayjs(row.date_of_birth).format('YYYY-MM-DD'));
        } else if (row.age !== null && row.age !== undefined) {
          fd.append('age', row.age);
        }
        if (row.address?.trim()) fd.append('address', row.address.trim());
        if (row.pincode?.trim()) fd.append('pincode', row.pincode.trim());
        if (card1) fd.append('identity_card_1', card1);
        if (card2) fd.append('identity_card_2', card2);
        const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        createdIds.push(data.id);
      } catch (e) {
        const label = i === 0 ? 'Main Guest' : `Guest ${i + 1}`;
        setSubmitError(`${label}: ${parseApiError(e, 'Failed to save customer.')}`);
        setLoading(false);
        return;
      }
    }

    // Create group
    let groupId;
    try {
      const { data } = await api.post('/v1/group/customers/', { customers: createdIds });
      groupId = data.group_id;
    } catch (e) {
      setSubmitError(parseApiError(e, 'Failed to create group.'));
      setLoading(false);
      return;
    }

    // Check-in
    try {
      const [h, m] = defaultCheckoutTime.split(':').map(Number);
      const expectedCheckout = dayjs(checkoutDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
      await api.post('/v1/checkin/', {
        room: parseInt(room),
        price,
        extra_bed: extraBed,
        extra_per_bed_price: extraPerBedPrice,
        group: groupId,
        expected_checkout: expectedCheckout,
        gst_applied: gstApplied,
      });
      setDone(true);
    } catch (e) {
      setSubmitError(parseApiError(e, 'Check-in failed.'));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setDone(false);
    setGuestRows([createEmptyGuest(indiaId)]);
    setSubmitError(null);
    setRoom(null);
    setPrice(0);
    setExtraBed(0);
    setExtraPerBedPrice(0);
    setCheckoutDate(null);
    setGstApplied(true);
    setRoomError(null);
    setCheckoutDateError(null);
  };

  if (done) {
    return (
      <Center h={300}>
        <Stack align="center" gap="md">
          <ThemeIcon size={64} radius="xl" color="teal">
            <IconCheck size={36} />
          </ThemeIcon>
          <Title order={3}>Check-In Successful!</Title>
          <Button onClick={reset}>New Check-In</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Card style={{ maxWidth: 900, margin: '0 auto' }} withBorder>

      {/* ── Guest Details ── */}
      <Text fw={700} size="lg" mb="md">Guest Details</Text>

      <Stack gap="md">
        {guestRows.map((row, idx) => (
          <Paper key={row._key} withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>{idx === 0 ? 'Main Guest' : `Guest ${idx + 1}`}</Text>
              {idx > 0 && (
                <ActionIcon color="red" variant="light" onClick={() => removeGuest(idx)} title="Remove guest">
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
            <GuestForm
              row={row}
              isMain={idx === 0}
              codes={codes}
              onChange={(field, val) => updateGuest(idx, field, val)}
            />
          </Paper>
        ))}

        <div>
          <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={addGuest}>
            Add Guest
          </Button>
        </div>
      </Stack>

      <Divider my="lg" />

      {/* ── Room & Stay Details ── */}
      <Text fw={700} size="lg" mb="md">Room & Stay Details</Text>

      <Grid gutter="sm">
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Room"
            data={availableRooms.map(r => ({ value: String(r.id), label: `${r.room_number} — ${r.beds} beds — ₹${r.price}${r.is_ac ? ' (AC)' : ''}` }))}
            value={room}
            onChange={(v) => { setRoom(v); setRoomError(null); }}
            required
            error={roomError}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <NumberInput
            label="Price (₹, leave 0 to auto-resolve)"
            min={0}
            value={price}
            onChange={setPrice}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <NumberInput label="Extra Beds" min={0} value={extraBed} onChange={setExtraBed} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <NumberInput label="Price per Extra Bed (₹)" min={0} value={extraPerBedPrice} onChange={setExtraPerBedPrice} />
        </Grid.Col>
        <Grid.Col span={12}>
          <DatePickerInput
            type="range"
            label="Check-in → Checkout"
            value={[new Date(), checkoutDate]}
            onChange={([, end]) => { setCheckoutDate(end ?? null); setCheckoutDateError(null); }}
            minDate={new Date(new Date().setDate(new Date().getDate() + 1))}
            required
            error={checkoutDateError}
          />
          {checkoutDate && (
            <Text size="xs" c="dimmed" mt={4}>
              Departure: {dayjs(checkoutDate).format('DD MMM YYYY')} at {defaultCheckoutTime} ({nights} night{nights !== 1 ? 's' : ''})
            </Text>
          )}
        </Grid.Col>
        <Grid.Col span={12}>
          <Checkbox
            label={`Apply GST (${gstPercent}%)`}
            checked={gstApplied}
            onChange={(e) => setGstApplied(e.currentTarget.checked)}
          />
        </Grid.Col>
      </Grid>

      {selectedRoom && (
        <Text size="sm" c={guestExceeded ? 'red' : 'dimmed'} mt="sm">
          {guestCount} guest{guestCount !== 1 ? 's' : ''} selected — max for this room is {maxGuests} ({selectedRoom.beds} bed{selectedRoom.beds !== 1 ? 's' : ''}{extraBed > 0 ? ` + ${extraBed} extra` : ''})
        </Text>
      )}

      {submitError && (
        <Alert color="red" title="Error" mt="md">{submitError}</Alert>
      )}

      <Group mt="lg">
        <Button loading={loading} disabled={guestExceeded} onClick={handleSubmit}>
          Confirm Check-In
        </Button>
      </Group>
    </Card>
  );
}
