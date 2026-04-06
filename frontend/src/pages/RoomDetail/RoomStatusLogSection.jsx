import { Stack, Group, Badge, Text, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { QUERY_KEYS, fetchRoomStatusLogs } from '../../api/queries';

const STATUS_LABEL = { available: 'Available', cleaning: 'Cleaning', out_of_order: 'Out of Order', occupied: 'Occupied' };
const STATUS_COLOR = { available: 'teal', cleaning: 'violet', out_of_order: 'dark', occupied: 'red' };

export default function RoomStatusLogSection({ roomId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.roomStatusLogs(roomId),
    queryFn: () => fetchRoomStatusLogs(roomId),
  });

  if (isLoading) return <Loader size="xs" />;
  if (!logs.length) return <Text size="sm" c="dimmed">No status changes recorded yet.</Text>;

  return (
    <Stack gap="xs">
      {logs.map(log => (
        <Group key={log.id} gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed" w={140}>{dayjs(log.changed_on).format('DD MMM YYYY, hh:mm A')}</Text>
          <Badge color={STATUS_COLOR[log.old_status] ?? 'gray'} variant="light" size="sm">
            {STATUS_LABEL[log.old_status] ?? log.old_status}
          </Badge>
          <Text size="xs" c="dimmed">→</Text>
          <Badge color={STATUS_COLOR[log.new_status] ?? 'gray'} variant="light" size="sm">
            {STATUS_LABEL[log.new_status] ?? log.new_status}
          </Badge>
          <Text size="xs" c="dimmed">by {log.changed_by_name}</Text>
          {log.note ? <Text size="xs" c="dimmed">· {log.note}</Text> : null}
        </Group>
      ))}
    </Stack>
  );
}
