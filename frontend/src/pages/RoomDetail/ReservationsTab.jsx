import { useState } from 'react';
import { Table, Button, Group, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlus } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useForm } from '@mantine/form';
import { Modal, NumberInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { QUERY_KEYS } from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';
import { CustomerList } from '../../components/CustomerTable';
import CustomerSelectWithAdd from '../../components/CustomerSelectWithAdd';
import ReminderPopover from './ReminderPopover';
import ConvertCheckinModal from './ConvertCheckinModal';
import usePermissions from '../../hooks/usePermissions';

export default function ReservationsTab({ room, reservations, isOccupied, configMap = {} }) {
  const qc = useQueryClient();
  const { permissions } = usePermissions();
  const canViewReminders = permissions.view_reservationreminder || permissions.is_superuser;
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [convertReservation, setConvertReservation] = useState(null);
  const [convertOpened, { open: openConvert, close: closeConvert }] = useDisclosure(false);

  const form = useForm({
    initialValues: { customers: [], dates: [null, null], price: 0 },
    validate: {
      customers: (v) => v.length > 0 ? null : 'Select at least one customer.',
      dates: (v) => (v && v[0] && v[1]) ? null : 'Select dates.',
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/v1/reservation/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      notifySuccess('Reservation deleted.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to delete reservation.')),
  });

  const handleDelete = (id) => modals.openConfirmModal({
    title: 'Delete reservation',
    children: <Text size="sm">This action cannot be undone.</Text>,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => deleteMutation.mutate(id),
  });

  const handleConvert = (reservation) => {
    setConvertReservation(reservation);
    openConvert();
  };

  const handleAdd = async (values) => {
    setLoading(true);
    try {
      const { data: groupData } = await api.post('/v1/group/customers/', { customers: values.customers.map(Number) });
      await api.post('/v1/reservations/', {
        room: room.id,
        group: groupData.group_id,
        check_in_date: dayjs(values.dates[0]).format('YYYY-MM-DD'),
        check_out_date: dayjs(values.dates[1]).format('YYYY-MM-DD'),
        price: values.price ?? 0,
      });
      qc.invalidateQueries(QUERY_KEYS.roomReservations(room.id));
      close();
      form.reset();
      notifySuccess('Reservation added.');
    } catch (e) {
      notifyError(parseApiError(e, 'Failed to add reservation.'));
    } finally {
      setLoading(false);
    }
  };

  const rows = reservations.map((res) => (
    <Table.Tr key={res.id}>
      <Table.Td>{res.check_in_date}</Table.Td>
      <Table.Td>{res.check_out_date}</Table.Td>
      <Table.Td>₹{res.price}</Table.Td>
      <Table.Td><CustomerList groupId={res.group} /></Table.Td>
      <Table.Td>
        <Group gap="xs">
          {canViewReminders && <ReminderPopover reservation={res} />}
          {!isOccupied && (
            <Button size="xs" variant="light" onClick={() => handleConvert(res)}>Convert</Button>
          )}
          <Button size="xs" color="red" variant="light" onClick={() => handleDelete(res.id)}>Delete</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={() => { form.reset(); open(); }}>
          Add Reservation
        </Button>
      </Group>

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Check-In</Table.Th>
            <Table.Th>Check-Out</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Guests</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={5} ta="center">No reservations for this room.</Table.Td></Table.Tr>
          ) : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title="Add Reservation">
        <form onSubmit={form.onSubmit(handleAdd)}>
          <CustomerSelectWithAdd
            label="Guests"
            value={form.values.customers}
            onChange={(val) => form.setFieldValue('customers', val)}
            error={form.errors.customers}
            required
            simpleAdd
          />
          <DatePickerInput
            type="range"
            label="Date Range"
            minDate={isOccupied ? dayjs().add(1, 'day').toDate() : new Date()}
            {...form.getInputProps('dates')}
            mt="sm"
            mb="sm"
            required
          />
          <NumberInput label="Price (₹, optional)" min={0} {...form.getInputProps('price')} mb="md" />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Cancel</Button>
            <Button type="submit" loading={loading}>Add</Button>
          </Group>
        </form>
      </Modal>

      {convertReservation && (
        <ConvertCheckinModal
          opened={convertOpened}
          onClose={closeConvert}
          reservation={convertReservation}
          room={room}
          configMap={configMap}
        />
      )}
    </>
  );
}
