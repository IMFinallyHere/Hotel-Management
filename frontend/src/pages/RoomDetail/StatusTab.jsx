import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card, Button, Badge, Stack, Group, Text, Loader,
  NumberInput, TextInput, Select, Modal, Alert, ActionIcon, Textarea, SegmentedControl,
  Grid, Paper, Divider, Switch, Table, Checkbox, Anchor, Tooltip, FileInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconPackage, IconTrash, IconBan, IconUserPlus, IconInfoCircle, IconToolsKitchen2, IconEye, IconPaperclip,
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import {
  QUERY_KEYS, QUERY_KEYS_OPS,
  fetchGroupCustomers, fetchConfigurations, fetchCountryCodes, fetchAmenities, fetchPriceChart, searchCustomers, fetchPaymentMethods,
  addStayVehicle, deleteStayVehicle,
  addFoodOrder, updateFoodOrder, deleteFoodOrder, addFoodOrderReceipt, deleteFoodOrderReceipt,
} from '../../api/queries';
import { compressImage } from '../../utils/imageUtils';
import CustomerSelectWithAdd from '../../components/CustomerSelectWithAdd';
import { CustomerTable } from '../../components/CustomerTable';
import GuestForm, { createEmptyGuest } from '../../components/GuestForm';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';
import { parseConfigs, isLogOvertime, computeOvertimeFee, computeGst } from '../../utils/configUtils';

function DescRow({ label, value, highlight }) {
  return (
    <Group justify="space-between" py={4}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        background: highlight ? 'var(--mantine-color-orange-0)' : undefined,
        borderRadius: highlight ? 4 : undefined,
        paddingLeft: highlight ? 6 : undefined,
        paddingRight: highlight ? 6 : undefined,
      }}>
      <Text size="sm" c={highlight ? 'orange.7' : 'dimmed'} fw={highlight ? 600 : undefined}>{label}</Text>
      <Text size="sm" fw={highlight ? 700 : 500} c={highlight ? 'orange.7' : undefined}>{value}</Text>
    </Group>
  );
}

