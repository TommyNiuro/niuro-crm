// Aísla los tests de la DB local del repo. Sin esto, dataDir() cae en
// <cwd>/data y los tests leen/escriben data/crm.db: si alguien corrió la .app o
// `npm run local` en el repo, esa DB queda cifrada (SQLCipher) y las suites
// revientan con "file is not a database" / "attempt to write a readonly
// database" (gotcha histórico que se venía tapando a mano con `mv`).
//
// Cada archivo de test corre en su propio worker (isolate por defecto de
// vitest), así que un dir temporal único por archivo da una DB limpia y
// descartable. Se setea ANTES de que cualquier test importe @/db, que resuelve
// el path vía @/lib/paths en tiempo de carga.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

delete process.env.CRM_DB_PATH; // CRM_DB_PATH tiene prioridad sobre CRM_DATA_DIR
process.env.CRM_DATA_DIR = mkdtempSync(join(tmpdir(), "niuro-crm-test-"));
