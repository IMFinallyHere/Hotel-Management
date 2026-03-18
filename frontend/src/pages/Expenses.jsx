import { useState } from 'react';
import { Table, Button, Badge, Group, Text, Modal, NumberInput, TextInput, Select, Stack } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS_OPS, fetchExpenses } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';

const PAYMENT_TYPE_COLORS = { cash: 'green', upi: 'blue', card: 'violet', other: 'gray' };

export default function Expenses() {
  const qc = useQueryClient();
  const [dateFilter, setDateFilter] = useState(new Date());
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);

  const dateStr = dayjs(dateFilter).format('YYYY-MM-DD');
  const queryParams = { date: dateStr };

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.expenses(queryParams),
    queryFn: () => fetchExpenses(queryParams),
  });

  const form = useForm({
    initialValues: {
      description: '',
      amount: 0,
      payment_type: null,
      date: new Date(),
    },
    validate: {
      description: (v) => v.trim() ? null : 'Required',
      amount: (v) => v > 0 ? null : 'Amount must be greater than 0',
      payment_type: (v) => v ? null : 'Required',
    },
  });

  const openAdd = () => {
    setEditing(null);
    form.setValues({ description: '', amount: 0, payment_type: null, date: new Date() });
    open();
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setValues({
      description: record.description,
      amount: Number(record.amount),
      payment_type: record.payment_type,
      date: new Date(record.date),
    });
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const payload = {
        ...values,
        date: dayjs(values.date).format('YYYY-MM-DD'),
      };
      return editing
        ? api.put(`/v1/expenses/${editing.id}/`, payload)
        : api.post('/v1/expenses/', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      close();
      notifySuccess('Saved.');
    },
    onError: () => notifyError('Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/expenses/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notifySuccess('Deleted.');
    },
    onError: () => notifyError('Failed to delete.'),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete expense',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const totalForDay = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const rows = expenses.map((exp) => (
    <Table.Tr key={exp.id}>
      <Table.Td>{exp.date}</Table.Td>
      <Table.Td>{exp.description}</Table.Td>
      <Table.Td>₹{exp.amount}</Table.Td>
      <Table.Td>
        <Badge color={PAYMENT_TYPE_COLORS[exp.payment_type]} variant="light">
          {exp.payment_type.toUpperCase()}
        </Badge>
      </Table.Td>
      <Table.Td>{exp.recorded_by_name ?? '—'}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => openEdit(exp)}>Edit</Button>
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(exp.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md" justify="space-between">
        <Group>
          <DatePickerInput
            label="Date"
            value={dateFilter}
            onChange={setDateFilter}
            w={180}
          />
          {expenses.length > 0 && (
            <Text size="sm" c="dimmed" mt="xl">Total: <strong>₹{totalForDay}</strong></Text>
          )}
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd} mt="xl">
          Add Expense
        </Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Recorded By</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={6} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={6} ta="center">No expenses for this date.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Expense' : 'Add Expense'}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Description" {...form.getInputProps('description')} required />
            <NumberInput label="Amount (₹)" min={1} {...form.getInputProps('amount')} required />
            <Select
              label="Payment Type"
              data={[
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI' },
                { value: 'card', label: 'Card' },
                { value: 'other', label: 'Other' },
              ]}
              {...form.getInputProps('payment_type')}
              required
            />
            <DatePickerInput
              label="Date"
              {...form.getInputProps('date')}
              required
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>Cancel</Button>
              <Button type="submit" loading={saveMutation.isPending}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