export default function StatusTab({ room, activeLogs, isReservedToday }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [bedsOpened, { open: openBeds, close: closeBeds }] = useDisclosure(false);
  const [addGuestOpened, { open: openAddGuest, close: closeAddGuest }] = useDisclosure(false);
  const [amenityOpened, { open: openAmenity, close: closeAmenity }] = useDisclosure(false);
  const [newAmenityId, setNewAmenityId] = useState(null);
  const [newAmenityQty, setNewAmenityQty] = useState(1);

  const [ncOpened, { open: openNc, close: closeNc }] = useDisclosure(false);
  const [ncReason, setNcReason] = useState('');

  const [extendOpened, { open: openExtend, close: closeExtend }] = useDisclosure(false);
  const [extendDate, setExtendDate] = useState(null);

  const [graceOpened, { open: openGrace, close: closeGrace }] = useDisclosure(false);
  const [graceHours, setGraceHours] = useState('1');

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);
  const defaultCheckoutTime = configMap['default_checkout_time'] ?? '11:00';

  const [guestRows, setGuestRows] = useState([createEmptyGuest()]);
  const ciToday = new Date().toISOString().slice(0, 10);
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
  const [advPaymentType, setAdvPaymentType] = useState(null);
  const [advPaymentAmount, setAdvPaymentAmount] = useState(0);
  const [maleCount, setMaleCount] = useState(0);
  const [femaleCount, setFemaleCount] = useState(0);
  const [childCount, setChildCount] = useState(0);
  const [vehicleInputs, setVehicleInputs] = useState([]);
  const [vehicleInputText, setVehicleInputText] = useState('');
  const ciDebounceTimers = useRef({});

  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const { data: priceChart = [] } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });

  const getEffectivePrice = () => {
    const chartEntry = priceChart.find(e => e.room === room.id && e.date === ciToday);
    return Number(chartEntry?.price ?? room.price ?? 0);
  };

  useEffect(() => {
    setCheckinPrice(getEffectivePrice());
  }, [priceChart, room.id]);

  const indiaId = useMemo(() => {
    const india = codes.find(c => c.country_code === 91);
    return india ? String(india.id) : null;
  }, [codes]);
  useEffect(() => {
    if (!indiaId) return;
    setSharedCountryCode(prev => prev || indiaId);
  }, [indiaId]);

  const activeLog = activeLogs.find(l => l.room === room.id && l.check_out === null) ?? null;

  const resetCheckinForm = () => {
    setGuestRows([createEmptyGuest()]);
    setCheckinPrice(getEffectivePrice());
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
    setMaleCount(0);
    setFemaleCount(0);
    setChildCount(0);
    setVehicleInputs([]);
    setVehicleInputText('');
  };

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

  // Edit beds form
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

  const { data: allAmenities = [] } = useQuery({ queryKey: QUERY_KEYS.amenities, queryFn: fetchAmenities });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods() });

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
        male_count: maleCount,
        female_count: femaleCount,
        child_count: childCount,
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

      if (vehicleInputs.length > 0 && checkinData.log_id) {
        await Promise.all(vehicleInputs.map(v => addStayVehicle(checkinData.log_id, v).catch(() => {})));
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

  const graceMutation = useMutation({
    mutationFn: ({ logId, hours }) => api.post(`/v1/stay-logs/${logId}/grace/`, { hours }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      closeGrace();
      notifySuccess('Grace period granted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to grant grace period.')),
  });

  const [newVehicleText, setNewVehicleText] = useState('');

  // Food orders state
  const [foodOpened, { open: openFood, close: closeFood }] = useDisclosure(false);
  const [foodDesc, setFoodDesc] = useState('');
  const [foodAmount, setFoodAmount] = useState(0);
  const [foodGstInclusive, setFoodGstInclusive] = useState(true);
  const [foodPaidNow, setFoodPaidNow] = useState(false);
  const [foodPaymentMethod, setFoodPaymentMethod] = useState(null);
  const [foodFiles, setFoodFiles] = useState([]);
  const [foodError, setFoodError] = useState(null);
  const [foodSubmitting, setFoodSubmitting] = useState(false);
  // Mark-paid inline state: orderId → paymentMethod select value
  const [markPaidMethod, setMarkPaidMethod] = useState({});

  const addVehicleMutation = useMutation({
    mutationFn: ({ logId, vehicleNumber }) => addStayVehicle(logId, vehicleNumber),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      setNewVehicleText('');
      notifySuccess('Vehicle added.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to add vehicle.')),
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (vehicleId) => deleteStayVehicle(vehicleId),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      notifySuccess('Vehicle removed.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to remove vehicle.')),
  });

  const deleteFoodOrderMutation = useMutation({
    mutationFn: (id) => deleteFoodOrder(id),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.activeLogs); notifySuccess('Food order removed.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to remove food order.')),
  });

  const markFoodPaidMutation = useMutation({
    mutationFn: ({ id, payment_method }) => updateFoodOrder(id, { is_paid: true, payment_method }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      setMarkPaidMethod({});
      notifySuccess('Food order marked as paid.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to mark paid.')),
  });

  const handleAddFoodOrder = async () => {
    if (!foodDesc.trim()) { setFoodError('Description is required.'); return; }
    if (!foodAmount) { setFoodError('Amount is required.'); return; }
    setFoodError(null);
    setFoodSubmitting(true);
    try {
      const order = await addFoodOrder(activeLog?.id, {
        description: foodDesc.trim(),
        amount: foodAmount,
        food_gst_inclusive: foodGstInclusive,
        is_paid: foodPaidNow,
        payment_method: foodPaidNow && foodPaymentMethod ? Number(foodPaymentMethod) : null,
      });
      if (foodFiles.length > 0) {
        const processed = await Promise.all(foodFiles.map(f =>
          f.type.startsWith('image/') ? compressImage(f) : Promise.resolve(f)
        ));
        await addFoodOrderReceipt(order.id, processed).catch(() => {
          notifyError('Order saved but receipt upload failed.');
        });
      }
      qc.invalidateQueries(QUERY_KEYS.activeLogs);
      closeFood();
      setFoodDesc(''); setFoodAmount(0); setFoodGstInclusive(true); setFoodPaidNow(false); setFoodPaymentMethod(null); setFoodFiles([]);
      notifySuccess('Food order added.');
    } catch (e) {
      setFoodError(parseApiError(e, 'Failed to add food order.'));
    } finally {
      setFoodSubmitting(false);
    }
  };

  // ── Occupied view ──
  if (activeLog) {
    const nights = Math.max(1, dayjs().diff(dayjs(activeLog.check_in), 'day'));
    const roomCost = (Number(activeLog.price) + activeLog.extra_bed * Number(activeLog.extra_per_bed_price)) * nights;
    const logAmenities = activeLog.amenities || [];
    const amenityCost = logAmenities.reduce((sum, a) =>
      sum + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const overtimeFee = computeOvertimeFee(activeLog);
    const gstAmount = computeGst(activeLog, nights, configMap['gst_percent']);
    const totalCost = activeLog.is_nc ? 0 : (activeLog.gst_inclusive ? (roomCost + amenityCost + overtimeFee) : (roomCost + amenityCost + overtimeFee + gstAmount));
    const foodOrders = activeLog.food_orders || [];
    const gstPct = Number(configMap['gst_percent'] ?? 0) / 100;
    const foodEffective = (o) => Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct));
    const totalFood = foodOrders.reduce((s, o) => s + foodEffective(o), 0);
    const foodGst = foodOrders.filter(o => !o.food_gst_inclusive).reduce((s, o) => s + Math.round(Number(o.amount) * gstPct), 0);
    const paidFood = foodOrders.filter(o => o.is_paid).reduce((s, o) => s + foodEffective(o), 0);
    const unpaidFood = totalFood - paidFood;
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
        <Group align="flex-start" gap="xl" wrap="wrap">
          <Stack gap={0} style={{ minWidth: 300, flex: '0 1 400px' }}>
            {(() => {
              const totalPaid = (activeLog.payments || []).reduce((s, p) => s + Number(p.amount), 0);
              const balanceDue = totalCost + unpaidFood - totalPaid;
              return (
                <>
                  <DescRow label="Check-In" value={dayjs(activeLog.check_in).format('DD MMM YYYY, hh:mm A')} />
                  <DescRow label="Expected Checkout"
                    value={activeLog.expected_checkout
                      ? dayjs(activeLog.expected_checkout).format('DD MMM YYYY, hh:mm A') : '—'} />
                  <DescRow label="Nights" value={nights} />
                  <DescRow label="Extra Beds" value={activeLog.extra_bed} />
                  {activeLog.extra_bed > 0 && (
                    <DescRow label="Price/Extra Bed" value={`₹${activeLog.extra_per_bed_price}`} />
                  )}
                  <DescRow label="Price" value={`₹${activeLog.price}`} />
                  {amenityCost > 0 && (
                    <DescRow label="Amenities" value={`₹${amenityCost}`} />
                  )}
                  {overtime && (
                    <DescRow label="Overtime Fee" value={`₹${overtimeFee}`} />
                  )}
                  {gstAmount > 0 && (
                    <DescRow label={`GST (${configMap['gst_percent']}%)${activeLog.gst_inclusive ? ' (incl.)' : ''}`} value={`₹${gstAmount}`} />
                  )}
                  <DescRow label="Total Cost" value={`₹${totalCost}`} />
                  <DescRow label="Advance Paid" value={`₹${totalPaid}`} />
                  {totalFood > 0 && (
                    <DescRow label="Food Orders" value={`₹${totalFood}`} />
                  )}
                  {foodGst > 0 && (
                    <DescRow label={`Food GST (${configMap['gst_percent']}%)`} value={`₹${foodGst}`} />
                  )}
                  {paidFood > 0 && (
                    <DescRow label="Food Paid" value={`₹${paidFood}`} />
                  )}
                  <DescRow label="Balance Due" value={`₹${Math.max(0, balanceDue)}`} highlight={balanceDue > 0} />
                  {(activeLog.male_count > 0 || activeLog.female_count > 0 || activeLog.child_count > 0) && (
                    <DescRow label="Occupants" value={[
                      activeLog.male_count > 0 ? `${activeLog.male_count}M` : null,
                      activeLog.female_count > 0 ? `${activeLog.female_count}F` : null,
                      activeLog.child_count > 0 ? `${activeLog.child_count}C` : null,
                    ].filter(Boolean).join(' · ')} />
                  )}
                </>
              );
            })()}
          </Stack>

          <Stack gap="xs" style={{ minWidth: 200 }}>
            <Table withTableBorder withColumnBorders style={{ minWidth: 220 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 36 }}>#</Table.Th>
                  <Table.Th>
                    <Group gap="xs" wrap="nowrap">
                      <TextInput
                        placeholder="e.g. DL 01 AB 1234"
                        value={newVehicleText}
                        size="xs"
                        style={{ flex: 1 }}
                        onChange={(e) => setNewVehicleText(e.currentTarget.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const v = newVehicleText.trim();
                            if (v) addVehicleMutation.mutate({ logId: activeLog.id, vehicleNumber: v });
                          }
                        }}
                      />
                      <Button size="xs" variant="light"
                        loading={addVehicleMutation.isPending}
                        onClick={() => {
                          const v = newVehicleText.trim();
                          if (v) addVehicleMutation.mutate({ logId: activeLog.id, vehicleNumber: v });
                        }}>
                        Add
                      </Button>
                    </Group>
                  </Table.Th>
                  <Table.Th style={{ width: 36 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(activeLog.vehicles || []).length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text size="xs" c="dimmed" ta="center">No vehicles</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (activeLog.vehicles || []).map((v, i) => (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{i + 1}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{v.vehicle_number}</Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon size="sm" color="red" variant="light"
                        loading={deleteVehicleMutation.isPending}
                        onClick={() => deleteVehicleMutation.mutate(v.id)}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Group>
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
          <Button size="xs" variant="light" color="orange" leftSection={<IconToolsKitchen2 size={14} />}
            onClick={() => {
              const existing = activeLog.food_orders || [];
              setFoodDesc(''); setFoodAmount(0);
              setFoodGstInclusive(existing.length > 0 ? existing[0].food_gst_inclusive : true);
              setFoodPaidNow(false); setFoodPaymentMethod(null); setFoodFiles([]); setFoodError(null); openFood();
            }}>
            Add Food
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
        {foodOrders.length > 0 && (
          <div>
            <Text size="sm" fw={500} mb="xs">Food Orders:</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 32 }}>#</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th style={{ width: 80 }}>Amount</Table.Th>
                  <Table.Th style={{ width: 90 }}>Status</Table.Th>
                  <Table.Th style={{ width: 80 }}>Receipts</Table.Th>
                  <Table.Th style={{ width: 180 }}>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {foodOrders.map((o, i) => (
                  <Table.Tr key={o.id}>
                    <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                    <Table.Td><Text size="sm">{o.description}</Text></Table.Td>
                    <Table.Td><Text size="sm">₹{o.amount}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={o.is_paid ? 'teal' : 'orange'} variant="light" size="sm">
                        {o.is_paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {o.receipts && o.receipts.length > 0 ? (
                        <Group gap={4}>
                          {o.receipts.map((r, ri) => (
                            <Tooltip key={r.id} label={r.file.split('/').pop()}>
                              <Anchor href={r.file} target="_blank" rel="noopener noreferrer">
                                <ActionIcon size="sm" variant="light" color="blue">
                                  <IconEye size={12} />
                                </ActionIcon>
                              </Anchor>
                            </Tooltip>
                          ))}
                          <Badge size="xs" variant="light" color="gray" leftSection={<IconPaperclip size={9} />}>
                            {o.receipts.length}
                          </Badge>
                        </Group>
                      ) : <Text size="xs" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {!o.is_paid ? (
                        <Group gap="xs" wrap="nowrap">
                          <Select
                            size="xs"
                            placeholder="Method"
                            data={paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
                            value={markPaidMethod[o.id] || null}
                            onChange={(v) => setMarkPaidMethod(prev => ({ ...prev, [o.id]: v }))}
                            style={{ width: 100 }}
                          />
                          <Button size="xs" variant="light" color="teal"
                            disabled={!markPaidMethod[o.id]}
                            loading={markFoodPaidMutation.isPending}
                            onClick={() => markFoodPaidMutation.mutate({ id: o.id, payment_method: Number(markPaidMethod[o.id]) })}>
                            Mark Paid
                          </Button>
                          <ActionIcon size="sm" color="red" variant="light"
                            loading={deleteFoodOrderMutation.isPending}
                            onClick={() => deleteFoodOrderMutation.mutate(o.id)}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Group>
                      ) : (
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">{o.payment_method_name || '—'}</Text>
                          <ActionIcon size="sm" color="red" variant="light"
                            loading={deleteFoodOrderMutation.isPending}
                            onClick={() => deleteFoodOrderMutation.mutate(o.id)}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}

        <div>
          <Text size="sm" fw={500} mb="xs">Guests:</Text>
          <CustomerTable groupId={activeLog.group} allowRemove />
        </div>

        {/* Food Order Modal */}
        <Modal opened={foodOpened} onClose={closeFood} title="Add Food Order">
          <Stack gap="sm">
            <TextInput
              label="Description" placeholder="e.g. Breakfast x2, Room Service"
              required value={foodDesc} onChange={(e) => setFoodDesc(e.currentTarget.value)}
            />
            <NumberInput
              label="Amount (₹)" min={1} required value={foodAmount} onChange={setFoodAmount}
            />
            <SegmentedControl
              value={foodGstInclusive ? 'inclusive' : 'exclusive'}
              onChange={(v) => setFoodGstInclusive(v === 'inclusive')}
              data={[
                { label: 'GST Inclusive', value: 'inclusive' },
                { label: 'GST Exclusive', value: 'exclusive' },
              ]}
              fullWidth
              disabled={(activeLog.food_orders || []).length > 0}
            />
            {(activeLog.food_orders || []).length > 0 && (
              <Text size="xs" c="dimmed">GST mode is locked by the first food order for this stay.</Text>
            )}
            {!foodGstInclusive && foodAmount > 0 && (
              <Text size="xs" c="teal">
                + GST ({configMap['gst_percent']}%) = ₹{Math.round(foodAmount * Number(configMap['gst_percent'] ?? 0) / 100)} → Total ₹{foodAmount + Math.round(foodAmount * Number(configMap['gst_percent'] ?? 0) / 100)}
              </Text>
            )}
            <Checkbox
              label="Paid now"
              checked={foodPaidNow}
              onChange={(e) => setFoodPaidNow(e.currentTarget.checked)}
            />
            {foodPaidNow && (
              <Select
                label="Payment Method"
                required
                data={paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }))}
                value={foodPaymentMethod}
                onChange={setFoodPaymentMethod}
              />
            )}
            <FileInput
              label="Attach Receipts (optional)"
              placeholder="PDF or image files"
              multiple
              accept="application/pdf,image/*"
              value={foodFiles}
              onChange={setFoodFiles}
            />
            {foodError && <Alert color="red">{foodError}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeFood}>Cancel</Button>
              <Button loading={foodSubmitting} onClick={handleAddFoodOrder}>Save</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Edit Beds Modal */}
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

        {/* Add Guest Modal */}
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

  // ── Available / Reserved: idle ──
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

  // ── Inline check-in form ──
  const ciNights = checkinCheckoutDate ? Math.max(1, dayjs(checkinCheckoutDate).diff(dayjs().startOf('day'), 'day')) : 0;
  const ciMaxAllowed = room.beds + checkinExtraBed;
  const ciGuestExceeded = guestRows.length > ciMaxAllowed;
  const gstPercent = configMap['gst_percent'] ?? '0';

  const ciEffectivePrice = checkinPrice;
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

          <Text fw={500} size="sm" mb="sm">Room & Stay Details</Text>
          <Grid gutter="sm" mb="md">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput label="Price (₹)" min={0} value={checkinPrice} onChange={setCheckinPrice} />
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
                onChange={([, end]) => {
                  let finalEnd = end ?? null;
                  if (finalEnd && dayjs(finalEnd).isSame(dayjs(), 'day')) {
                    const [h, m] = defaultCheckoutTime.split(':').map(Number);
                    const now = dayjs();
                    if (now.hour() > h || (now.hour() === h && now.minute() >= m)) {
                      finalEnd = dayjs().add(1, 'day').toDate();
                    }
                  }
                  setCheckinCheckoutDate(finalEnd);
                  setCheckinDateError(null);
                }}
                minDate={new Date()}
                allowSingleDateInRange
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
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={6}>Occupants</Text>
              <Grid gutter="sm">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput label="Male" min={0} value={maleCount} onChange={setMaleCount} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput label="Female" min={0} value={femaleCount} onChange={setFemaleCount} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput label="Children" min={0} value={childCount} onChange={setChildCount} />
                </Grid.Col>
              </Grid>
            </Grid.Col>
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={6}>Vehicles</Text>
              <Group gap="xs" mb="xs">
                <TextInput
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
                  size="sm"
                />
                <Button size="sm" variant="light" onClick={() => {
                  const v = vehicleInputText.trim();
                  if (v) { setVehicleInputs(prev => [...prev, v]); setVehicleInputText(''); }
                }}>Add</Button>
              </Group>
              {vehicleInputs.length > 0 && (
                <Group gap="xs" wrap="wrap">
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
            </Grid.Col>
          </Grid>

          <Divider mb="md" />

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
              placeholder="0 = no advance"
            />
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
