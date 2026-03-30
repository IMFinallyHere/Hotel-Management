import { useState, useEffect } from 'react';
import { Group, Button, MultiSelect, Modal, TextInput, Select, Text, FileInput, Grid, NumberInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconUserPlus, IconUpload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchAllCustomers, fetchCountryCodes } from '../api/queries';
import { compressImage } from '../utils/imageUtils';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

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
      age: null,
      address: '',
      pincode: '',
      identity_card_1: null,
      identity_card_2: null,
    },
    validate: {
      name: (v) => {
        if (!v || !v.trim()) return 'Required';
        if (!/^[A-Za-z\s]+$/.test(v.trim())) return 'Name must contain only letters';
        return null;
      },
      number: (v) => {
        if (!v || !v.trim()) return 'Required';
        if (!/^\d+$/.test(v)) return 'Phone must contain only digits';
        return null;
      },
      country_code: (v) => v ? null : 'Required',
      gender: (v) => v ? null : 'Required',
      pincode: (v) => {
        if (v && !/^\d+$/.test(v)) return 'Pincode must contain only digits';
        return null;
      },
      identity_card_1: (v) => v ? null : 'Required',
      identity_card_2: (v) => v ? null : 'Required',
    },
  });

  // Default country code to India (+91) when codes load
  useEffect(() => {
    if (countryCodes.length > 0 && !form.values.country_code) {
      const india = countryCodes.find(c => c.country_code === 91);
      if (india) form.setFieldValue('country_code', String(india.id));
    }
  }, [countryCodes]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const card1 = values.identity_card_1 instanceof File ? await compressImage(values.identity_card_1) : null;
      const card2 = values.identity_card_2 instanceof File ? await compressImage(values.identity_card_2) : null;
      const fd = new FormData();
      fd.append('name', values.name.trim());
      fd.append('number', values.number.trim());
      fd.append('country_code', parseInt(values.country_code));
      fd.append('gender', values.gender);
      if (values.dob) {
        fd.append('date_of_birth', dayjs(values.dob).format('YYYY-MM-DD'));
      } else if (values.age !== null && values.age !== undefined) {
        fd.append('age', values.age);
      }
      if (values.address.trim()) fd.append('address', values.address.trim());
      if (values.pincode.trim()) fd.append('pincode', values.pincode.trim());
      if (card1) fd.append('identity_card_1', card1);
      if (card2) fd.append('identity_card_2', card2);
      const { data } = await api.post('/v1/customers/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.customers });
      notifySuccess(`Customer "${data.name}" added.`);
      onAdded(data);
      handleClose();
    } catch (e) {
      notifyError(parseApiError(e, 'Failed to add customer.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add New Customer" zIndex={300} size="xl">
      <form onSubmit={form.onSubmit(handleSubmit)}>
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
              data={countryCodes.map(c => ({ value: String(c.id), label: `+${c.country_code} ${c.country_name}` }))}
              searchable
              {...form.getInputProps('country_code')}
              required
            />
          </Grid.Col>

          {/* Row 3: DOB | Age */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <DatePickerInput
              label="Date of Birth"
              {...form.getInputProps('dob')}
              clearable
              onChange={(date) => {
                form.setFieldValue('dob', date);
                form.setFieldValue('age', date ? dayjs().diff(dayjs(date), 'year') : null);
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Age"
              min={0}
              max={120}
              disabled={!!form.values.dob}
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
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <FileInput
              label="Identity Card 2"
              leftSection={<IconUpload size={14} />}
              accept=".pdf,.jpg,.jpeg,.png"
              {...form.getInputProps('identity_card_2')}
              required
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
