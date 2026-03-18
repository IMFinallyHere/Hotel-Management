import { useState } from 'react';
import { Table, Button, Modal, TextInput, Textarea, Group, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchConfigurations } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

export default function Configurations() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.configurations, queryFn: fetchConfigurations });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { key: '', value: '' },
    validate: { key: (v) => v ? null : 'Required' },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({ key: record.key, value: record.value ?? '' });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? api.put(`/v1/configurations/${editing.id}/`, values)
      : api.post('/v1/configurations/', values),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.configurations); close(); notifySuccess('Saved.'); },
    onError: () => notifyError('Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/configurations/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.configurations); notifySuccess('Deleted.'); },
    onError: () => notifyError('Failed to delete.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete configuration',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const rows = data.map((cfg) => (
    <Table.Tr key={cfg.id}>
      <Table.Td>{cfg.key}</Table.Td>
      <Table.Td>{cfg.value ?? '—'}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(cfg)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(cfg.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Configuration</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Value</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">No configurations yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Configuration' : 'Add Configuration'}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Key" {...form.getInputProps('key')} mb="sm" required />
          <Textarea label="Value" {...form.getInputProps('value')} rows={3} mb="md" />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
