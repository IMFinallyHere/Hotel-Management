import { useState } from 'react';
import {
  Stack, Group, Text, Badge, Card, SimpleGrid, Table, Button, Tabs,
  NumberInput, Textarea, Loader, Center, Paper, Divider, Alert,
} from '@mantine/core';
import { PieChart, Pie, Cell, Customized } from 'recharts';
import { DatePickerInput } from '@mantine/dates';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

const EVENT_LABELS = {
  payment_received:    'Room Payment',
  food_payment:        'Food Payment',
  reservation_advance: 'Reservation Advance',
  advance_applied:     'Advance Applied',
  cancellation_fee:    'Cancellation Fee',
  expense_paid:        'Expense',
  cash_withdrawal:     'Cash Withdrawal (DR)',
  cash_deposit:        'Cash Deposit (CR)',
  refund_paid:         'Refund Paid',
};

const EVENT_COLOR = {
  payment_received:    'teal',
  food_payment:        'teal',
  reservation_advance: 'teal',
  cancellation_fee:    'teal',
  cash_deposit:        'teal',
  expense_paid:        'red',
  cash_withdrawal:     'red',
  refund_paid:         'red',
  advance_applied:     'gray',
};

function eventLabel(e) {
  if (e.event_type === 'cancellation_fee')
    return e.payment_method ? 'Cancellation Fee (Direct)' : 'Cancellation Fee (From Adv.)';
  return EVENT_LABELS[e.event_type] || e.event_type;
}

function fmt(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}

function SummaryCard({ label, value, color = 'dark' }) {
  return (
    <Card withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      <Text fw={700} size="xl" c={color}>{fmt(value)}</Text>
    </Card>
  );
}

