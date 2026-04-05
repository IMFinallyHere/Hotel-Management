import { useState } from 'react';
import { SimpleGrid, Card, Badge, Text, Group, TextInput, SegmentedControl, Loader, Center, Stack, Button, Modal, Select, NumberInput, Switch, ActionIcon, Popover, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconSearch, IconPlus, IconTool, IconCalendarPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { QUERY_KEYS, fetchRooms, fetchRoomTypes, fetchActiveLogs, fetchReservations, fetchPriceChart, fetchConfigurations } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';
import { parseConfigs, isLogOvertime } from '../utils/configUtils';

function getRoomStatus(room, occupiedIds, reservedIds, overtimeIds) {
  if (overtimeIds.has(room.id)) return 'overtime';
  if (occupiedIds.has(room.id)) return 'occupied';
  if (room.status === 'cleaning') return 'cleaning';
  if (room.status === 'out_of_order') return 'out_of_order';
  if (reservedIds.has(room.id)) return 'reserved';
  return 'available';
}

const STATUS_CONFIG = {
  overtime:     { color: 'yellow', label: 'Overtime' },
  occupied:     { color: 'red',    label: 'Occupied' },
  cleaning:     { color: 'violet', label: 'Cleaning' },
  out_of_order: { color: 'dark',   label: 'Out of Order' },
  reserved:     { color: 'orange', label: 'Reserved' },
  available:    { color: 'teal',   label: 'Available' },
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
  // roomId → active log (for is_ac override)
  const activeLogMap = Object.fromEntries(
    activeLogs.filter(l => l.check_out === null).map(l => [l.room, l])
  );
  const reservedIds = new Set(
    reservations
      .filter(r => r.check_in_date <= today && r.check_out_date >= today)
      .map(r => r.room)
  );

  const statusChangeMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/v1/room/${id}/`, { status }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.rooms });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomStatusLogs(id) });
      notifySuccess('Room status updated.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to update room status.')),
  });

  const filteredRooms = rooms.filter(room => {
    if (search && !room.room_number.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && getRoomStatus(room, occupiedIds, reservedIds, overtimeIds) !== statusFilter) return false;
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
                  key === 'overtime'     ? overtimeIds.size
                  : key === 'occupied'  ? [...occupiedIds].filter(id => !overtimeIds.has(id)).length
                  : key === 'cleaning'  ? rooms.filter(r => !occupiedIds.has(r.id) && r.status === 'cleaning').length
                  : key === 'out_of_order' ? rooms.filter(r => !occupiedIds.has(r.id) && r.status === 'out_of_order').length
                  : key === 'reserved' ? [...reservedIds].filter(id => !occupiedIds.has(id) && rooms.find(r => r.id === id)?.status === 'available').length
                  : rooms.filter(r => !occupiedIds.has(r.id) && !reservedIds.has(r.id) && r.status === 'available').length
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
        {(permissions.add_roomstaylogs || permissions.is_superuser) && (
          <Button leftSection={<IconCalendarPlus size={16} />} color="teal" onClick={() => navigate('/bulk-booking')}>
            Bulk Booking
          </Button>
        )}
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          data={[
            { value: 'all', label: 'All' },
            { value: 'available', label: 'Available' },
            { value: 'cleaning', label: 'Cleaning' },
            { value: 'out_of_order', label: 'Out of Order' },
            { value: 'reserved', label: 'Reserved' },
            { value: 'occupied', label: 'Occupied' },
            { value: 'overtime', label: 'Overtime' },
          ]}
        />
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }}>
        {filteredRooms.map(room => {
          const status = getRoomStatus(room, occupiedIds, reservedIds, overtimeIds);
          const cfg = STATUS_CONFIG[status];
          const todayPrice = todayPriceMap[room.id];
          const occupiedPrice = occupiedPriceMap[room.id];
          const isOccupied = occupiedIds.has(room.id);
          return (
            <Card
              key={room.id}
              withBorder
              style={{ borderColor: `var(--mantine-color-${cfg.color}-5)`, borderWidth: 2, cursor: 'pointer' }}
              onClick={() => navigate(`/rooms/${room.id}`)}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="lg">{room.room_number}</Text>
                <Group gap={4}>
                  <Badge color={cfg.color} size="sm">{cfg.label}</Badge>
                  {!isOccupied && (permissions.change_rooms || permissions.is_superuser) && (
                    <div onClick={(e) => e.stopPropagation()}>
                    <Popover position="bottom-end" withinPortal>
                      <Popover.Target>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          title="Change room status"
                        >
                          <IconTool size={12} />
                        </ActionIcon>
                      </Popover.Target>
                      <Popover.Dropdown p="xs">
                        <Stack gap={4}>
                          {room.status !== 'available' && (
                            <Button
                              size="xs"
                              variant="light"
                              color="teal"
                              loading={statusChangeMutation.isPending}
                              onClick={() => statusChangeMutation.mutate({ id: room.id, status: 'available' })}
                            >
                              Mark Available
                            </Button>
                          )}
                          {room.status !== 'out_of_order' && (
                            <Button
                              size="xs"
                              variant="light"
                              color="dark"
                              loading={statusChangeMutation.isPending}
                              onClick={() => statusChangeMutation.mutate({ id: room.id, status: 'out_of_order' })}
                            >
                              Out of Order
                            </Button>
                          )}
                          {room.status !== 'cleaning' && (
                            <Button
                              size="xs"
                              variant="light"
                              color="violet"
                              loading={statusChangeMutation.isPending}
                              onClick={() => statusChangeMutation.mutate({ id: room.id, status: 'cleaning' })}
                            >
                              Mark Cleaning
                            </Button>
                          )}
                        </Stack>
                      </Popover.Dropdown>
                    </Popover>
                    </div>
                  )}
                </Group>
              </Group>
              <Group gap={6} mb={4}>
                <Text c="dimmed" size="sm">{roomTypeMap[room.room_type] ?? '—'}</Text>
                {(() => {
                  const log = activeLogMap[room.id];
                  const isAc = log ? (log.is_ac ?? room.is_ac) : room.is_ac;
                  return isAc
                    ? <Badge color="blue" size="xs">AC</Badge>
                    : <Badge color="gray" variant="outline" size="xs">Non-AC</Badge>;
                })()}
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
