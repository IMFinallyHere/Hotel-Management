import { Table, Text, Badge, Box } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, fetchGroups, fetchPermissions } from '../api/queries';

function groupPermissionsByCategory(permissions) {
  const categories = {};
  for (const perm of permissions) {
    const key = `${perm.app_label} - ${perm.model}`;
    if (!categories[key]) categories[key] = [];
    categories[key].push(perm);
  }
  return categories;
}

export default function PermissionOverview() {
  const { data: groups = [], isLoading: loadingGroups } = useQuery({ queryKey: QUERY_KEYS.groups, queryFn: fetchGroups });
  const { data: permissions = [], isLoading: loadingPerms } = useQuery({ queryKey: QUERY_KEYS.permissions, queryFn: fetchPermissions });

  const isLoading = loadingGroups || loadingPerms;
  const categories = groupPermissionsByCategory(permissions);

  // Build lookup: groupId -> Set of permission ids
  const groupPerms = {};
  for (const g of groups) {
    groupPerms[g.id] = new Set(g.permissions);
  }

  return (
    <>
      <Text size="lg" fw={600} mb="md">Permission Overview</Text>

      {isLoading ? (
        <Text ta="center" c="dimmed">Loading...</Text>
      ) : (
        <Box style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 250 }}>Permission</Table.Th>
                {groups.map(g => (
                  <Table.Th key={g.id} ta="center" style={{ minWidth: 100 }}>
                    <Text size="xs">{g.name}</Text>
                    <Badge size="xs" variant="light">{g.user_count} users</Badge>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(categories).map(([category, perms]) => (
                <>
                  <Table.Tr key={`cat-${category}`}>
                    <Table.Td colSpan={groups.length + 1} bg="gray.1">
                      <Text size="sm" fw={600} tt="capitalize">{category}</Text>
                    </Table.Td>
                  </Table.Tr>
                  {perms.map(perm => (
                    <Table.Tr key={perm.id}>
                      <Table.Td pl="lg">
                        <Text size="sm">{perm.name}</Text>
                      </Table.Td>
                      {groups.map(g => (
                        <Table.Td key={g.id} ta="center">
                          {groupPerms[g.id]?.has(perm.id) && (
                            <IconCheck size={16} color="teal" />
                          )}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </>
              ))}
              {permissions.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={groups.length + 1} ta="center">No permissions found.</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </>
  );
}
