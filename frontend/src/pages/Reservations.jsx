import { useState, useCallback } from 'react';
import {
  Stack, Text, Group, TextInput, Button, Badge, Table, ActionIcon,
  Loader, Center, Paper, Select, Pagination, Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconSearch, IconX, IconDoor, IconTrash } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

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
  const [status, setStatus] = useState('upcoming'); // upcoming | past | all
  const [page, setPage] = useState(1);

  // Active filters — only applied when user hits Search or on mount
  const [activeParams, setActiveParams] = useState({ status: 'upcoming' });

  const { data: reservations = [], isFetching } = useQuery({
    queryKey: ['reservations-search', activeParams],
    queryFn: () => {
      const p = { ...activeParams };
      // Apply status filter
      if (activeParams.status === 'upcoming') p.check_out_from = today;
      else if (activeParams.status === 'past') p.check_out_to = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      delete p.status;
      return api.get('/v1/reservations/', { params: p }).then(r => r.data);
    },
    keepPreviousData: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/reservation/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations-search'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      notifySuccess('Reservation cancelled.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to cancel reservation.')),
  });

  const handleSearch = () => {
    setPage(1);
    setActiveParams({
      ...buildParams({ customer, roomNumber, checkInRange, checkOutRange }),
      status,
    });
  };

  const handleClear = () => {
    setCustomer('');
    setRoomNumber('');
    setCheckInRange([null, null]);
    setCheckOutRange([null, null]);
    setStatus('upcoming');
    setPage(1);
    setActiveParams({ status: 'upcoming' });
  };

  const paged = reservations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(reservations.length / PAGE_SIZE);

  const canDelete = permissions.delete_reservation || permissions.is_superuser;

  return (
    <Stack gap="md">
      <Text fw={600} size="xl">Reservations</Text>

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
              ]}
            />
          </Group>
          <Group gap="sm" wrap="wrap">
            <DatePickerInput
              type="range"
              placeholder="Check-in range"
              value={checkInRange}
              onChange={setCheckInRange}
              clearable
              size="sm"
              w={240}
              label="Check-in"
            />
            <DatePickerInput
              type="range"
              placeholder="Check-out range"
              value={checkOutRange}
              onChange={setCheckOutRange}
              clearable
              size="sm"
              w={240}
              label="Check-out"
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
          <Text size="sm" c="dimmed">{reservations.length} reservation{reservations.length !== 1 ? 's' : ''} found</Text>
          <Table withBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
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
                const statusLabel = isPast ? 'Past' : isToday ? 'Today' : 'Upcoming';
                const statusColor = isPast ? 'gray' : isToday ? 'orange' : 'teal';
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td fw={600}>{r.room_number ?? r.room}</Table.Td>
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
                      {Number(r.advance_amount) > 0
                        ? <Text size="sm">₹{Number(r.advance_amount).toLocaleString()} <Text span size="xs" c="dimmed">({r.advance_payment_type})</Text></Text>
                        : <Text size="sm" c="dimmed">—</Text>
                      }
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor} size="sm">{statusLabel}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Tooltip label="View room">
                          <ActionIcon
                            size="sm" variant="subtle" color="teal"
                            onClick={() => navigate(`/rooms/${r.room}`)}
                          >
                            <IconDoor size={14} />
                          </ActionIcon>
                        </Tooltip>
                        {canDelete && !isPast && (
                          <Tooltip label="Cancel reservation">
                            <ActionIcon
                              size="sm" variant="subtle" color="red"
                              loading={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(r.id)}
                            >
                              <IconTrash size={14} />
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
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          )}
        </Stack>
      )}
    </Stack>
  );
}
