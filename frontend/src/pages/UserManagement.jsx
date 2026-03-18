import { useState } from 'react';
import { Table, Button, Modal, TextInput, PasswordInput, Switch, MultiSelect, Group, Text, Badge } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchUsers, fetchGroups } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

export default function UserManagement() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers });
  const { data: groups = [] } = useQuery({ queryKey: QUERY_KEYS.groups, queryFn: fetchGroups });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const groupOptions = groups.map(g => ({ value: String(g.id), label: g.name }));

  const form = useForm({
    initialValues: { username: '', email: '', first_name: '', last_name: '', password: '', is_active: true, is_staff: false, is_superuser: false, groups: [] },
    validate: {
      username: (v) => v ? null : 'Required',
      password: (v, values, path) => {
        if (!editing && !v) return 'Required for new users';
        return null;
      },
    },
  });

  const openAdd = () => { setEditing(null); form.reset(); form.setFieldValue('is_active', true); open(); };
  const openEdit = (user) => {
    setEditing(user);
    form.setValues({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      password: '',
      is_active: user.is_active,
      is_staff: user.is_staff,
      is_superuser: user.is_superuser,
      groups: (user.groups_detail || []).map(g => String(g.id)),
    });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const payload = { ...values, groups: values.groups.map(Number) };
      if (!payload.password) delete payload.password;
      return editing
        ? api.put(`/v1/users/${editing.id}/`, payload)
        : api.post('/v1/users/', payload);
    },
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.users); close(); notifySuccess('User saved.'); },
    onError: (err) => {
      const data = err.response?.data;
      const msg = data ? (typeof data === 'string' ? data : Object.values(data).flat().join(' ')) : 'Failed to save.';
      notifyError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/users/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.users); notifySuccess('User deactivated.'); },
    onError: (err) => {
      const data = err.response?.data;
      const msg = data ? (typeof data === 'string' ? data : Object.values(data).flat().join(' ')) : 'Failed to delete.';
      notifyError(msg);
    },
  });

  const handleDelete = (user) => modals.openConfirmModal({
    title: 'Deactivate user',
    children: <Text size="sm">This will deactivate <b>{user.username}</b>. Continue?</Text>,
    labels: { confirm: 'Deactivate', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(user.id),
  });

  const rows = users.map((u) => (
    <Table.Tr key={u.id}>
      <Table.Td>{u.username}</Table.Td>
      <Table.Td>{u.email}</Table.Td>
      <Table.Td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</Table.Td>
      <Table.Td><Badge color={u.is_active ? 'teal' : 'gray'}>{u.is_active ? 'Yes' : 'No'}</Badge></Table.Td>
      <Table.Td><Badge color={u.is_staff ? 'blue' : 'gray'}>{u.is_staff ? 'Yes' : 'No'}</Badge></Table.Td>
      <Table.Td><Badge color={u.is_superuser ? 'violet' : 'gray'}>{u.is_superuser ? 'Yes' : 'No'}</Badge></Table.Td>
      <Table.Td>{(u.groups_detail || []).map(g => <Badge key={g.id} variant="light" mr={4}>{g.name}</Badge>)}</Table.Td>
      <Table.Td>{u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '—'}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(u)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(u)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add User</Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Username</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Active</Table.Th>
            <Table.Th>Staff</Table.Th>
            <Table.Th>Superuser</Table.Th>
            <Table.Th>Groups</Table.Th>
            <Table.Th>Joined</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={9} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={9} ta="center">No users found.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit User' : 'Add User'} size="lg">
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Username" {...form.getInputProps('username')} mb="sm" required />
          <TextInput label="Email" {...form.getInputProps('email')} mb="sm" />
          <TextInput label="First Name" {...form.getInputProps('first_name')} mb="sm" />
          <TextInput label="Last Name" {...form.getInputProps('last_name')} mb="sm" />
          <PasswordInput
            label="Password"
            {...form.getInputProps('password')}
            mb="sm"
            required={!editing}
            placeholder={editing ? 'Leave blank to keep current' : ''}
          />
          <Switch label="Active" {...form.getInputProps('is_active', { type: 'checkbox' })} mb="sm" />
          <Switch label="Staff status" {...form.getInputProps('is_staff', { type: 'checkbox' })} mb="sm" />
          <Switch label="Superuser" {...form.getInputProps('is_superuser', { type: 'checkbox' })} mb="sm" />
          <MultiSelect
            label="Groups"
            data={groupOptions}
            searchable
            {...form.getInputProps('groups')}
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
