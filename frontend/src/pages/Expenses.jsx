import { useState } from 'react';
import {
  Table, Button, Badge, Group, Text, Modal, NumberInput, TextInput,
  Select, Stack, FileInput, ActionIcon, Anchor, Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus, IconUpload, IconTrash, IconPaperclip, IconEye } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, QUERY_KEYS_OPS, fetchExpenses, fetchPaymentMethods, fetchExpenseCategories } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import { compressImage } from '../utils/imageUtils';
import usePermissions from '../hooks/usePermissions';

const CREATE_CATEGORY_VALUE = '__create__';

export default function Expenses() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd = permissions.add_expense || permissions.is_superuser;
  const canChange = permissions.change_expense || permissions.is_superuser;
  const canDelete = permissions.delete_expense || permissions.is_superuser;
  const canCreateCategory = permissions.add_expensecategory || permissions.is_superuser;

  const [dateFilter, setDateFilter] = useState(new Date());
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);
  const [newFiles, setNewFiles] = useState([]);
  const [savingFiles, setSavingFiles] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  const dateStr = dayjs(dateFilter).format('YYYY-MM-DD');
  const queryParams = { date: dateStr };

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS_OPS.expenses(queryParams),
    queryFn: () => fetchExpenses(queryParams),
  });
  const { data: paymentMethods = [] } = useQuery({ queryKey: QUERY_KEYS.paymentMethods, queryFn: () => fetchPaymentMethods() });
  const pmOptions = paymentMethods.filter(p => p.is_active).map(p => ({ value: String(p.id), label: p.name }));
  const pmMap = Object.fromEntries(paymentMethods.map(p => [p.id, p.name]));

  const { data: categories = [] } = useQuery({ queryKey: QUERY_KEYS.expenseCategories, queryFn: () => fetchExpenseCategories() });
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  let catOptions = categories.filter(c => c.is_active).map(c => ({ value: String(c.id), label: c.name }));
  const searchMatchesExisting = categories.some(c => c.name.toLowerCase() === categorySearch.trim().toLowerCase());
  if (canCreateCategory && categorySearch.trim() && !searchMatchesExisting) {
    catOptions = [...catOptions, { value: CREATE_CATEGORY_VALUE, label: `+ Create "${categorySearch.trim()}"` }];
  }

  const createCategoryMutation = useMutation({
    mutationFn: (name) => api.post('/v1/expense-categories/', { name, is_active: true }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.expenseCategories });
      form.setFieldValue('category', String(res.data.id));
      notifySuccess('Category created.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to create category.')),
  });

  const today = new Date();

  const form = useForm({
    initialValues: { description: '', amount: 0, category: null, payment_method: null, date: today },
    validate: {
      amount: (v) => v > 0 ? null : 'Amount must be greater than 0',
      category: (v) => v ? null : 'Required',
      payment_method: (v) => v ? null : 'Required',
    },
  });

  const handleCategoryChange = (value) => {
    if (value === CREATE_CATEGORY_VALUE) {
      createCategoryMutation.mutate(categorySearch.trim());
      return;
    }
    form.setFieldValue('category', value);
  };

  const openAdd = () => {
    setEditing(null);
    setNewFiles([]);
    setCategorySearch('');
    form.setValues({ description: '', amount: 0, category: null, payment_method: null, date: today });
    open();
  };

  const openEdit = (record) => {
    setEditing(record);
    setNewFiles([]);
    setCategorySearch('');
    form.setValues({
      description: record.description,
      amount: Number(record.amount),
      category: record.category ? String(record.category) : null,
      payment_method: record.payment_method ? String(record.payment_method) : null,
      date: new Date(record.date),
    });
    open();
  };

  const uploadAttachments = async (expenseId, files) => {
    if (!files.length) return;
    const fd = new FormData();
    for (const file of files) {
      const processed = file.type.startsWith('image/')
        ? await compressImage(file)
        : file;
      fd.append('files', processed);
    }
    await api.post(`/v1/expenses/${expenseId}/attachments/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const payload = {
        ...values,
        category: Number(values.category),
        payment_method: Number(values.payment_method),
        date: dayjs(values.date).format('YYYY-MM-DD'),
      };
      const res = editing
        ? await api.put(`/v1/expenses/${editing.id}/`, payload)
        : await api.post('/v1/expenses/', payload);
      return res.data;
    },
    onSuccess: async (data) => {
      setSavingFiles(true);
      try {
        await uploadAttachments(data.id, newFiles);
      } catch {
        notifyError('Expense saved but some attachments failed — try re-uploading.');
      } finally {
        setSavingFiles(false);
      }
      qc.invalidateQueries({ queryKey: ['expenses'] });
      close();
      notifySuccess('Saved.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to save.')),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId) => api.delete(`/v1/expense-attachments/${attId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete attachment.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/expenses/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notifySuccess('Deleted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete.')),
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
      <Table.Td>
        <Badge variant="light" color="grape">
          {catMap[exp.category] ?? exp.category_name ?? '—'}
        </Badge>
      </Table.Td>
      <Table.Td>{exp.description || <Text size="xs" c="dimmed">—</Text>}</Table.Td>
      <Table.Td>₹{exp.amount}</Table.Td>
      <Table.Td>
        <Badge variant="light" color="blue">
          {pmMap[exp.payment_method] ?? exp.payment_method_name ?? '—'}
        </Badge>
      </Table.Td>
      <Table.Td>{exp.recorded_by_name ?? '—'}</Table.Td>
      <Table.Td>
        {exp.attachments?.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {exp.attachments.map((att, i) => (
              <Tooltip key={att.id} label={att.file.split('/').pop()}>
                <Anchor href={att.file} target="_blank" rel="noopener noreferrer">
                  <ActionIcon size="sm" variant="light" color="blue">
                    <IconEye size={13} />
                  </ActionIcon>
                </Anchor>
              </Tooltip>
            ))}
            <Badge size="xs" variant="light" color="gray" leftSection={<IconPaperclip size={10} />}>
              {exp.attachments.length}
            </Badge>
          </Group>
        ) : (
          <Text size="xs" c="dimmed">—</Text>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canChange && <Button size="xs" variant="light" onClick={() => openEdit(exp)}>Edit</Button>}
          {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(exp.id)}>Delete</Button>}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md" justify="space-between" wrap="wrap">
        <Group wrap="wrap">
          <DatePickerInput label="Date" value={dateFilter} onChange={setDateFilter} w={180} />
          {expenses.length > 0 && (
            <Text size="sm" c="dimmed" mt="xl">Total: <strong>₹{totalForDay}</strong></Text>
          )}
        </Group>
        {canAdd && (
          <Button leftSection={<IconPlus size={16} />} onClick={openAdd} mt="xl">
            Add Expense
          </Button>
        )}
      </Group>

      <Table.ScrollContainer minWidth={700}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Recorded By</Table.Th>
              <Table.Th>Attachments</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={8} ta="center">Loading...</Table.Td></Table.Tr>
            ) : rows.length === 0 ? (
              <Table.Tr><Table.Td colSpan={8} ta="center">No expenses for this date.</Table.Td></Table.Tr>
            ) : rows}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Expense' : 'Add Expense'} size={{ base: '95%', sm: 'lg' }}>
        <form onSubmit={form.onSubmit(v => saveMutation.mutate(v))}>
          <Stack gap="sm">
            <DatePickerInput
              label="Date"
              minDate={editing ? undefined : today}
              maxDate={today}
              {...form.getInputProps('date')}
              required
            />
            <Select
              label="Category"
              placeholder={canCreateCategory ? 'Search or create...' : 'Select category'}
              data={catOptions}
              searchable
              searchValue={categorySearch}
              onSearchChange={setCategorySearch}
              value={form.values.category}
              onChange={handleCategoryChange}
              error={form.errors.category}
              disabled={createCategoryMutation.isPending}
              required
            />
            <Group grow align="flex-start">
              <NumberInput label="Amount (₹)" min={1} {...form.getInputProps('amount')} required />
              <Select label="Payment Method" data={pmOptions} {...form.getInputProps('payment_method')} required />
            </Group>
            <TextInput label="Description" {...form.getInputProps('description')} />

            {/* Existing attachments (edit mode) */}
            {editing?.attachments?.length > 0 && (
              <div>
                <Text size="sm" fw={500} mb={4}>Existing Attachments</Text>
                <Stack gap={4}>
                  {editing.attachments.map((att) => (
                    <Group key={att.id} gap="xs">
                      <Anchor href={att.file} target="_blank" size="sm" rel="noopener noreferrer">
                        <Group gap={4}>
                          <IconEye size={13} />
                          {att.file.split('/').pop()}
                        </Group>
                      </Anchor>
                      <ActionIcon
                        size="xs" color="red" variant="subtle"
                        loading={deleteAttachmentMutation.isPending}
                        onClick={() => {
                          deleteAttachmentMutation.mutate(att.id);
                          setEditing(prev => ({
                            ...prev,
                            attachments: prev.attachments.filter(a => a.id !== att.id),
                          }));
                        }}
                      >
                        <IconTrash size={11} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>
              </div>
            )}

            {/* New attachments */}
            <FileInput
              label={editing ? 'Add More Attachments' : 'Attachments'}
              placeholder="Images or PDFs"
              leftSection={<IconUpload size={14} />}
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              value={newFiles}
              onChange={setNewFiles}
              clearable
            />
            {newFiles.length > 0 && (
              <Text size="xs" c="dimmed">
                {newFiles.map(f => f.name).join(' • ')}
              </Text>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={close}>Cancel</Button>
              <Button type="submit" loading={saveMutation.isPending || savingFiles}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
