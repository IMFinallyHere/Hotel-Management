import { useState } from 'react';
import { Stepper, Select, NumberInput, Button, Card, Group, Stack, Title, Text, ThemeIcon, Center } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchRooms, fetchActiveLogs } from '../api/queries';
import { notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import CustomerSelectWithAdd from '../components/CustomerSelectWithAdd';

export default function CheckIn() {
  const [active, setActive] = useState(0);
  const [groupId, setGroupId] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const groupForm = useForm({
    initialValues: { customers: [] },
    validate: { customers: (v) => v.length > 0 ? null : 'Select at least one customer.' },
  });

  const roomForm = useForm({
    initialValues: { room: null, price: 0, extra_bed: 0, extra_per_bed_price: 0 },
    validate: { room: (v) => v ? null : 'Select a room.' },
  });

  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });

  const occupiedRoomIds = new Set(activeLogs.map(l => l.room));
  const availableRooms = rooms.filter(r => !occupiedRoomIds.has(r.id));

  const selectedRoom = availableRooms.find(r => String(r.id) === roomForm.values.room) ?? null;
  const guestCount = groupForm.values.customers.length;
  const maxGuests = selectedRoom ? selectedRoom.beds + roomForm.values.extra_bed : null;
  const guestExceeded = maxGuests !== null && guestCount > maxGuests;

  const handleCreateGroup = async (values) => {
    setLoading(true);
    try {
      const { data } = await api.post('/v1/group/customers/', { customers: values.customers.map(Number) });
      setGroupId(data.group_id);
      setActive(1);
    } catch (e) {
      notifyError(parseApiError(e, 'Failed to create group.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async (values) => {
    if (guestExceeded) {
      notifyError(`Too many guests selected: ${guestCount} guests but max for this room is ${maxGuests}.`);
      return;
    }
    setLoading(true);
    try {
      await api.post('/v1/checkin/', { ...values, room: parseInt(values.room), group: groupId });
      setDone(true);
    } catch (e) {
      notifyError(parseApiError(e, 'Check-in failed.'));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setActive(0);
    setGroupId(null);
    setDone(false);
    groupForm.reset();
    roomForm.reset();
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
    <Card style={{ maxWidth: 600, margin: '0 auto' }} withBorder>
      <Stepper active={active} mb="xl">
        <Stepper.Step label="Create Group" />
        <Stepper.Step label="Assign Room" />
      </Stepper>

      {active === 0 && (
        <form onSubmit={groupForm.onSubmit(handleCreateGroup)}>
          <CustomerSelectWithAdd
            label="Select Customers"
            value={groupForm.values.customers}
            onChange={(val) => groupForm.setFieldValue('customers', val)}
            error={groupForm.errors.customers}
            helperText="Max guests = beds in chosen room (set on next step)"
            required
          />
          <Button type="submit" loading={loading} mt="md">Next: Assign Room</Button>
        </form>
      )}

      {active === 1 && (
        <form onSubmit={roomForm.onSubmit(handleCheckin)}>
          <Select
            label="Room"
            data={availableRooms.map(r => ({ value: String(r.id), label: `${r.room_number} — ${r.beds} beds — ₹${r.price}` }))}
            {...roomForm.getInputProps('room')}
            mb="sm"
            required
          />
          <NumberInput label="Price (₹, leave 0 to auto-resolve)" min={0} {...roomForm.getInputProps('price')} mb="sm" />
          <NumberInput label="Extra Beds" min={0} {...roomForm.getInputProps('extra_bed')} mb="sm" />
          <NumberInput label="Price per Extra Bed (₹)" min={0} {...roomForm.getInputProps('extra_per_bed_price')} mb="sm" />
          {selectedRoom && (
            <Text size="sm" c={guestExceeded ? 'red' : 'dimmed'} mb="md">
              Selected {guestCount} guest{guestCount !== 1 ? 's' : ''} — max for this room is {maxGuests} ({selectedRoom.beds} bed{selectedRoom.beds !== 1 ? 's' : ''} + {roomForm.values.extra_bed} extra)
            </Text>
          )}
          <Group>
            <Button variant="default" onClick={() => setActive(0)}>Back</Button>
            <Button type="submit" loading={loading} disabled={guestExceeded}>Confirm Check-In</Button>
          </Group>
        </form>
      )}
    </Card>
  );
}
