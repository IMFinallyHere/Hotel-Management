import { useState } from 'react';
import { SimpleGrid, Card, Badge, Text, Group, TextInput, SegmentedControl, Loader, Center, Stack, Button, Modal, Select, NumberInput, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconSearch, IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { QUERY_KEYS, fetchRooms, fetchRoomTypes, fetchActiveLogs, fetchReservations, fetchPriceChart, fetchConfigurations } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';
import { parseConfigs, isLogOvertime } from '../utils/configUtils';

function getRoomStatus(roomId, occupiedIds, reservedIds, overtimeIds) {
  if (overtimeIds.has(roomId)) return 'overtime';
  if (occupiedIds.has(roomId)) return 'occupied';
  if (reservedIds.has(roomId)) return 'reserved';
  return 'available';
}

const STATUS_CONFIG = {
  overtime:  { color: 'yellow', label: 'Overtime' },
  occupied:  { color: 'red',    label: 'Occupied' },
  reserved:  { color: 'orange', label: 'Reserved' },
  available: { color: 'teal',   label: 'Available' },
};

export default function RoomDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);

  const addForm = useForm({
    initialValues: { room_number: '', room_type: null, beds: 1, price: 0, is_ac: false },
    validate: {
      room_number: (v) => v.trim() ? null : 'Required',
      room_type: (v) => v ? null : 'Required',
    },
  });

  const addMutation = useMutation({
    mutationFn: (values) => api.post('/v1/rooms/', {
      ...values,
      room_type: values.room_type ? parseInt(values.room_type) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.rooms);
      closeAdd();
      addForm.reset();
      notifySuccess('Room created.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to create room.')),
  });

  const { data: rooms = [], isLoading: roomsLoading } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const { data: reservations = [] } = useQuery({ queryKey: QUERY_KEYS.reservations, queryFn: fetchReservations });
  const { data: priceChart = [] } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });
  const { data: configs = [] } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });

  const roomTypeMap = Object.fromEntries(roomTypes.map(t => [t.id, t.name]));
  const occupiedIds = new Set(activeLogs.map(l => l.room));
  const overtimeIds = new Set(activeLogs.filter(l => isLogOvertime(l)).map(l => l.room));

  // roomId → today's chart price
  const todayPriceMap = Object.fromEntries(
    priceChart.filter(e => e.date === today).map(e => [e.room, e.price])
  );
  // roomId → checked-in price
  const occupiedPriceMap = Object.fromEntries(
    activeLogs.filter(l => l.check_out === null).map(l => [l.room, l.price])
  );
  const reservedIds = new Set(
    reservations
      .filter(r => r.check_in_date <= today && r.check_out_date >= today)
      .map(r => r.room)
  );

  const filteredRooms = rooms.filter(room => {
    if (search && !room.room_number.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && getRoomStatus(room.id, occupiedIds, reservedIds, overtimeIds) !== statusFilter) return false;
    return true;
  });

  if (roomsLoading) {
    return <Center h={200}><Loader size="lg" /></Center>;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600} size="xl" mb="xs">Room Dashboard</Text>
          <Group gap="xs">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <Badge key={key} color={cfg.color} variant="light" size="lg">
                {cfg.label}: {
                  key === 'overtime' ? overtimeIds.size
                  : key === 'occupied' ? [...occupiedIds].filter(id => !overtimeIds.has(id)).length
                  : key === 'reserved' ? [...reservedIds].filter(id => !occupiedIds.has(id)).length
                  : rooms.filter(r => !occupiedIds.has(r.id) && !reservedIds.has(r.id)).length
                }
              </Badge>
            ))}
          </Group>
        </div>
      </Group>

      <Group>
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Search by room number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          w={220}
        />
        {(permissions.add_rooms || permissions.is_superuser) && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => { addForm.reset(); openAdd(); }}>
            Add Room
          </Button>
        )}
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          data={[
            { value: 'all', label: 'All' },
            { value: 'available', label: 'Available' },
            { value: 'reserved', label: 'Reserved' },
            { value: 'occupied', label: 'Occupied' },
            { value: 'overtime', label: 'Overtime' },
          ]}
        />
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }}>
        {filteredRooms.map(room => {
          const status = getRoomStatus(room.id, occupiedIds, reservedIds, overtimeIds);
          const cfg = STATUS_CONFIG[status];
          const todayPrice = todayPriceMap[room.id];
          const occupiedPrice = occupiedPriceMap[room.id];
          return (
            <Card
              key={room.id}
              withBorder
              style={{ borderColor: `var(--mantine-color-${cfg.color}-5)`, borderWidth: 2, cursor: 'pointer' }}
              onClick={() => navigate(`/rooms/${room.id}`)}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="lg">{room.room_number}</Text>
                <Badge color={cfg.color} size="sm">{cfg.label}</Badge>
              </Group>
              <Group gap={6} mb={4}>
                <Text c="dimmed" size="sm">{roomTypeMap[room.room_type] ?? '—'}</Text>
                {room.is_ac
                  ? <Badge color="blue" size="xs">AC</Badge>
                  : <Badge color="gray" variant="outline" size="xs">Non-AC</Badge>
                }
              </Group>
              <Text c="dimmed" size="sm">{room.beds} bed{room.beds !== 1 ? 's' : ''}</Text>
              {todayPrice != null ? (
                <Group gap={6} mt="xs" align="center">
                  <Text size="sm" c="dimmed" td="line-through">₹{room.price}</Text>
                  <Text fw={600} c="teal" size="sm">₹{todayPrice}/night</Text>
                </Group>
              ) : (
                <Text fw={600} c="teal" mt="xs">₹{room.price}/night</Text>
              )}
              {occupiedPrice != null && (
                <Text size="xs" c="dimmed" mt={2}>Occupied @ ₹{occupiedPrice}/night</Text>
              )}
            </Card>
          );
        })}
      </SimpleGrid>

      {filteredRooms.length === 0 && (
        <Center h={100}>
          <Text c="dimmed">No rooms match the filter.</Text>
        </Center>
      )}

      <Modal opened={addOpened} onClose={closeAdd} title="Add Room">
        <form onSubmit={addForm.onSubmit(v => addMutation.mutate(v))}>
          <TextInput label="Room Number" {...addForm.getInputProps('room_number')} mb="sm" required />
          <Select
            label="Room Type"
            data={roomTypes.map(t => ({ value: String(t.id), label: t.name }))}
            {...addForm.getInputProps('room_type')}
            mb="sm"
            required
          />
          <NumberInput label="Beds" min={1} {...addForm.getInputProps('beds')} mb="sm" required />
          <NumberInput label="Default Price (₹)" min={0} {...addForm.getInputProps('price')} mb="sm" required />
          <Switch
            label="AC Room"
            checked={addForm.values.is_ac}
            onChange={(e) => addForm.setFieldValue('is_ac', e.currentTarget.checked)}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeAdd}>Cancel</Button>
            <Button type="submit" loading={addMutation.isPending}>Create</Button>
          </Group>
        </form>
      </Modal>
    </Stack>
  );
}