export default function Settlement() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canManage = permissions.manage_daily_settlement || permissions.is_superuser;

  const yesterday = dayjs().subtract(1, 'day').toDate();
  const [date, setDate] = useState(yesterday);
  const dateStr = dayjs(date).format('YYYY-MM-DD');

  // Actuals keyed by payment_method_id (entered by owner before settling)
  const [actuals, setActuals] = useState({});
  const [notes, setNotes] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: QUERY_KEYS.settlement(dateStr),
    queryFn: () => api.get(`/v1/settlement/${dateStr}/`).then(r => r.data),
    enabled: !!dateStr,
    onSuccess: (d) => {
      // Pre-fill actuals from stored breakdowns when settled
      if (d.status === 'settled') {
        const pre = {};
        (d.method_breakdowns || []).forEach(b => {
          if (b.actual_received != null) pre[b.payment_method_id] = b.actual_received;
        });
        setActuals(pre);
        setNotes(d.notes || '');
      } else {
        setActuals({});
        setNotes('');
      }
    },
  });

  const settleMutation = useMutation({
    mutationFn: (payload) => api.post(`/v1/settlement/${dateStr}/settle/`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.settlement(dateStr));
      notifySuccess('Day settled successfully.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to settle.')),
  });

  const handleSettle = () => {
    const actualsArr = (data?.method_breakdowns || []).map(b => ({
      payment_method_id: b.payment_method_id,
      actual_received:   actuals[b.payment_method_id] ?? null,
    }));
    settleMutation.mutate({ actuals: actualsArr, notes });
  };

  const isSettled = data?.status === 'settled';
  const t = data?.totals || {};

  // Group events for tabs
  const events = data?.events || [];
  const inflows   = events.filter(e => ['payment_received', 'food_payment', 'reservation_advance', 'cancellation_fee', 'cash_deposit'].includes(e.event_type));
  const outflows  = events.filter(e => ['expense_paid', 'cash_withdrawal', 'refund_paid'].includes(e.event_type));
  const withheld  = events.filter(e => e.event_type === 'cancellation_fee' && !e.payment_method);
  // re-split inflows to exclude withheld
  const realInflows = inflows.filter(e => !(e.event_type === 'cancellation_fee' && !e.payment_method));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600} size="xl">Daily Settlement</Text>
        {data && (
          <Badge
            color={isSettled ? 'teal' : 'orange'}
            size="lg"
            variant="light"
          >
            {isSettled ? 'Settled' : 'Pending'}
          </Badge>
        )}
      </Group>

      <Group>
        <DatePickerInput
          label="Settlement Date"
          value={date}
          onChange={(d) => { setDate(d); setActuals({}); setNotes(''); }}
          maxDate={yesterday}
          w={200}
        />
      </Group>

      {isLoading || isFetching ? (
        <Center h={200}><Loader /></Center>
      ) : !data ? null : (
        <>
          {/* 3 headline cards */}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <SummaryCard label="Total Inflow"  value={t.total_inflow}  color="teal" />
            <SummaryCard label="Total Outflow" value={t.total_outflow} color="red" />
            <SummaryCard label="Net"           value={t.net}           color={t.net >= 0 ? 'teal' : 'red'} />
          </SimpleGrid>

          {/* Chart breakdown */}
          {(() => {
            const inflowSlices = [
              { name: 'Room Payments',       value: Number(t.room_payments)            || 0, color: 'teal.6' },
              { name: 'Food Payments',        value: Number(t.food_payments)            || 0, color: 'cyan.5' },
              { name: 'Reservation Advances', value: Number(t.reservation_advances)     || 0, color: 'blue.5' },
              { name: 'Cancellation Fees',    value: Number(t.direct_cancellation_fees) || 0, color: 'violet.5' },
              { name: 'Cash Deposits (CR)',   value: Number(t.cash_deposits)            || 0, color: 'green.5' },
            ].filter(s => s.value > 0);

            const outflowSlices = [
              { name: 'Expenses',    value: Number(t.expenses)    || 0, color: 'red.6' },
              { name: 'Withdrawals', value: Number(t.withdrawals) || 0, color: 'orange.5' },
              { name: 'Refunds',     value: Number(t.refunds)     || 0, color: 'pink.5' },
            ].filter(s => s.value > 0);

            if (inflowSlices.length === 0 && outflowSlices.length === 0) return null;

            function mc(c) {
              const [n, s] = c.split('.');
              return `var(--mantine-color-${n}-${s})`;
            }

            function DonutSliceChart({ title, slices }) {
              const total = slices.reduce((a, s) => a + s.value, 0);
              const W = 520, H = 280, OR = 80, IR = 50;
              const CX = 260, CY = 140;
              const LABEL_R = OR + 28, MIN_GAP = 32, MIN_DEG = 8;

              // Mirror recharts' minAngle logic: pad tiny slices then scale to 360°
              // so our angle math exactly matches what recharts renders.
              const rawDegs = slices.map(s => (s.value / total) * 360);
              const paddedDegs = rawDegs.map(d => Math.max(d, MIN_DEG));
              const scale = 360 / paddedDegs.reduce((a, v) => a + v, 0);
              const finalDegs = paddedDegs.map(d => d * scale);
              // displayValue drives recharts proportions; original value shown in labels
              const pieData = slices.map((s, i) => ({ ...s, displayValue: (finalDegs[i] / 360) * total }));

              // Compute label positions from our adjusted angles
              let cum = 0;
              const labelItems = finalDegs.map((deg, i) => {
                const mid = cum + deg / 2;
                cum += deg;
                const rad = mid * Math.PI / 180;
                return {
                  name: slices[i].name,
                  value: slices[i].value,
                  rad,
                  lx: CX + LABEL_R * Math.cos(rad),
                  ly: CY - LABEL_R * Math.sin(rad),
                };
              });

              const right = labelItems.filter(l => l.lx >= CX).sort((a, b) => a.ly - b.ly);
              const left  = labelItems.filter(l => l.lx <  CX).sort((a, b) => a.ly - b.ly);
              function pushDown(arr) {
                for (let i = 1; i < arr.length; i++)
                  if (arr[i].ly - arr[i-1].ly < MIN_GAP)
                    arr[i] = { ...arr[i], ly: arr[i-1].ly + MIN_GAP };
              }
              function pushUp(arr) {
                for (let i = arr.length - 2; i >= 0; i--)
                  if (arr[i+1].ly - arr[i].ly < MIN_GAP)
                    arr[i] = { ...arr[i], ly: arr[i+1].ly - MIN_GAP };
              }
              pushDown(right); pushUp(right);
              pushDown(left);  pushUp(left);
              const allLabels = [...right, ...left];

              function Labels() {
                return (
                  <g>
                    {allLabels.map(l => {
                      const lsx = CX + OR * Math.cos(l.rad);
                      const lsy = CY - OR * Math.sin(l.rad);
                      const isRight = l.lx >= CX;
                      const tx = isRight ? l.lx + 5 : l.lx - 5;
                      return (
                        <g key={l.name}>
                          <line x1={lsx} y1={lsy} x2={l.lx} y2={l.ly}
                            stroke="var(--mantine-color-gray-5)" strokeWidth={1} />
                          <text x={tx} y={l.ly - 7} textAnchor={isRight ? 'start' : 'end'} fontSize={11}>
                            <tspan x={tx} dy="0" fill="var(--mantine-color-dimmed)">{l.name}</tspan>
                            <tspan x={tx} dy="1.4em" fontWeight="600" fill="var(--mantine-color-text)">{fmt(l.value)}</tspan>
                          </text>
                        </g>
                      );
                    })}
                    <text x={CX} y={CY - 7} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--mantine-color-dimmed)">Total</text>
                    <text x={CX} y={CY + 9} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight="700" fill="var(--mantine-color-text)">{fmt(total)}</text>
                  </g>
                );
              }

              return (
                <Stack gap={4} align="center">
                  <Text fw={600} size="sm">{title}</Text>
                  <PieChart width={W} height={H} margin={{ top: 40, right: 180, bottom: 40, left: 180 }}>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={OR} innerRadius={IR}
                      dataKey="displayValue" isAnimationActive={false}>
                      {pieData.map((s, i) => <Cell key={i} fill={mc(s.color)} />)}
                    </Pie>
                    <Customized component={Labels} />
                  </PieChart>
                </Stack>
              );
            }

            return (
              <Paper withBorder p="md" radius="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
                  {inflowSlices.length > 0 && (
                    <DonutSliceChart title="Inflow Breakdown" slices={inflowSlices} />
                  )}
                  {outflowSlices.length > 0 && (
                    <DonutSliceChart title="Outflow Breakdown" slices={outflowSlices} />
                  )}
                </SimpleGrid>
              </Paper>
            );
          })()}

          <Divider label="Payment Method Reconciliation" labelPosition="left" />

          {/* Reconciliation table */}
          <Paper withBorder p="md" radius="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Method</Table.Th>
                  <Table.Th ta="right">System Inflow</Table.Th>
                  <Table.Th ta="right">System Outflow</Table.Th>
                  <Table.Th ta="right">System Net</Table.Th>
                  <Table.Th ta="right">Actual Received</Table.Th>
                  <Table.Th ta="right">Difference</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(data.method_breakdowns || []).length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6} ta="center" c="dimmed">No payment method transactions.</Table.Td>
                  </Table.Tr>
                ) : (data.method_breakdowns || []).map(b => {
                  const actual = actuals[b.payment_method_id] ?? null;
                  const diff   = actual != null ? actual - b.system_net : null;
                  return (
                    <Table.Tr key={b.payment_method_id}>
                      <Table.Td fw={500}>{b.payment_method_name}</Table.Td>
                      <Table.Td ta="right" c="teal">{fmt(b.system_inflow)}</Table.Td>
                      <Table.Td ta="right" c="red">{fmt(b.system_outflow)}</Table.Td>
                      <Table.Td ta="right" fw={600}>{fmt(b.system_net)}</Table.Td>
                      <Table.Td ta="right">
                        {isSettled ? (
                          <Text fw={600}>{b.actual_received != null ? fmt(b.actual_received) : '—'}</Text>
                        ) : (
                          <NumberInput
                            min={0}
                            value={actual ?? ''}
                            onChange={(v) => setActuals(prev => ({ ...prev, [b.payment_method_id]: v }))}
                            placeholder="Enter amount"
                            size="xs"
                            styles={{ root: { maxWidth: 140, marginLeft: 'auto' }, input: { textAlign: 'right' } }}
                          />
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {diff != null ? (
                          <Text fw={600} c={diff === 0 ? 'teal' : diff > 0 ? 'blue' : 'red'}>
                            {diff >= 0 ? '+' : ''}{fmt(diff)}
                          </Text>
                        ) : '—'}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>

          <Divider label="Transaction Details" labelPosition="left" />

          {/* Line items */}
          <Tabs defaultValue="inflows">
            <Tabs.List>
              <Tabs.Tab value="inflows">Inflows ({realInflows.length})</Tabs.Tab>
              <Tabs.Tab value="outflows">Outflows ({outflows.length})</Tabs.Tab>
              {withheld.length > 0 && (
                <Tabs.Tab value="withheld">Withheld Fees ({withheld.length})</Tabs.Tab>
              )}
            </Tabs.List>

            {withheld.length > 0 && (
              <Tabs.Panel value="withheld" pt="sm">
                <Alert icon={<IconInfoCircle size={16} />} color="orange" variant="light" mb="sm">
                  ₹{Number(t.withheld_cancellation_fees).toLocaleString('en-IN')} was withheld as cancellation fee from guest advances — this is not counted as today&apos;s income.
                </Alert>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Room</Table.Th>
                      <Table.Th>Guests</Table.Th>
                      <Table.Th>Method</Table.Th>
                      <Table.Th>Note</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                      <Table.Th>Time</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {withheld.map(e => (
                      <Table.Tr key={e.id}>
                        <Table.Td>
                          <Badge color={EVENT_COLOR[e.event_type] || 'gray'} size="sm" variant="light">
                            {eventLabel(e)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{e.room_number || '—'}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{(e.guests || []).join(', ') || '—'}</Text>
                          {e.cancellation_fee_withheld != null && (
                            <Text size="xs" c="orange">₹{e.cancellation_fee_withheld} kept as fee</Text>
                          )}
                        </Table.Td>
                        <Table.Td>{e.payment_method || '—'}</Table.Td>
                        <Table.Td><Text size="sm" c="dimmed" lineClamp={1}>{e.note || '—'}</Text></Table.Td>
                        <Table.Td ta="right" fw={600}>{fmt(e.amount)}</Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{dayjs(e.created_on).format('HH:mm')}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {[['inflows', realInflows], ['outflows', outflows]].map(([key, evts]) => (
              <Tabs.Panel key={key} value={key} pt="sm">
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Room</Table.Th>
                      <Table.Th>Guests</Table.Th>
                      <Table.Th>Method</Table.Th>
                      <Table.Th>Note</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                      <Table.Th>Time</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {evts.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={7} ta="center" c="dimmed">No transactions.</Table.Td>
                      </Table.Tr>
                    ) : evts.map(e => (
                      <Table.Tr key={e.id}>
                        <Table.Td>
                          <Badge color={EVENT_COLOR[e.event_type] || 'gray'} size="sm" variant="light">
                            {eventLabel(e)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{e.room_number || '—'}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{(e.guests || []).join(', ') || '—'}</Text>
                          {e.cancellation_fee_withheld != null && (
                            <Text size="xs" c="orange">₹{e.cancellation_fee_withheld} kept as fee</Text>
                          )}
                        </Table.Td>
                        <Table.Td>{e.payment_method || '—'}</Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed" lineClamp={1}>{e.note || '—'}</Text>
                        </Table.Td>
                        <Table.Td ta="right" fw={600}>{fmt(e.amount)}</Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {dayjs(e.created_on).format('HH:mm')}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            ))}
          </Tabs>

          {/* Settle action */}
          {!isSettled && canManage && (
            <Paper withBorder p="md" radius="md">
              <Text fw={500} mb="sm">Settle Day</Text>
              <Textarea
                label="Notes (optional)"
                placeholder="Any remarks for this settlement..."
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                rows={2}
                mb="md"
              />
              <Group justify="flex-end">
                <Button
                  leftSection={<IconCheck size={16} />}
                  color="teal"
                  loading={settleMutation.isPending}
                  onClick={handleSettle}
                >
                  Mark as Settled
                </Button>
              </Group>
            </Paper>
          )}

          {isSettled && (
            <Text size="sm" c="dimmed" ta="center">
              Settled by {data.settled_by} on {dayjs(data.settled_at).format('DD MMM YYYY [at] HH:mm')}
              {data.notes && ` · ${data.notes}`}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
