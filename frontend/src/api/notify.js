import { notifications } from '@mantine/notifications';

export const notifySuccess = (msg) => notifications.show({ message: msg, color: 'teal' });
export const notifyError = (msg) => notifications.show({ message: msg, color: 'red' });
