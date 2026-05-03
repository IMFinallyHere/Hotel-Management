import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={{ primaryColor: 'teal' }}>
      <ModalsProvider>
        <Notifications />
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
