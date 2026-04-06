import { Card, Button, Group, Text, NumberInput, TextInput, Select, Switch } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { QUERY_KEYS, fetchRoomTypes } from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';

export default function RoomDetailsTab({ room }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });

  const form = useForm({
    initialValues: {
      room_number: room.room_number,
      room_type: room.room_type ? String(room.room_type) : null,
      beds: room.beds,
      price: room.price,
      is_ac: room.is_ac ?? false,
    },
    validate: {
      room_number: (v) => v ? null : 'Required',
      room_type: (v) => v ? null : 'Required',
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values) => api.put(`/v1/room/${room.id}/`, {
      ...values,
      room_type: values.room_type ? parseInt(values.room_type) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.room(room.id));
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Room updated.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/v1/room/${room.id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.rooms);
      notifySuccess('Room deleted.');
      navigate('/rooms');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete room.')),
  });

  const handleDelete = () => modals.openConfirmModal({
    title: 'Delete Room',
    children: <Text size="sm">This will permanently delete Room {room.room_number}. This cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(),
  });

  return (
    <Card withBorder maw={500}>
      <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
        <TextInput label="Room Number" {...form.getInputProps('room_number')} mb="sm" required />
        <Select
          label="Room Type"
          data={roomTypes.map(t => ({ value: String(t.id), label: t.name }))}
          {...form.getInputProps('room_type')}
          mb="sm"
          required
        />
        <NumberInput label="Beds" min={1} {...form.getInputProps('beds')} mb="sm" required />
        <NumberInput label="Default Price (₹)" min={0} {...form.getInputProps('price')} mb="sm" required />
        <Switch
          label="AC Room"
          checked={form.values.is_ac}
          onChange={(e) => form.setFieldValue('is_ac', e.currentTarget.checked)}
          mb="md"
        />
        <Group justify="space-between">
          <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          <Button color="red" variant="light" onClick={handleDelete} loading={deleteMutation.isPending}>
            Delete Room
          </Button>
        </Group>
      </form>
    </Card>
  );
}
