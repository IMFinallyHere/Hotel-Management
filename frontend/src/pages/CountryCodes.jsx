import { useState } from 'react';
import { Table, Button, Modal, TextInput, NumberInput, Group, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchCountryCodes } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

export default function CountryCodes() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd    = permissions.add_countrycodes    || permissions.is_superuser;
  const canChange = permissions.change_countrycodes || permissions.is_superuser;
  const canDelete = permissions.delete_countrycodes || permissions.is_superuser;
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { country_name: '', country_code: 1 },
    validate: {
      country_name: (v) => v ? null : 'Required',
      country_code: (v) => (v >= 1) ? null : 'Must be positive',
    },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({ country_name: record.country_name, country_code: record.country_code });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? api.put(`/v1/country/codes/${editing.id}/`, values)
      : api.post('/v1/country/codes/', values),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.countryCodes); close(); notifySuccess('Saved.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/country/codes/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.countryCodes); notifySuccess('Deleted.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete country code',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const rows = data.map((cc) => (
    <Table.Tr key={cc.id}>
      <Table.Td>{cc.country_name}</Table.Td>
      <Table.Td>+{cc.country_code}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canChange && <Button size="xs" variant="light" onClick={() => openEdit(cc)}>Edit</Button>}
          {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(cc.id)}>Delete</Button>}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        {canAdd && <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Country Code</Button>}
      </Group>

      <Table.ScrollContainer minWidth={400}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Country Name</Table.Th>
            <Table.Th>Code</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={3} ta="center">No country codes yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Country Code' : 'Add Country Code'} size={{ base: '95%', sm: 'lg' }}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Country Name" {...form.getInputProps('country_name')} mb="sm" required />
          <NumberInput label="Dialing Code" min={1} max={999} {...form.getInputProps('country_code')} mb="md" required />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
