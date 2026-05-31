import { useState } from 'react';
import { Table, Button, Modal, Select, MultiSelect, NumberInput, Group, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import { QUERY_KEYS, fetchPriceChart, fetchRooms, fetchRoomTypes } from '../api/queries';
import { notifySuccess, notifyError } from '../api/notify';
import { parseApiError } from '../api/errorUtils';
import usePermissions from '../hooks/usePermissions';

export default function PriceChart() {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canAdd    = permissions.add_roomspricechart    || permissions.is_superuser;
  const canChange = permissions.change_roomspricechart || permissions.is_superuser;
  const canDelete = permissions.delete_roomspricechart || permissions.is_superuser;
  const { data = [], isLoading } = useQuery({ queryKey: QUERY_KEYS.priceChart, queryFn: fetchPriceChart });
  const { data: rooms = [] } = useQuery({ queryKey: QUERY_KEYS.rooms, queryFn: fetchRooms });
  const { data: roomTypes = [] } = useQuery({ queryKey: QUERY_KEYS.roomTypes, queryFn: fetchRoomTypes });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterRoom, setFilterRoom] = useState(null);
  const [filterDate, setFilterDate] = useState(null);
  const [quickType, setQuickType] = useState(null);
  const today = dayjs().format('YYYY-MM-DD');

  const form = useForm({
    initialValues: { room: null, rooms: [], date: null, dates: [null, null], price: 0 },
    validate: {
      rooms: (v, values) => !values.room && v.length === 0 ? 'Select at least one room' : null,
    },
  });

  const openAdd = () => { setEditing(null); form.reset(); setQuickType(null); open(); };
  const openEdit = (record) => {
    setEditing(record);
    form.setValues({
      room: String(record.room),
      date: new Date(record.date),
      dates: [null, null],
      price: record.price,
    });
    open();
  };

  const handleSave = async (values) => {
    if (editing) {
      if (!values.room) { form.setFieldError('room', 'Required'); return; }
      if (!values.date) { form.setFieldError('date', 'Required'); return; }
      setSaving(true);
      try {
        await api.put(`/v1/price/chart/${editing.id}/`, {
          room: parseInt(values.room),
          date: dayjs(values.date).format('YYYY-MM-DD'),
          price: values.price,
        });
        qc.invalidateQueries({ queryKey: QUERY_KEYS.priceChart });
        close();
        notifySuccess('Saved.');
      } catch (e) {
        notifyError(parseApiError(e, 'Failed to save.'));
      } finally {
        setSaving(false);
      }
    } else {
      if (values.rooms.length === 0) {
        form.setFieldError('rooms', 'Select at least one room');
        return;
      }
      if (!values.dates?.[0] || !values.dates?.[1]) {
        form.setFieldError('dates', 'Select a date range');
        return;
      }
      setSaving(true);
      const start = dayjs(values.dates[0]);
      const end = dayjs(values.dates[1]);
      const days = end.diff(start, 'day') + 1;
      const total = values.rooms.length * days;
      let added = 0;
      let skipped = 0;
      for (const roomId of values.rooms) {
        for (let i = 0; i < days; i++) {
          const date = start.add(i, 'day').format('YYYY-MM-DD');
          try {
            await api.post('/v1/price/chart/', { room: parseInt(roomId), date, price: values.price });
            added++;
          } catch {
            skipped++;
          }
        }
      }
      qc.invalidateQueries({ queryKey: QUERY_KEYS.priceChart });
      close();
      notifySuccess(
        skipped > 0
          ? `Added ${added} of ${total} entries (${skipped} skipped — already existed).`
          : `Added ${added} ${added === 1 ? 'entry' : 'entries'}.`
      );
      setSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/price/chart/${id}/`),
    onSuccess: () => { qc.invalidateQueries(QUERY_KEYS.priceChart); notifySuccess('Deleted.'); },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete price entry',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.room_number]));

  const filtered = data.filter((entry) => {
    if (filterRoom && String(entry.room) !== filterRoom) return false;
    if (filterDate && entry.date !== dayjs(filterDate).format('YYYY-MM-DD')) return false;
    return true;
  });

  const rows = filtered.map((entry) => {
    const isPast = entry.date < today;
    return (
      <Table.Tr key={entry.id}>
        <Table.Td>{roomMap[entry.room] ?? entry.room}</Table.Td>
        <Table.Td>{entry.date}</Table.Td>
        <Table.Td>₹{entry.price}</Table.Td>
        <Table.Td>
          {!isPast ? (
            <Group gap="xs">
              {canChange && <Button size="xs" variant="light" onClick={() => openEdit(entry)}>Edit</Button>}
              {canDelete && <Button size="xs" color="red" variant="light" onClick={() => handleDelete(entry.id)}>Delete</Button>}
            </Group>
          ) : (
            <Text size="xs" c="dimmed">—</Text>
          )}
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <>
      <Group mb="md">
        {canAdd && <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>Add Price Entry</Button>}
      </Group>

      <Group mb="sm" align="flex-end" wrap="wrap">
        <Select
          placeholder="Filter by room"
          data={rooms.map(r => ({ value: String(r.id), label: r.room_number }))}
          value={filterRoom}
          onChange={setFilterRoom}
          clearable
          w={180}
        />
        <DatePickerInput
          placeholder="Filter by date"
          value={filterDate}
          onChange={setFilterDate}
          clearable
          w={180}
        />
        <Text size="sm" c="dimmed">Showing {filtered.length} of {data.length} entries</Text>
      </Group>

      <Table.ScrollContainer minWidth={500}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Room</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">Loading...</Table.Td></Table.Tr>
          ) : rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={4} ta="center">No price entries yet.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={editing ? 'Edit Price Entry' : 'Add Price Entry'} size={{ base: '95%', sm: 'lg' }}>
        <form onSubmit={form.onSubmit(handleSave)}>
          {editing ? (
            <Select
              label="Room"
              data={rooms.map(r => ({ value: String(r.id), label: r.room_number }))}
              {...form.getInputProps('room')}
              mb="sm"
              required
            />
          ) : (
            <>
              <Group mb={4} align="flex-end" wrap="nowrap">
                <Select
                  label="Quick select by room type"
                  placeholder="Pick a type…"
                  data={roomTypes.map(t => ({ value: String(t.id), label: t.name }))}
                  value={quickType}
                  onChange={setQuickType}
                  clearable
                  style={{ flex: 1 }}
                />
                <Button
                  variant="light"
                  disabled={!quickType}
                  onClick={() => {
                    const ids = rooms
                      .filter(r => String(r.room_type) === quickType)
                      .map(r => String(r.id));
                    form.setFieldValue('rooms', [...new Set([...form.values.rooms, ...ids])]);
                  }}
                >
                  Add to selection
                </Button>
              </Group>
              <MultiSelect
                label="Rooms"
                placeholder="Pick one or more rooms"
                data={rooms.map(r => ({ value: String(r.id), label: r.room_number }))}
                {...form.getInputProps('rooms')}
                mb="sm"
                required
                searchable
              />
            </>
          )}
          {editing ? (
            <DatePickerInput
              label="Date"
              {...form.getInputProps('date')}
              mb="sm"
              required
            />
          ) : (
            <DatePickerInput
              type="range"
              label="Date Range"
              minDate={new Date()}
              {...form.getInputProps('dates')}
              mb="sm"
              required
            />
          )}
          <NumberInput label="Price (₹)" min={0} {...form.getInputProps('price')} mb="md" required />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save' : 'Add Entries'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
