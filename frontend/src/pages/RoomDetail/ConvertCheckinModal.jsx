import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal, Stack, Grid, Text, Button, Group, Alert, Divider,
  NumberInput, Paper, Center, Loader, Select, ActionIcon,
  TextInput, SegmentedControl, Card,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import {
  QUERY_KEYS, fetchGroupCustomers, fetchConfigurations, fetchCountryCodes,
  searchCustomers, fetchPaymentMethods, fetchPriceChart,
} from '../../api/queries';
import { compressImage } from '../../utils/imageUtils';
import { parseApiError } from '../../api/errorUtils';
import { parseConfigs } from '../../utils/configUtils';
import { notifySuccess, notifyError } from '../../api/notify';
import GuestForm, { createEmptyGuest } from '../../components/GuestForm';

export default function ConvertCheckinModal({ opened, onClose, reservation, room, configMap = {} }) {
  const qc = useQueryClient();
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

  const { data: existingGuests = [], isLoading: guestsLoading } = useQuery({
    queryKey: QUERY_KEYS.groupCustomers(reservation?.group),
    queryFn: () => fetchGroupCustomers(reservation.group),
    enabled: opened && !!reservation?.group,
  });

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const { data: priceChart = [] } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods() });

  const configMap2 = parseConfigs(configs);
  const gstPercent = configMap2['gst_percent'] ?? '0';

  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);

  const ciToday = new Date().toISOString().slice(0, 10);
  const getEffectivePrice = () => {
    if (Number(reservation?.price) > 0) return Number(reservation.price);
    const chartEntry = priceChart.find(e => e.room === room.id && e.date === ciToday);
    return Number(chartEntry?.price ?? room.price ?? 0);
  };

  const [guestRows, setGuestRows] = useState([]);
  const [price, setPrice] = useState(0);
  const [extraBed, setExtraBed] = useState(0);
  const [extraPerBedPrice, setExtraPerBedPrice] = useState(0);
  const [checkoutDate, setCheckoutDate] = useState(null);
  const [gstMode, setGstMode] = useState('added');
  const [isAc, setIsAc] = useState(room.is_ac);
  const [sharedCountryCode, setSharedCountryCode] = useState(null);
  const [sharedAddress, setSharedAddress] = useState('');
  const [sharedPincode, setSharedPincode] = useState('');
  const [advPaymentType, setAdvPaymentType] = useState(null);
  const [advPaymentAmount, setAdvPaymentAmount] = useState(0);
  const [checkoutDateError, setCheckoutDateError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const debounceTimers = useRef({});

  useEffect(() => {
    if (!opened) return;
    setPrice(getEffectivePrice());
    setCheckoutDate(reservation?.check_out_date ? new Date(reservation.check_out_date) : null);
    setIsAc(room.is_ac);
    setSharedCountryCode(indiaId);
    setGstMode('added');
    setExtraBed(0);
    setExtraPerBedPrice(0);
    setAdvPaymentAmount(0);
    setAdvPaymentType(null);
    setSubmitError(null);
    setCheckoutDateError(null);
  }, [opened, reservation, indiaId]);

  useEffect(() => {
    if (!opened || guestsLoading) return;
    if (existingGuests.length > 0) {
      setGuestRows(existingGuests.map((g) => ({
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
        searchResults: [],
        searchLoading: false,
        selectedCustomerId: g.id,
      })));
    } else {
      setGuestRows([createEmptyGuest()]);
    }
  }, [existingGuests, opened, guestsLoading]);

  const updateGuest = (idx, field, value) => {
    setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    if (field === 'number') {
      clearTimeout(debounceTimers.current[idx]);
      if (value.length >= 3) {
        debounceTimers.current[idx] = setTimeout(async () => {
          setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchLoading: true } : r));
          const results = await searchCustomers(value).catch(() => []);
          setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchResults: results, searchLoading: false } : r));
        }, 350);
      } else {
        setGuestRows(rows => rows.map((r, i) => i === idx ? { ...r, searchResults: [], selectedCustomerId: null } : r));
      }
    }
  };

  const autofillGuest = (idx, customerId) => {
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
      if (!row.selectedCustomerId && !row.id && !row.identity_card_1) errs.identity_card_1 = 'Required';
      if (Object.keys(errs).length) hasErrors = true;
      return { ...row, errors: errs };
    });
    setGuestRows(updatedRows);
    if (hasErrors) return;

    setSubmitLoading(true);
    setSubmitError(null);

    const newCustomerIds = [];

    for (let i = 0; i < guestRows.length; i++) {
      const row = guestRows[i];
      if (row.id) {
        // Existing guest — patch to update info
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
          await api.patch(`/v1/customers/${row.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (e) {
          const label = i === 0 ? 'Main Guest' : `Guest ${i + 1}`;
          setSubmitError(`${label}: ${parseApiError(e, 'Failed to save customer.')}`);
          setSubmitLoading(false);
          return;
        }
      } else if (row.selectedCustomerId) {
        newCustomerIds.push(row.selectedCustomerId);
      } else {
        // New guest — create and collect ID
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
          newCustomerIds.push(data.id);
        } catch (e) {
          const label = i === 0 ? 'Main Guest' : `Guest ${i + 1}`;
          setSubmitError(`${label}: ${parseApiError(e, 'Failed to save customer.')}`);
          setSubmitLoading(false);
          return;
        }
      }
    }

    // Add any new customers to the existing group
    if (newCustomerIds.length > 0) {
      try {
        await api.post(`/v1/group/${reservation.group}/customers/add/`, { customers: newCustomerIds });
      } catch (e) {
        setSubmitError(parseApiError(e, 'Failed to add new guests to group.'));
        setSubmitLoading(false);
        return;
      }
    }

    try {
      const [h, m] = defaultCheckoutTime.split(':').map(Number);
      const expectedCheckout = dayjs(checkoutDate).hour(h).minute(m).second(0).format('YYYY-MM-DDTHH:mm:ss');
      const { data: checkinData } = await api.post('/v1/checkin/', {
        room: room.id,
        group: reservation.group,
        price,
        extra_bed: extraBed,
        extra_per_bed_price: extraPerBedPrice,
        expected_checkout: expectedCheckout,
        gst_applied: gstMode !== 'none',
        gst_inclusive: gstMode === 'inclusive',
        is_ac: isAc,
      });

      if (advPaymentAmount > 0 && checkinData.log_id) {
        try {
          await api.post(`/v1/stay-logs/${checkinData.log_id}/payments/`, {
            payment_method: Number(advPaymentType),
            amount: advPaymentAmount,
          });
        } catch {
          notifyError('Check-in done, but advance payment failed — add it manually.');
        }
      }

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

  const ciNights = checkoutDate ? Math.max(1, dayjs(checkoutDate).diff(dayjs().startOf('day'), 'day')) : 0;
  const ciPerNight = Number(price) + extraBed * Number(extraPerBedPrice);
  const ciRoomSubtotal = ciPerNight * ciNights;
  const ciGstRate = parseFloat(gstPercent) / 100;
  const ciGstAmount = gstMode === 'added'
    ? Math.round(ciRoomSubtotal * ciGstRate)
    : gstMode === 'inclusive'
      ? Math.round(ciRoomSubtotal * ciGstRate / (1 + ciGstRate))
      : 0;
  const ciEstimatedTotal = gstMode === 'added' ? ciRoomSubtotal + ciGstAmount : ciRoomSubtotal;

  return (
    <Modal opened={opened} onClose={handleClose} title="Convert Reservation to Check-In" size="90%">
      {guestsLoading ? (
        <Center h={100}><Loader /></Center>
      ) : (
        <Grid gutter="md">
          {/* Left: form */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="md">
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
                    onChange={(d) => {
                      let finalDate = d;
                      if (finalDate && dayjs(finalDate).isSame(dayjs(), 'day')) {
                        const [h, m] = defaultCheckoutTime.split(':').map(Number);
                        const now = dayjs();
                        if (now.hour() > h || (now.hour() === h && now.minute() >= m)) {
                          finalDate = dayjs().add(1, 'day').toDate();
                        }
                      }
                      setCheckoutDate(finalDate);
                      setCheckoutDateError(null);
                    }}
                    minDate={new Date()}
                    required
                    error={checkoutDateError}
                  />
                  {checkoutDate && (
                    <Text size="xs" c="dimmed" mt={4}>
                      {dayjs(checkoutDate).format('DD MMM YYYY')} at {defaultCheckoutTime} ({ciNights} night{ciNights !== 1 ? 's' : ''})
                    </Text>
                  )}
                </Grid.Col>
                <Grid.Col span={12}>
                  <Text size="sm" fw={500} mb={6}>GST</Text>
                  <SegmentedControl
                    value={gstMode}
                    onChange={setGstMode}
                    data={[
                      { value: 'none', label: 'No GST' },
                      { value: 'added', label: `Add GST (${gstPercent}%)` },
                      { value: 'inclusive', label: `GST Incl. (${gstPercent}%)` },
                    ]}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Text size="sm" fw={500} mb={6}>AC Room</Text>
                  <SegmentedControl
                    value={isAc ? 'yes' : 'no'}
                    onChange={(v) => setIsAc(v === 'yes')}
                    data={[{ value: 'no', label: 'Non-AC' }, { value: 'yes', label: 'AC' }]}
                  />
                </Grid.Col>
              </Grid>

              <Divider />

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
                      onChange={(field, val) => updateGuest(idx, field, val)}
                      onSelectCustomer={(val) => autofillGuest(idx, val)}
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
          </Grid.Col>

          {/* Right: billing summary + advance payment */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder>
              <Text fw={700} size="lg" mb="sm">Billing Summary</Text>

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
                      {checkoutDate ? dayjs(checkoutDate).format('DD/MM/YYYY') : '—'}
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
                  <Text size="sm">₹{Number(price).toLocaleString()}</Text>
                </Group>
                {extraBed > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">{extraBed} extra bed{extraBed > 1 ? 's' : ''} × ₹{extraPerBedPrice}</Text>
                    <Text size="sm">₹{(extraBed * Number(extraPerBedPrice)).toLocaleString()}</Text>
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
                {gstMode !== 'none' && ciGstAmount > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c={gstMode === 'inclusive' ? 'dimmed' : undefined}>
                      {gstMode === 'inclusive' ? `Incl. GST (${gstPercent}%)` : `+ GST (${gstPercent}%)`}
                    </Text>
                    <Text size="sm" c={gstMode === 'inclusive' ? 'dimmed' : undefined}>
                      ₹{Number(ciGstAmount).toLocaleString()}
                    </Text>
                  </Group>
                )}
                <Divider />
                <Group justify="space-between">
                  <Text fw={700}>Estimated Total</Text>
                  <Text fw={700} size="lg">₹{Number(ciEstimatedTotal).toLocaleString()}</Text>
                </Group>
                {Number(reservation?.advance_amount) > 0 && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Already Paid{reservation.advance_payment_method_name ? ` (${reservation.advance_payment_method_name})` : ''}
                      </Text>
                      <Text size="sm" c="green">− ₹{Number(reservation.advance_amount).toLocaleString()}</Text>
                    </Group>
                    <Divider />
                    <Group justify="space-between">
                      <Text fw={700}>Balance Due</Text>
                      <Text fw={700} size="lg" c="teal">
                        ₹{Math.max(0, ciEstimatedTotal - Number(reservation.advance_amount)).toLocaleString()}
                      </Text>
                    </Group>
                  </>
                )}
                {Number(reservation?.advance_amount) === 0 && (
                  <Group justify="space-between">
                    <Text fw={700}>Balance Due</Text>
                    <Text fw={700} size="lg" c="teal">₹{Number(ciEstimatedTotal).toLocaleString()}</Text>
                  </Group>
                )}
              </Stack>

              <Divider my="md" />

              <Text fw={600} size="sm" mb="xs">New Advance at Check-In</Text>
              <Stack gap="xs">
                <Select
                  label="Payment Type"
                  data={paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
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
                  placeholder="0 = no additional advance"
                />
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </Modal>
  );
}
