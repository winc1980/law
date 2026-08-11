// GitHub Pages のプロジェクトサイトでは base が '/law' になるため、
// サイト内リンクは必ずこれを通す。

export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const rest = path.replace(/^\/+/, '');
  return rest ? `${base}/${rest}` : `${base}/`;
}
