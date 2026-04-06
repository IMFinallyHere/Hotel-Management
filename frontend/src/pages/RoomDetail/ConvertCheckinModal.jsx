import { useState, useEffect, useMemo } from 'react';
import {
  Modal, Stack, Grid, Text, Button, Group, Alert, Divider,
  NumberInput, Paper, Switch, Center, Loader, Checkbox,
  Select, ActionIcon, TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { QUERY_KEYS, fetchGroupCustomers, fetchConfigurations, fetchCountryCodes } from '../../api/queries';
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
