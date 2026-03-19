import { useState } from 'react';
import { Table, Button, Modal, TextInput, Group, Text, Badge, Checkbox, Accordion, Box } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { QUERY_KEYS, fetchGroups, fetchPermissions } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

function groupPermissionsByCategory(permissions) {
  const categories = {};
  for (const perm of permissions) {
    const key = `${perm.app_label} - ${perm.model}`;
    if (!categories[key]) categories[key] = [];
    categories[key].push(perm);
  }
  return categories;
}

export default function GroupManagement() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd    = permissions.add_group    || permissions.is_superuser;
  const canChange = permissions.change_group || permissions.is_superuser;
  const canDelete = permissions.delete_group || permissions.is_superuser;
  const { data: groups = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.groups, queryFn: fetchGroups });
  const { data: allPermissions = [] } = useQuery({ queryKey: QUERY_KEYS.permissions, queryFn: fetchPermissions });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const categories = groupPermissionsByCategory(allPermissions);

  const form = useForm({
    initialValues: { name: '', permissions: [] },
    validate: { name: (v) => v ? null : 'Required' },
  });

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (group) => {
    setEditing(group);
    form.setValues({
      name: group.name,
      permissions: group.permissions.map(String),
    });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const payload = { ...values, permissions: values.permissions.map(Number) };
      return editing
        ? api.put(`/v1/groups/${editing.id}/`, payload)
        : api.post('/v1/groups/', payload);
    },
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.groups); close(); notifySuccess('Group saved.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save group.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/groups/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.groups); notifySuccess('Group deleted.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete group.')),
  });

  const handleDelete = (group) => modals.openConfirmModal({
    title: 'Delete group',
    children: (
      <Text size="sm">
        Delete <b>{group.name}</b>?
        {group.user_count > 0 && <> This group has {group.user_count} user(s) assigned.</>}
      </Text>
    ),
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(group.id),
  });

  const toggleCategory = (categoryPerms) => {
    const ids = categoryPerms.map(p => String(p.id));
    const current = form.values.permissions;
    const allSelected = ids.every(id => current.includes(id));
    if (allSelected) {
      form.setFieldValue('permissions', current.filter(id => !ids.includes(id)));
    } else {
      form.setFieldValue('permissions', [...new Set([...current, ...ids])]);
    }
  };

  const rows = groups.map((g) => (
    <Table.Tr key={g.id}>
      <Table.Td>{g.name}</Table.Td>
      <Table.Td><Badge variant="light">{g.user_count}</Badge></Table.Td>
      <Table.Td><Badge variant="light">{g.permissions.length}</Badge></Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canChange && <Button size="xs" variant="light" onClick={() => openEdit(g)}>Edit</Button>}
          {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(g)}>Delete</Button>}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        {canAdd && <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Group</Button>}
      </Group>

      <Table.ScrollContainer minWidth={500}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Users</Table.Th>
            <Table.Th>Permissions</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">No groups yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Group' : 'Add Group'} size={{ base: '95%', sm: 'xl' }}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <TextInput label="Name" {...form.getInputProps('name')} mb="md" required />

          <Text fw={500} mb="xs">Permissions</Text>
          <Accordion multiple variant="separated">
            {Object.entries(categories).map(([category, perms]) => {
              const ids = perms.map(p => String(p.id));
              const selectedCount = ids.filter(id => form.values.permissions.includes(id)).length;
              const allSelected = selectedCount === ids.length;

              return (
                <Accordion.Item key={category} value={category}>
                  <Accordion.Control>
                    <Group justify="space-between" pr="md">
                      <Text size="sm" tt="capitalize">{category}</Text>
                      <Badge size="sm" variant="light">{selectedCount}/{ids.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Checkbox
                      label="Select all"
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      onChange={() => toggleCategory(perms)}
                      mb="xs"
                      fw={500}
                    />
                    <Box pl="md">
                      {perms.map(perm => (
                        <Checkbox
                          key={perm.id}
                          label={perm.name}
                          checked={form.values.permissions.includes(String(perm.id))}
                          onChange={(e) => {
                            const id = String(perm.id);
                            const current = form.values.permissions;
                            if (e.currentTarget.checked) {
                              form.setFieldValue('permissions', [...current, id]);
                            } else {
                              form.setFieldValue('permissions', current.filter(v => v !== id));
                            }
                          }}
                          mb={4}
                        />
                      ))}
                    </Box>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
