import { useState } from 'react';
import { Table, Button, Modal, TextInput, Switch, Group, Text, Badge } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchExpenseCategories } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

export default function ExpenseCategories() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd    = permissions.add_expensecategory    || permissions.is_superuser;
  const canChange = permissions.change_expensecategory || permissions.is_superuser;
  const canDelete = permissions.delete_expensecategory || permissions.is_superuser;

  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.expenseCategories, queryFn: () => fetchExpenseCategories() });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: { name: '', is_active: true },
    validate: {
      name: (v) => v.trim() ? null : 'Required',
    },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({ name: record.name, is_active: record.is_active });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? api.put(`/v1/expense-categories/${editing.id}/`, values)
      : api.post('/v1/expense-categories/', values),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.expenseCategories }); close(); notifySuccess('Saved.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/expense-categories/${id}/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.expenseCategories }); notifySuccess('Deleted.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete. Category may be in use.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete expense category',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const rows = data.map((item) => (
    <Table.Tr key={item.id}>
      <Table.Td>{item.name}</Table.Td>
      <Table.Td>
        <Badge variant="light" color={item.is_active ? 'teal' : 'gray'}>
          {item.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canChange && <Button size="xs" variant="light" onClick={() => openEdit(item)}>Edit</Button>}
          {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(item.id)}>Delete</Button>}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        {canAdd && <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Category</Button>}
      </Group>

      <Table.ScrollContainer minWidth={400}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={3} ta="center">Loading...</Table.Td></Table.Tr>
            ) : rows.length === 0 ? (
              <Table.Tr><Table.Td colSpan={3} ta="center">No expense categories yet.</Table.Td></Table.Tr>
            ) : rows}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Category' : 'Add Category'} size={{ base: '95%', sm: 'sm' }}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Name" {...form.getInputProps('name')} mb="sm" required />
          <Switch
            label="Active"
            checked={form.values.is_active}
            onChange={(e) => form.setFieldValue('is_active', e.currentTarget.checked)}
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
