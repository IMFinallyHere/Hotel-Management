import { useState } from 'react';
import { Table, Button, Modal, TextInput, Group, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchRoomTypes } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

export default function RoomTypes() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { name: '' },
    validate: { name: (v) => v ? null : 'Required' },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => { setEditing(record); form.setValues({ name: record.name }); open(); };

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? api.put(`/v1/room/types/${editing.id}/`, values)
      : api.post('/v1/room/types/', values),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.roomTypes); close(); notifySuccess('Saved.'); },
    onError: () => notifyError('Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/room/types/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.roomTypes); notifySuccess('Deleted.'); },
    onError: () => notifyError('Failed to delete.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete room type',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const rows = data.map((rt) => (
    <Table.Tr key={rt.id}>
      <Table.Td>{rt.name}</Table.Td>
      <Table.Td>{new Date(rt.created_on).toLocaleString()}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(rt)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(rt.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Room Type</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Created On</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">No room types yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Room Type' : 'Add Room Type'}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Name" {...form.getInputProps('name')} mb="md" required />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
