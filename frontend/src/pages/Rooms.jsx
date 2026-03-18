import { useState } from 'react';
import { Table, Button, Modal, TextInput, NumberInput, Select, Badge, Group, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchRooms, fetchRoomTypes, fetchActiveLogs } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

export default function Rooms() {
  const qc = useQueryClient();
  const { data: rooms = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const { data: activeLogs = [] } = useQuery({ queryKey: QUERY_KEYS.activeLogs, queryFn: fetchActiveLogs });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { room_number: '', beds: 1, price: 0, room_type: null },
    validate: {
      room_number: (v) => v ? null : 'Required',
      room_type: (v) => v ? null : 'Required',
      beds: (v) => (v >= 1) ? null : 'Min 1',
    },
  });

  const occupiedRoomIds = new Set(activeLogs.map(l => l.room));

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({
      room_number: record.room_number,
      beds: record.beds,
      price: record.price,
      room_type: record.room_type ? String(record.room_type) : null,
    });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const payload = { ...values, room_type: values.room_type ? parseInt(values.room_type) : null };
      return editing
        ? api.put(`/v1/room/${editing.id}/`, payload)
        : api.post('/v1/rooms/', payload);
    },
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.rooms); close(); notifySuccess('Saved.'); },
    onError: () => notifyError('Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/room/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.rooms); notifySuccess('Deleted.'); },
    onError: () => notifyError('Failed to delete.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete room',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const roomTypeMap = Object.fromEntries(roomTypes.map(t => [t.id, t.name]));

  const rows = rooms.map((room) => (
    <Table.Tr key={room.id}>
      <Table.Td>{room.room_number}</Table.Td>
      <Table.Td>{roomTypeMap[room.room_type] ?? room.room_type}</Table.Td>
      <Table.Td>{room.beds}</Table.Td>
      <Table.Td>₹{room.price}</Table.Td>
      <Table.Td>
        {occupiedRoomIds.has(room.id)
          ? <Badge color="red">Occupied</Badge>
          : <Badge color="teal">Available</Badge>}
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(room)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(room.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Room</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Room No.</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Beds</Table.Th>
            <Table.Th>Default Price</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={6} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={6} ta="center">No rooms yet. Click Add Room to create one.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Room' : 'Add Room'}>
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
          <NumberInput label="Default Price (₹)" min={0} {...form.getInputProps('price')} mb="md" required />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
