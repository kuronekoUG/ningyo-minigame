// GitHub Pages serves the site under the repository name, so internal links and
// assets have to carry that prefix themselves.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export function withBase(path: string) {
  return `${BASE_PATH}${path}`;
}
