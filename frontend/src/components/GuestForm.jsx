import { Grid, TextInput, Select, NumberInput, FileInput, Text, Loader, Autocomplete } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconUpload } from '@tabler/icons-react';
import dayjs from 'dayjs';

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Other' },
];

export function createEmptyGuest(countryCodeId = null) {
  return {
    _key: Date.now() + Math.random(),
    name: '', number: '', country_code: countryCodeId,
    gender: null, date_of_birth: null, age: null,
    address: '', pincode: '',
    identity_card_1: null, identity_card_2: null,
    errors: {},
    searchResults: [], searchLoading: false, selectedCustomerId: null,
  };
}

export default function GuestForm({ row, isMain, onChange, onSelectCustomer }) {
  const autocompleteData = row.searchResults.map(c => ({
    value: String(c.id),
    label: `${c.name}${c.number ? ` — ${c.number}` : ''}`,
  }));

  return (
    <Grid gutter="sm">
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Autocomplete
          label="Phone Number" maxLength={10} value={row.number}
          required={isMain} error={row.errors.number}
          onChange={(val) => onChange('number', val)}
          onOptionSubmit={(val) => onSelectCustomer && onSelectCustomer(val)}
          data={autocompleteData}
          rightSection={row.searchLoading ? <Loader size="xs" /> : null}
          filter={({ options }) => options}
          onKeyDown={(e) => {
            if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Full Name" value={row.name} required error={row.errors.name}
          onChange={(e) => onChange('name', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (!/^[A-Za-z\s]$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key))
              e.preventDefault();
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Select label="Gender" data={GENDER_OPTIONS} value={row.gender} onChange={(v) => onChange('gender', v)} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <DatePickerInput
          label="Date of Birth" value={row.date_of_birth} clearable
          onChange={(date) => {
            onChange('date_of_birth', date);
            onChange('age', date ? dayjs().diff(dayjs(date), 'year') : null);
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <NumberInput label="Age" min={0} max={120} disabled={!!row.date_of_birth}
          value={row.age ?? ''} onChange={(v) => onChange('age', v === '' ? null : v)} />
      </Grid.Col>
      <Grid.Col span={12}>
        {row.selectedCustomerId ? (
          <Text size="sm" c="dimmed">Identity cards already on file — no re-upload needed.</Text>
        ) : (
          <>
            <FileInput
              label="Identity Card (1 required, 2nd optional)"
              leftSection={<IconUpload size={14} />}
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              value={[row.identity_card_1, row.identity_card_2].filter(Boolean)}
              required
              error={row.errors.identity_card_1}
              onChange={(files) => {
                onChange('identity_card_1', files[0] ?? null);
                onChange('identity_card_2', files[1] ?? null);
              }}
            />
            {(row.identity_card_1 || row.identity_card_2) && (
              <Text size="xs" c="dimmed" mt={4}>
                {[row.identity_card_1?.name, row.identity_card_2?.name].filter(Boolean).join(' • ')}
              </Text>
            )}
          </>
        )}
      </Grid.Col>
    </Grid>
  );
}
