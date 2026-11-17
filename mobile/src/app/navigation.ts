export const pages = ['home', 'dashboard', 'clientes', 'projetos', 'arranjos', 'biblioteca', 'financeiro', 'perfil'];
export function readRoute(hash: string): { page: string; projectId: string | null } {
  try {
    const parts = hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'projetos' && parts.length === 2 && parts[1]) return { page: 'projetos', projectId: decodeURIComponent(parts[1]) };
    if (parts.length === 1 && pages.includes(parts[0])) return { page: parts[0], projectId: null };
  } catch { /* Invalid URL escapes return to the start page. */ }
  return { page: 'home', projectId: null };
}
export function routeHash(page: string, projectId: string | null = null) {
  return projectId ? `#/projetos/${encodeURIComponent(projectId)}` : `#/${pages.includes(page) ? page : 'home'}`;
}
