import { TextInput, PasswordInput, Button, Paper, Title, Stack, Center } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { notifyError } from '../api/notify';

export default function Login() {
  const navigate = useNavigate();
  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => v ? null : 'Required',
      password: (v) => v ? null : 'Required',
    },
  });

  const handleSubmit = async (values) => {
    try {
      const { data } = await axios.post('/auth/token/', values);
      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      navigate('/');
    } catch {
      notifyError('Invalid username or password.');
    }
  };

  return (
    <Center h="100vh" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <Paper shadow="md" p="xl" radius="md" w={360}>
        <Title order={3} ta="center" mb="xl">Hotel Management</Title>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput label="Username" {...form.getInputProps('username')} required />
            <PasswordInput label="Password" {...form.getInputProps('password')} required />
            <Button type="submit" fullWidth mt="sm">Login</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
