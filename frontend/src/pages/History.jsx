import { useState } from 'react';
import {
  Table, Button, Badge, Group, TextInput, Text, Stack, Skeleton,
  Modal, Divider, SimpleGrid, Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { DatePickerInput } from '@mantine/dates';
import { pdf } from '@react-pdf/renderer';
import { IconSearch, IconFileText, IconEye, IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { QUERY_KEYS_OPS, QUERY_KEYS, fetchStayHistory, fetchConfigurations, fetchRoomTypes, fetchRooms } from '../api/queries';
import { parseConfigs, computeGst } from '../utils/configUtils';
import InvoiceDocument from '../components/InvoiceDocument';

const genderLabel = { male: 'M', female: 'F', trans: 'T', other: 'O' };

function SectionHeader({ children }) {
  return (
    <Divider mt="md" mb="xs" label={<Text size="xs" fw={700} tt="uppercase" c="dimmed">{children}</Text>} labelPosition="left" />
  );
}

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Group justify="space-between" py={2} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="xs" fw={500}>{value}</Text>
    </Group>
  );
}

function BillingRow({ label, value, highlight, sub }) {
  return (
    <Group justify="space-between" py={2}
      style={{ borderBottom: sub ? undefined : '1px solid var(--mantine-color-gray-1)' }}
    >
      <Text size="xs" c={sub ? 'orange.6' : 'dimmed'} pl={sub ? 12 : 0}>{label}</Text>
      <Text size="xs" fw={highlight ? 700 : 500} c={sub ? 'orange.6' : undefined}>{value}</Text>
    </Group>
  );
}

