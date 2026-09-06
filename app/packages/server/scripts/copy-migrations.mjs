import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Copia las migraciones SQL junto al build para que `migrate()` las
// encuentre en la imagen Docker (donde no hay código fuente).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'dist', 'drizzle'), { recursive: true });
cpSync(path.join(root, 'drizzle'), path.join(root, 'dist', 'drizzle'), {
  recursive: true,
});
console.log('migraciones copiadas a dist/drizzle');
