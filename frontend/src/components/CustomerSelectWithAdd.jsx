import { useState } from 'react';
import { Group, Button, MultiSelect, Modal, TextInput, Select, Text, FileInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconUserPlus, IconUpload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchAllCustomers, fetchCountryCodes } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

function CustomerAddModal({ opened, onClose, onAdded }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: countryCodes = [] } = useQuery({
    queryKey: QUERY_KEYS.countryCodes,
    queryFn: fetchCountryCodes,
    enabled: opened,
  });

  const form = useForm({
    initialValues: {
      name: '',
      number: '',
      country_code: null,
      gender: null,
      dob: null,
      address: '',
      pincode: '',
      identity_card_1: null,
      identity_card_2: null,
    },
    validate: {
      name: (v) => v.trim() ? null : 'Required',
      number: (v) => v.trim() ? null : 'Required',
      country_code: (v) => v ? null : 'Required',
      gender: (v) => v ? null : 'Required',
    },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', values.name.trim());
      fd.append('number', values.number.trim());
      fd.append('country_code', parseInt(values.country_code));
      fd.append('gender', values.gender);
      if (values.dob) fd.append('date_of_birth', dayjs(values.dob).format('YYYY-MM-DD'));
      if (values.address.trim()) fd.append('address', values.address.trim());
      if (values.pincode.trim()) fd.append('pincode', values.pincode.trim());
      if (values.identity_card_1 instanceof File) fd.append('identity_card_1', values.identity_card_1);
      if (values.identity_card_2 instanceof File) fd.append('identity_card_2', values.identity_card_2);
      const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.customers });
      notifySuccess(`Customer "${data.name}" added.`);
      onAdded(data);
      handleClose();
    } catch (e) {
      const errors = e.response?.data;
      const msg = typeof errors === 'object' ? Object.values(errors).flat().join(' ') : 'Failed to add customer.';
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add New Customer" zIndex={300} size="lg">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <TextInput label="Full Name" {...form.getInputProps('name')} mb="sm" required />
        <TextInput label="Phone Number" {...form.getInputProps('number')} mb="sm" required />
        <Select
          label="Country Code"
          data={countryCodes.map(c => ({ value: String(c.id), label: `+${c.country_code} (${c.country_name})` }))}
          searchable
          {...form.getInputProps('country_code')}
          mb="sm"
          required
        />
        <Select
          label="Gender"
          data={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'trans', label: 'Trans' },
            { value: 'other', label: 'Other' },
          ]}
          {...form.getInputProps('gender')}
          mb="sm"
          required
        />
        <DatePickerInput label="Date of Birth (optional)" {...form.getInputProps('dob')} mb="sm" clearable />
        <TextInput label="Address (optional)" {...form.getInputProps('address')} mb="sm" />
        <TextInput label="Pincode (optional)" {...form.getInputProps('pincode')} mb="sm" />
        <FileInput
          label="Identity Card 1 (optional)"
          leftSection={<IconUpload size={14} />}
          accept=".pdf,.jpg,.jpeg,.png"
          {...form.getInputProps('identity_card_1')}
          mb="sm"
        />
        <FileInput
          label="Identity Card 2 (optional)"
          leftSection={<IconUpload size={14} />}
          accept=".pdf,.jpg,.jpeg,.png"
          {...form.getInputProps('identity_card_2')}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Add Customer</Button>
        </Group>
      </form>
    </Modal>
  );
}

export default function CustomerSelectWithAdd({
  value = [],
  onChange,
  maxValues,
  label = 'Customers',
  required = false,
  helperText = null,
  error = null,
  excludeIds = [],
}) {
  const [modalOpened, setModalOpened] = useState(false);
  const { data: allCustomers = [] } = useQuery({ queryKey: QUERY_KEYS.customers, queryFn: fetchAllCustomers });

  const handleAdded = (newCustomer) => {
    onChange([...(value || []), String(newCustomer.id)]);
  };

  const excludeSet = new Set(excludeIds.map(String));
  const selectData = allCustomers
    .filter(c => !excludeSet.has(String(c.id)))
    .map(c => ({ value: String(c.id), label: `${c.name} (${c.number})` }));

  return (
    <div>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <MultiSelect
          label={label}
          data={selectData}
          searchable
          value={value}
          onChange={onChange}
          maxValues={maxValues}
          required={required}
          error={error}
          style={{ flex: 1 }}
        />
        <Button
          leftSection={<IconUserPlus size={14} />}
          variant="light"
          size="sm"
          onClick={() => setModalOpened(true)}
          style={{ marginBottom: error ? 22 : 0 }}
        >
          New
        </Button>
      </Group>
      {helperText && <Text size="xs" c="dimmed" mt={4}>{helperText}</Text>}
      <CustomerAddModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onAdded={handleAdded}
      />
    </div>
  );
}