function StayDetailModal({ log, opened, onClose, configMap, roomMap, roomTypeMap }) {
  if (!log) return null;

  const nights = log.check_out
    ? Math.max(1, dayjs(log.check_out).diff(dayjs(log.check_in), 'day'))
    : 1;
  const gstPct = Number(configMap['gst_percent'] ?? 0) / 100;
  const roomTotal = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
  const amenityTotal = (log.amenities || []).reduce((sum, a) =>
    sum + Number(a.amenity_price ?? a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
  const gstAmount = computeGst(log, nights, configMap['gst_percent'], amenityTotal);
  const overtimeFeeCharged = Number(log.overtime_fee_charged ?? 0);
  const overtimeFeeDefault = Number(log.overtime_fee_default ?? 0);
  const overtimeWaived = Math.max(0, overtimeFeeDefault - overtimeFeeCharged);
  const foodEff = (o) => Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct));
  const totalFood = (log.food_orders || []).reduce((s, o) => s + foodEff(o), 0);
  const isCancelled = !!log.cancellation;
  const cancellationFee = isCancelled ? Number(log.cancellation.cancellation_fee) : 0;
  const billTotal = isCancelled ? cancellationFee :
    log.is_nc ? 0 :
    (log.gst_inclusive
      ? (roomTotal + amenityTotal + overtimeFeeCharged)
      : (roomTotal + amenityTotal + overtimeFeeCharged + gstAmount)) + totalFood;
  const totalPaid = (log.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = billTotal - totalPaid;

  const room = roomMap[log.room];
  const roomNumber = room?.room_number ?? String(log.room);
  const roomTypeName = room ? roomTypeMap[room.room_type] : undefined;

  const occupants = [
    log.male_count > 0 ? `${log.male_count}M` : null,
    log.female_count > 0 ? `${log.female_count}F` : null,
    log.child_count > 0 ? `${log.child_count}C` : null,
  ].filter(Boolean).join(' · ') || '—';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div>
          <Text fw={700} size="md">Stay — Room {roomNumber}</Text>
          <Text size="xs" c="dimmed">
            {dayjs(log.check_in).format('DD MMM YYYY, hh:mm A')} → {log.check_out ? dayjs(log.check_out).format('DD MMM YYYY, hh:mm A') : '—'} · {nights} night{nights !== 1 ? 's' : ''}
          </Text>
        </div>
      }
      size="xl"
    >
      {/* Badges + Invoice */}
      <Group justify="space-between" mb="sm">
        <Group gap={4}>
          {log.is_nc && <Badge size="sm" color="grape">NC</Badge>}
          {log.is_early_checkin && <Badge size="sm" color="cyan">Early Check-In</Badge>}
          {log.gst_applied && <Badge size="sm" color="teal">GST</Badge>}
          {log.is_ac && <Badge size="sm" color="blue">AC</Badge>}
          {log.overtime_fee_charged > 0 && <Badge size="sm" color="yellow">Overtime</Badge>}
          {log.cancellation && <Badge size="sm" color="red">Cancelled</Badge>}
        </Group>
        {log.gst_applied && (
          <Button
            size="xs" variant="light" color="green" leftSection={<IconFileText size={13} />}
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
      </Group>

      {/* Cancellation alert */}
      {log.cancellation && (
        <Alert icon={<IconAlertTriangle size={14} />} color="red" mb="sm">
          <Text size="xs" fw={600}>
            Cancelled by {log.cancellation.cancelled_by ?? '—'} · {dayjs(log.cancellation.cancelled_on).format('DD MMM YYYY, hh:mm A')}
          </Text>
          <Text size="xs">Reason: {log.cancellation.reason}</Text>
          {Number(log.cancellation.cancellation_fee) > 0 && (
            <Text size="xs">Cancellation Fee: ₹{log.cancellation.cancellation_fee}</Text>
          )}
        </Alert>
      )}

      {/* Stay Info */}
      <SectionHeader>Stay Info</SectionHeader>
      <SimpleGrid cols={2} spacing="xl">
        <Stack gap={2}>
          <InfoRow label="Checked In By" value={log.checked_in_by_name ?? '—'} />
          <InfoRow label="Actual Check-In" value={log.actual_check_in ? dayjs(log.actual_check_in).format('DD MMM YYYY, hh:mm A') : null} />
          <InfoRow label="Checked Out By" value={log.checked_out_by_name ?? '—'} />
          <InfoRow label="Expected Checkout" value={log.expected_checkout ? dayjs(log.expected_checkout).format('DD MMM YYYY, hh:mm A') : null} />
          <InfoRow label="Occupants" value={occupants} />
        </Stack>
        <Stack gap={2}>
          <InfoRow label="Room Type" value={roomTypeName} />
          <InfoRow label="Price / Night" value={`₹${log.price}`} />
          <InfoRow label="Extra Beds" value={log.extra_bed > 0 ? `${log.extra_bed} × ₹${log.extra_per_bed_price}` : '0'} />
          {log.shifted_from && <InfoRow label="Shifted From" value={`Room ${log.shifted_from}`} />}
          {log.shift_reason && <InfoRow label="Shift Reason" value={log.shift_reason} />}
          {log.nc_status && (
            <Group justify="space-between" py={2} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
              <Text size="xs" c="dimmed">NC Status</Text>
              <Badge size="xs" color={log.nc_status.status === 'approved' ? 'grape' : log.nc_status.status === 'pending' ? 'orange' : 'red'}>
                {log.nc_status.status}
              </Badge>
            </Group>
          )}
        </Stack>
      </SimpleGrid>

      {/* Guests */}
      <SectionHeader>Guests</SectionHeader>
      <Table withTableBorder withColumnBorders fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Gender</Table.Th>
            <Table.Th>Age</Table.Th>
            <Table.Th>Phone</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(log.customers || []).map(c => (
            <Table.Tr key={c.id}>
              <Table.Td>{c.name}</Table.Td>
              <Table.Td>{genderLabel[c.gender] ?? c.gender ?? '—'}</Table.Td>
              <Table.Td>{c.age ?? '—'}</Table.Td>
              <Table.Td>{c.number ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {/* Billing */}
      <SectionHeader>Billing</SectionHeader>
      <Stack gap={0}>
        {isCancelled ? (
          /* Cancelled stays: only show cancellation fee */
          <BillingRow label="Cancellation Fee" value={cancellationFee > 0 ? `₹${cancellationFee.toLocaleString()}` : '₹0 (waived)'} />
        ) : (
          <>
            {/* Room rate breakdown */}
            <BillingRow label="Room rate / night" value={`₹${Number(log.price).toLocaleString()}`} />
            {log.extra_bed > 0 && (
              <BillingRow
                label={`Extra beds (${log.extra_bed} × ₹${log.extra_per_bed_price})`}
                value={`₹${(log.extra_bed * Number(log.extra_per_bed_price)).toLocaleString()}`}
              />
            )}
            {log.extra_bed > 0 && (
              <BillingRow
                label="Per night total"
                value={`₹${(Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)).toLocaleString()}`}
              />
            )}
            <BillingRow
              label={`× ${nights} night${nights !== 1 ? 's' : ''}`}
              value={`₹${roomTotal.toLocaleString()}`}
            />

            {/* Amenities itemised */}
            {(log.amenities || []).length > 0 && (
              <>
                <Divider my={4} variant="dashed" />
                {(log.amenities || []).map(a => {
                  const price = Number(a.amenity_price ?? a.price);
                  const subtotal = price * a.quantity * (a.charge_type === 'per_night' ? nights : 1);
                  return (
                    <BillingRow
                      key={a.id}
                      label={`${a.amenity_name ?? a.name} × ${a.quantity}${a.charge_type === 'per_night' ? ` × ${nights}n` : ''}`}
                      value={`₹${subtotal.toLocaleString()}`}
                    />
                  );
                })}
                <BillingRow label="Amenities subtotal" value={`₹${amenityTotal.toLocaleString()}`} />
              </>
            )}

            {/* Overtime */}
            {overtimeFeeCharged > 0 && (
              <>
                <Divider my={4} variant="dashed" />
                <BillingRow label="Overtime fee" value={`₹${overtimeFeeCharged.toLocaleString()}`} />
                {overtimeWaived > 0 && (
                  <BillingRow label={`↳ Waived (default ₹${overtimeFeeDefault})`} value={`−₹${overtimeWaived.toLocaleString()}`} sub />
                )}
              </>
            )}

            {/* Subtotal before GST (if GST exclusive) */}
            {!log.gst_inclusive && gstAmount > 0 && (
              <>
                <Divider my={4} variant="dashed" />
                <BillingRow label="Subtotal" value={`₹${(roomTotal + amenityTotal + overtimeFeeCharged).toLocaleString()}`} />
              </>
            )}

            {/* GST */}
            {gstAmount > 0 && (
              <BillingRow
                label={`${log.gst_inclusive ? 'Incl. ' : '+ '}GST (${configMap['gst_percent']}%)`}
                value={`₹${gstAmount.toLocaleString()}`}
              />
            )}

            {/* Food */}
            {totalFood > 0 && (
              <>
                <Divider my={4} variant="dashed" />
                <BillingRow label="Food orders" value={`₹${totalFood.toLocaleString()}`} />
              </>
            )}
          </>
        )}

        <Divider my={6} />
        <BillingRow label="Total" value={log.is_nc ? '₹0 (NC)' : `₹${billTotal.toLocaleString()}`} highlight />
        <BillingRow label="Total received" value={`₹${totalPaid.toLocaleString()}`} />
        <Group justify="space-between" py={4} mt={2}
          style={{ borderTop: '2px solid var(--mantine-color-gray-4)', background: balance > 0 ? 'var(--mantine-color-red-0)' : 'var(--mantine-color-teal-0)', borderRadius: 4, padding: '6px 4px' }}>
          <Text size="sm" fw={700}>Balance Due</Text>
          <Text size="sm" fw={700} c={balance > 0 ? 'red' : 'teal'}>
            {balance > 0 ? `₹${balance.toLocaleString()} due` : balance < 0 ? `₹${Math.abs(balance).toLocaleString()} overpaid` : '₹0 settled'}
          </Text>
        </Group>
      </Stack>

      {/* Payments */}
      <SectionHeader>Payments</SectionHeader>
      {(log.payments || []).length === 0 ? (
        <Text size="xs" c="dimmed">No payments recorded.</Text>
      ) : (
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Method</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>By</Table.Th>
              <Table.Th>Note</Table.Th>
              <Table.Th>Date &amp; Time</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(log.payments || []).map(p => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.payment_method_name ?? '—'}</Table.Td>
                <Table.Td fw={500}>₹{Number(p.amount).toLocaleString()}</Table.Td>
                <Table.Td>{p.processed_by_name ?? '—'}</Table.Td>
                <Table.Td>{p.note || '—'}</Table.Td>
                <Table.Td c="dimmed">{p.created_on ? dayjs(p.created_on).format('DD MMM YYYY, hh:mm A') : '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {/* Amenities */}
      {(log.amenities || []).length > 0 && (
        <>
          <SectionHeader>Amenities</SectionHeader>
          <Table withTableBorder withColumnBorders fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Unit Price</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Subtotal</Table.Th>
                <Table.Th>Added By</Table.Th>
                <Table.Th>Added At</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(log.amenities || []).map(a => (
                <Table.Tr key={a.id}>
                  <Table.Td>{a.amenity_name ?? a.name}</Table.Td>
                  <Table.Td>{a.quantity}</Table.Td>
                  <Table.Td>₹{a.amenity_price ?? a.price}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light">{a.charge_type === 'per_night' ? 'Per Night' : 'Flat'}</Badge>
                  </Table.Td>
                  <Table.Td>₹{Number(a.amenity_price ?? a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1)}</Table.Td>
                  <Table.Td>{a.added_by_name ?? '—'}</Table.Td>
                  <Table.Td>{a.added_at ? dayjs(a.added_at).format('DD MMM, hh:mm A') : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {/* Food Orders */}
      {(log.food_orders || []).length > 0 && (
        <>
          <SectionHeader>Food Orders</SectionHeader>
          <Table withTableBorder withColumnBorders fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Paid via</Table.Th>
                <Table.Th>Ordered by</Table.Th>
                <Table.Th>Time</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(log.food_orders || []).map((o, i) => (
                <Table.Tr key={o.id}>
                  <Table.Td c="dimmed">{i + 1}</Table.Td>
                  <Table.Td>{o.description}</Table.Td>
                  <Table.Td>
                    ₹{o.amount}
                    {!o.food_gst_inclusive && <Text span size="xs" c="dimmed"> +GST</Text>}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={o.is_paid ? 'teal' : 'orange'} variant="light">
                      {o.is_paid ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{o.payment_method_name ?? '—'}</Table.Td>
                  <Table.Td>{o.ordered_by_name ?? '—'}</Table.Td>
                  <Table.Td>{dayjs(o.ordered_at).format('DD MMM, hh:mm A')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {/* Vehicles */}
      {(log.vehicles || []).length > 0 && (
        <>
          <SectionHeader>Vehicles</SectionHeader>
          <Group gap="xs">
            {(log.vehicles || []).map(v => (
              <Badge key={v.id} variant="outline" size="md">{v.vehicle_number}</Badge>
            ))}
          </Group>
        </>
      )}

      {/* Notes */}
      {(log.notes || []).length > 0 && (
        <>
          <SectionHeader>Notes</SectionHeader>
          <Stack gap={4}>
            {(log.notes || []).map(n => (
              <Group key={n.id} gap={6} align="flex-start" wrap="nowrap"
                style={{ background: 'var(--mantine-color-yellow-0)', border: '1px solid var(--mantine-color-yellow-3)', borderRadius: 6, padding: '4px 8px' }}>
                <Text size="xs" style={{ flex: 1 }}>{n.text}</Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {n.created_by_name} · {dayjs(n.created_at).format('DD MMM, hh:mm A')}
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      )}

    </Modal>
  );
}

export default function History() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState([null, null]);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedRange, setAppliedRange] = useState([null, null]);
  const [detailLog, setDetailLog] = useState(null);
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);

  const params = {};
  if (appliedSearch) params.search = appliedSearch;
  if (appliedRange[0]) params.start_date = dayjs(appliedRange[0]).format('YYYY-MM-DD');
  if (appliedRange[1]) params.end_date = dayjs(appliedRange[1]).format('YYYY-MM-DD');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.stayHistory(params),
    queryFn: () => fetchStayHistory(params),
  });

  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const configMap = parseConfigs(configs);

  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const roomTypeMap = Object.fromEntries(roomTypes.map(rt => [rt.id, rt.name]));

  const { data: allRooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const roomMap = Object.fromEntries(allRooms.map(r => [r.id, r]));

  const gstPct = Number(configMap['gst_percent'] ?? 0) / 100;

  const applyFilters = () => {
    setAppliedSearch(search);
    setAppliedRange(dateRange);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const openDetails = (log) => {
    setDetailLog(log);
    openDetail();
  };

  const rows = logs.map((log) => {
    const nights = log.check_out
      ? Math.max(1, dayjs(log.check_out).diff(dayjs(log.check_in), 'day'))
      : 1;
    const roomTotal = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
    const amenityTotal = (log.amenities || []).reduce((sum, a) =>
      sum + Number(a.amenity_price ?? a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
    const gstAmount = computeGst(log, nights, configMap['gst_percent'], amenityTotal);
    const overtimeFeeCharged = Number(log.overtime_fee_charged ?? 0);
    const foodEff = (o) => Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct));
    const totalFood = (log.food_orders || []).reduce((s, o) => s + foodEff(o), 0);
    const total = log.is_nc ? 0 :
      (log.gst_inclusive
        ? (roomTotal + amenityTotal + overtimeFeeCharged)
        : (roomTotal + amenityTotal + overtimeFeeCharged + gstAmount)) + totalFood;
    const guests = (log.customers || []).map(c => c.name).join(', ') || '—';
    const room = roomMap[log.room];
    const roomNumber = room?.room_number ?? String(log.room);

    return (
      <Table.Tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => openDetails(log)}>
        <Table.Td>
          <Group gap={4}>
            {roomNumber}
            {log.is_nc && <Badge size="xs" color="grape">NC</Badge>}
            {log.is_early_checkin && <Badge size="xs" color="cyan">Early</Badge>}
            {log.gst_applied && <Badge size="xs" color="teal">GST</Badge>}
            {log.cancellation && <Badge size="xs" color="red">Cancelled</Badge>}
          </Group>
        </Table.Td>
        <Table.Td>
          <Text size="sm" lineClamp={1}>{guests}</Text>
        </Table.Td>
        <Table.Td>{dayjs(log.check_in).format('DD MMM YYYY')}</Table.Td>
        <Table.Td>{log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : '—'}</Table.Td>
        <Table.Td>{nights}</Table.Td>
        <Table.Td fw={600}>
          {log.is_nc ? <Badge color="grape" variant="light">₹0 (NC)</Badge> : `₹${total}`}
        </Table.Td>
        <Table.Td onClick={(e) => e.stopPropagation()}>
          <Group gap={4}>
            <Button size="xs" variant="light" leftSection={<IconEye size={13} />} onClick={() => openDetails(log)}>
              Details
            </Button>
            {log.gst_applied && (
              <Button
                size="xs" variant="light" color="green" leftSection={<IconFileText size={13} />}
                onClick={async () => {
                  const room = roomMap[log.room];
                  const roomNumber = room?.room_number ?? String(log.room);
                  const roomTypeName = room ? roomTypeMap[room.room_type] : undefined;
                  const nights = log.check_out
                    ? Math.max(1, dayjs(log.check_out).diff(dayjs(log.check_in), 'day'))
                    : 1;
                  const blob = await pdf(
                    <InvoiceDocument log={log} roomNumber={roomNumber} roomTypeName={roomTypeName} configMap={configMap} nights={nights} />
                  ).toBlob();
                  window.open(URL.createObjectURL(blob), '_blank');
                }}
              >
                Invoice
              </Button>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="md">
      <Text fw={700} size="xl">Stay History</Text>

      <Group align="flex-end" gap="sm">
        <TextInput
          label="Search"
          placeholder="Room # or guest name"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          w={220}
        />
        <DatePickerInput
          type="range"
          label="Date Range"
          placeholder="Pick dates"
          value={dateRange}
          onChange={setDateRange}
          clearable
          w={260}
        />
        <Button onClick={applyFilters}>Apply</Button>
        {(appliedSearch || appliedRange[0]) && (
          <Button variant="subtle" color="gray" onClick={() => {
            setSearch('');
            setDateRange([null, null]);
            setAppliedSearch('');
            setAppliedRange([null, null]);
          }}>
            Clear
          </Button>
        )}
      </Group>

      <Table.ScrollContainer minWidth={700}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Room</Table.Th>
              <Table.Th>Guests</Table.Th>
              <Table.Th>Check-In</Table.Th>
              <Table.Th>Check-Out</Table.Th>
              <Table.Th>Nights</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={16} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} ta="center">
                  <Text size="sm" c="dimmed">No past stays found.</Text>
                </Table.Td>
              </Table.Tr>
            ) : rows}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <StayDetailModal
        log={detailLog}
        opened={detailOpened}
        onClose={closeDetail}
        configMap={configMap}
        roomMap={roomMap}
        roomTypeMap={roomTypeMap}
      />
    </Stack>
  );
}
