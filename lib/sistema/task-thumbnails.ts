import type { ColumnWithTasks, Task } from '@/types/sistema';

type UrlMap = Record<string, string | null>;

const publicUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;

/** Keep private paths out of img src while signing, then patch only unchanged previews. */
export function prepareTaskThumbnails(tasks: Task[]) {
  const references = new WeakMap<object, string>();
  const preparedTasks = tasks.map((task) => {
    const assets = (task.assets || []).map((asset) => {
      const path = asset.thumbnail_url;
      const preview = { ...asset, thumbnail_url: publicUrl(path) };
      if (typeof path === 'string' && path && !publicUrl(path)) references.set(preview, path);
      return preview;
    });
    const metadata = task.type_metadata;
    const youtube = metadata?.youtube;
    if (!youtube || typeof youtube !== 'object') return { ...task, assets };
    const path = youtube.thumbnail_path || youtube.thumbnail_url;
    const preview = { ...youtube, thumbnail_url: publicUrl(path) };
    if (typeof path === 'string' && path && !publicUrl(path)) references.set(preview, path);
    return { ...task, assets, type_metadata: { ...metadata, youtube: preview } };
  });

  function hydrate(columns: ColumnWithTasks[], urls: UrlMap): ColumnWithTasks[] {
    return columns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => {
        const assets = (task.assets || []).map((asset) => {
          const path = references.get(asset);
          const url = path ? publicUrl(urls[path]) : null;
          return url ? { ...asset, thumbnail_url: url } : asset;
        });
        const metadata = task.type_metadata;
        const youtube = metadata?.youtube;
        const path = youtube && typeof youtube === 'object' ? references.get(youtube) : undefined;
        const url = path ? publicUrl(urls[path]) : null;
        return {
          ...task,
          assets,
          ...(url ? { type_metadata: { ...metadata, youtube: { ...youtube, thumbnail_url: url } } } : {}),
        };
      }),
    }));
  }

  return { tasks: preparedTasks, hydrate };
}
