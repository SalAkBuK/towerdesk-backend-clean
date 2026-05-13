import { env } from '../../config/env';

export const resolvePagination = (limit?: number, offset?: number) => {
  const maxPageSize = env.MAX_PAGE_SIZE ?? 100;
  const defaultPageSize = env.DEFAULT_PAGE_SIZE ?? 50;
  const take = Math.min(Math.max(limit ?? defaultPageSize, 1), maxPageSize);
  const skip = Math.max(offset ?? 0, 0);

  return { take, skip };
};
