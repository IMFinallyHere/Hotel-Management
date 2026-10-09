import { Group, Text, Select, Pagination } from '@mantine/core';

export const PAGE_SIZE_OPTIONS = [
  { value: '20', label: '20 / page' },
  { value: '50', label: '50 / page' },
  { value: '100', label: '100 / page' },
];

// Footer for server-paginated tables: "Showing x–y of n", page size picker, page numbers
export default function TablePager({ page, pageSize, totalCount, onPageChange, onPageSizeChange, dimmed = false }) {
  if (!totalCount) return null;
  const size = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  return (
    <Group justify="space-between" wrap="wrap" gap="sm" mt="sm" style={{ opacity: dimmed ? 0.6 : 1 }}>
      <Text size="sm" c="dimmed">
        Showing {(page - 1) * size + 1}–{Math.min(page * size, totalCount)} of {totalCount}
      </Text>
      <Group gap="sm">
        <Select
          size="xs"
          w={110}
          value={pageSize}
          onChange={(v) => onPageSizeChange(v ?? '20')}
          data={PAGE_SIZE_OPTIONS}
          allowDeselect={false}
        />
        <Pagination size="sm" total={totalPages} value={page} onChange={onPageChange} />
      </Group>
    </Group>
  );
}
