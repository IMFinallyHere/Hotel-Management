import { useState, useEffect } from 'react';
import { Table, Button, Modal, TextInput, Select, FileInput, Group, Text, Grid, NumberInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconUpload, IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchAllCustomers, fetchCountryCodes } from '../api/queries';
import { compressImage } from '../utils/imageUtils';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

export default function Customers() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd    = permissions.add_customers    || permissions.is_superuser;
  const canChange = permissions.change_customers || permissions.is_superuser;
  const canDelete = permissions.delete_customers || permissions.is_superuser;
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.customers, queryFn: fetchAllCustomers });
  const { data: codes = [] } = useQuery({ queryKey: QUERY_KEYS.countryCodes, queryFn: fetchCountryCodes });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const form = useForm({
    initialValues: {
      name: '',
      country_code: null,
      number: '',
      gender: null,
      date_of_birth: null,
      age: null,
      address: '',
      pincode: '',
      identity_card_1: null,
      identity_card_2: null,
    },
    validate: {
      name: (v) => {
        if (!v) return 'Required';
        if (!/^[A-Za-z\s]+$/.test(v.trim())) return 'Name must contain only letters';
        return null;
      },
      country_code: (v) => v ? null : 'Required',
      number: (v) => {
        if (!v) return 'Required';
        if (!/^\d+$/.test(v)) return 'Phone must contain only digits';
        return null;
      },
      gender: (v) => v ? null : 'Required',
      pincode: (v) => {
        if (v && !/^\d+$/.test(v)) return 'Pincode must contain only digits';
        return null;
      },
      identity_card_1: (v) => (!editing && !v) ? 'Required' : null,
      identity_card_2: (v) => (!editing && !v) ? 'Required' : null,
    },
  });

  // Default country code to India (+91) when codes load
  useEffect(() => {
    if (codes.length > 0 && !form.values.country_code) {
      const india = codes.find(c => c.country_code === 91);
      if (india) form.setFieldValue('country_code', String(india.id));
    }
  }, [codes]);

  const openAdd = () => { setEditing(null); form.reset(); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({
      name: record.name,
      country_code: record.country_code ? String(record.country_code) : null,
      number: record.number ?? '',
      gender: record.gender,
      date_of_birth: record.date_of_birth ? new Date(record.date_of_birth) : null,
      age: record.date_of_birth
        ? dayjs().diff(dayjs(record.date_of_birth), 'year')
        : (record.age ?? null),
      address: record.address ?? '',
      pincode: record.pincode ?? '',
      identity_card_1: null,
      identity_card_2: null,
    });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const card1 = values.identity_card_1 instanceof File ? await compressImage(values.identity_card_1) : null;
      const card2 = values.identity_card_2 instanceof File ? await compressImage(values.identity_card_2) : null;
      const fd = new FormData();
      fd.append('name', values.name);
      fd.append('country_code', parseInt(values.country_code));
      fd.append('number', values.number);
      fd.append('gender', values.gender);
      if (values.date_of_birth) {
        fd.append('date_of_birth', dayjs(values.date_of_birth).format('YYYY-MM-DD'));
      } else if (values.age !== null && values.age !== undefined) {
        fd.append('age', values.age);
      }
      if (values.address) fd.append('address', values.address);
      if (values.pincode) fd.append('pincode', values.pincode);
      if (card1) fd.append('identity_card_1', card1);
      if (card2) fd.append('identity_card_2', card2);
      return editing
        ? api.patch(`/v1/customers/${editing.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.customers); close(); notifySuccess('Saved.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/customers/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.customers); notifySuccess('Deleted.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete customer',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const codeMap = Object.fromEntries(codes.map(c => [c.id, `+${c.country_code} ${c.country_name}`]));

  const rows = data.map((customer) => (
    <Table.Tr key={customer.id}>
      <Table.Td>{customer.name}</Table.Td>
      <Table.Td>{codeMap[customer.country_code] ?? ''} {customer.number ?? '—'}</Table.Td>
      <Table.Td>{customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : '—'}</Table.Td>
      <Table.Td>
        {customer.date_of_birth
          ? `${customer.date_of_birth} (${dayjs().diff(dayjs(customer.date_of_birth), 'year')} yrs)`
          : customer.age ? `${customer.age} yrs` : '—'}
      </Table.Td>
      <Table.Td>{customer.address || '—'}</Table.Td>
      <Table.Td>{customer.pincode || '—'}</Table.Td>
      <Table.Td>
        {customer.identity_card_1
          ? <Button size="xs" variant="subtle" component="a" href={customer.identity_card_1} target="_blank">ID 1</Button>
          : '—'}
        {customer.identity_card_2
          ? <Button size="xs" variant="subtle" component="a" href={customer.identity_card_2} target="_blank">ID 2</Button>
          : ''}
      </Table.Td>
      <Table.Td>{new Date(customer.first_visit).toLocaleDateString()}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canChange && <Button size="xs" variant="light" onClick={() => openEdit(customer)}>Edit</Button>}
          {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(customer.id)}>Delete</Button>}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md" wrap="wrap">
        {canAdd && <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Customer</Button>}
      </Group>

      <Table.ScrollContainer minWidth={600}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Phone</Table.Th>
            <Table.Th>Gender</Table.Th>
            <Table.Th>DOB / Age</Table.Th>
            <Table.Th>Address</Table.Th>
            <Table.Th>Pincode</Table.Th>
            <Table.Th>ID Cards</Table.Th>
            <Table.Th>First Visit</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={9} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={9} ta="center">No customers yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Customer' : 'Add Customer'} size="xl">
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <Grid gutter="sm">
            {/* Row 1: Full Name | Phone Number */}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Full Name"
                {...form.getInputProps('name')}
                required
                onKeyDown={(e) => {
                  if (!/^[A-Za-z\s]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
                    e.preventDefault();
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Phone Number"
                maxLength={10}
                {...form.getInputProps('number')}
                required
                onKeyDown={(e) => {
                  if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
                    e.preventDefault();
                }}
              />
            </Grid.Col>

            {/* Row 2: Gender | Country Code */}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select label="Gender" data={GENDER_OPTIONS} {...form.getInputProps('gender')} required />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Country Code"
                data={codes.map(c => ({ value: String(c.id), label: `+${c.country_code} ${c.country_name}` }))}
                searchable
                {...form.getInputProps('country_code')}
                required
              />
            </Grid.Col>

            {/* Row 3: DOB | Age */}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <DatePickerInput
                label="Date of Birth"
                {...form.getInputProps('date_of_birth')}
                clearable
                onChange={(date) => {
                  form.setFieldValue('date_of_birth', date);
                  form.setFieldValue('age', date ? dayjs().diff(dayjs(date), 'year') : null);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Age"
                min={0}
                max={120}
                disabled={!!form.values.date_of_birth}
                {...form.getInputProps('age')}
              />
            </Grid.Col>

            {/* Row 4: Identity Card 1 | Identity Card 2 */}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <FileInput
                label="Identity Card 1"
                leftSection={<IconUpload size={14} />}
                accept=".pdf,.jpg,.jpeg,.png"
                {...form.getInputProps('identity_card_1')}
                required={!editing}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <FileInput
                label="Identity Card 2"
                leftSection={<IconUpload size={14} />}
                accept=".pdf,.jpg,.jpeg,.png"
                {...form.getInputProps('identity_card_2')}
                required={!editing}
              />
            </Grid.Col>

            {/* Row 5: Address (full width) */}
            <Grid.Col span={12}>
              <TextInput label="Address" {...form.getInputProps('address')} />
            </Grid.Col>

            {/* Row 6: Pincode (full width) */}
            <Grid.Col span={12}>
              <TextInput
                label="Pincode"
                maxLength={6}
                {...form.getInputProps('pincode')}
                onKeyDown={(e) => {
                  if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
                    e.preventDefault();
                }}
              />
            </Grid.Col>
          </Grid>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>Save</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
