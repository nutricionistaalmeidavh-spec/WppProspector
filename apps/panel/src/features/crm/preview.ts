export function isCrmPreviewEnabled(): boolean {
  return import.meta.env.DEV;
}
