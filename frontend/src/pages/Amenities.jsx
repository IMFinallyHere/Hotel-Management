import { useState } from 'react';
import { Table, Button, Modal, TextInput, NumberInput, Select, Group, Text, Badge } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchAmenities } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

export default function Amenities() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.amenities, queryFn: fetchAmenities });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { name: '', price: 0, charge_type: 'flat' },
    validate: {
      name: (v) => v ? null : 'Required',
      price: (v) => (v !== null && v !== undefined && v >= 0) ? null : 'Required',
    },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({ name: record.name, price: Number(record.price), charge_type: record.charge_type });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? api.put(`/v1/amenities/${editing.id}/`, values)
      : api.post('/v1/amenities/', values),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.amenities); close(); notifySuccess('Saved.'); },
    onError: () => notifyError('Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/amenities/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.amenities); notifySuccess('Deleted.'); },
    onError: () => notifyError('Failed to delete. Amenity may be in use.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete amenity',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const rows = data.map((item) => (
    <Table.Tr key={item.id}>
      <Table.Td>{item.name}</Table.Td>
      <Table.Td>₹{item.price}</Table.Td>
      <Table.Td>
        <Badge variant="light" color={item.charge_type === 'per_night' ? 'blue' : 'gray'}>
          {item.charge_type === 'per_night' ? 'Per Night' : 'Flat'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(item)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(item.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Amenity</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Charge Type</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">No amenities yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Amenity' : 'Add Amenity'}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Name" {...form.getInputProps('name')} mb="sm" required />
          <NumberInput label="Price" {...form.getInputProps('price')} mb="sm" min={0} required />
          <Select
            label="Charge Type"
            data={[
              { value: 'flat', label: 'Flat' },
              { value: 'per_night', label: 'Per Night' },
            ]}
            {...form.getInputProps('charge_type')}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
