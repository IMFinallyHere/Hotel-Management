import { useState } from 'react';
import { Popover, ActionIcon, Badge, Group, Text, Select, Button } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { QUERY_KEYS } from '../../api/queries';
import { notifySuccess, notifyError } from '../../api/notify';
import { parseApiError } from '../../api/errorUtils';

const REMINDER_PRESETS = [
  { value: '0', label: 'Same day' },
  { value: '1', label: '1 day before' },
  { value: '3', label: '3 days before' },
  { value: '5', label: '5 days before' },
  { value: '7', label: '7 days before' },
  { value: '10', label: '10 days before' },
  { value: '14', label: '14 days before' },
  { value: '30', label: '30 days before' },
];

export default function ReminderPopover({ reservation }) {
  const qc = useQueryClient();
  const [selectedDays, setSelectedDays] = useState(null);
  const reminders = reservation.reminders || [];
  const existingDays = new Set(reminders.map(r => String(r.days_before)));
  const availablePresets = REMINDER_PRESETS.filter(p => !existingDays.has(p.value));

  const addMutation = useMutation({
    mutationFn: ({ reservationId, daysBefore }) =>
      api.post('/v1/reminders/', { reservation: reservationId, days_before: daysBefore }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomReservations(reservation.room) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
      setSelectedDays(null);
      notifySuccess('Reminder added.');
    },
    onError: (e) => notifyError(parseApiError(e, 'Failed to add reminder.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (reminderId) => api.delete(`/v1/reminder/${reminderId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.roomReservations(reservation.room) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.reminders });
    },
    onError: () => notifyError('Failed to delete reminder.'),
  });

  return (
    <Popover width={260} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <ActionIcon variant="subtle" color={reminders.length > 0 ? 'orange' : 'gray'} size="sm">
          <IconBell size={14} />
          {reminders.length > 0 && (
            <Badge size="xs" color="orange" circle style={{ position: 'absolute', top: -4, right: -4 }}>
              {reminders.length}
            </Badge>
          )}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="xs" fw={600} mb="xs">Reminders</Text>
        {reminders.length === 0 ? (
          <Text size="xs" c="dimmed" mb="xs">No reminders set.</Text>
        ) : (
          <Group gap={4} mb="xs" wrap="wrap">
            {reminders.map(r => (
              <Badge
                key={r.id}
                size="sm"
                color="orange"
                variant="light"
                rightSection={
                  <ActionIcon size="xs" color="orange" variant="transparent" onClick={() => deleteMutation.mutate(r.id)}>
                    ×
                  </ActionIcon>
                }
              >
                {r.days_before === 0 ? 'Same day' : `${r.days_before}d before`}
              </Badge>
            ))}
          </Group>
        )}
        <Select
          size="xs"
          placeholder={availablePresets.length === 0 ? 'All reminders set' : 'Select days before'}
          data={availablePresets}
          value={selectedDays}
          onChange={setSelectedDays}
          disabled={availablePresets.length === 0}
          comboboxProps={{ withinPortal: false }}
          mb="xs"
          clearable
        />
        <Button
          size="xs"
          fullWidth
          disabled={selectedDays === null}
          loading={addMutation.isPending}
          onClick={() => addMutation.mutate({ reservationId: reservation.id, daysBefore: parseInt(selectedDays) })}
        >
          Add Reminder
        </Button>
      </Popover.Dropdown>
    </Popover>
  );
}
