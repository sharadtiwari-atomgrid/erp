/**
 * Imports Domestic MIS jobs from a Domestic B2B CRM export (.xlsx, "Domestic MIS"
 * sheet) using the same column mapping as the in-app importer. New Job Nos. are
 * created; existing live jobs are merged (only non-blank cells overwrite).
 *
 * Usage: npx tsx scripts/import-domestic-crm-mis.ts "<path to export .xlsx>"
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseMisSheet, mergeImported } from "../src/app/(app)/b2b/mis/_lib/import-map";
import { dataFromValues, normaliseValues, valuesFromJob } from "../src/app/(app)/b2b/mis/_lib/convert";
import { fileList } from "../src/app/(app)/b2b/mis/_lib/files";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pass the path to the CRM export .xlsx");
  const wb = XLSX.readFile(file, { cellDates: true });
  const ws = wb.Sheets["Domestic MIS"];
  if (!ws) throw new Error('No "Domestic MIS" sheet in that file');
  const parsed = parseMisSheet(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false }));
  let added = 0;
  let updated = 0;
  for (const { values, docs } of parsed) {
    const cur = await db.misJob.findFirst({ where: { jobNo: values.jobNo, deletedAt: null } });
    let jobId: string;
    if (cur) {
      const merged = normaliseValues(mergeImported(valuesFromJob(cur), values));
      await db.misJob.update({ where: { id: cur.id }, data: dataFromValues(merged) as never });
      jobId = cur.id;
      updated++;
    } else {
      const job = await db.misJob.create({ data: { ...(dataFromValues(normaliseValues(values)) as object), jobNo: values.jobNo, source: "import" } as never });
      jobId = job.id;
      added++;
    }
    for (const [field, ref] of Object.entries(docs)) {
      for (const f of fileList(ref as string)) {
        const exists = await db.opsFile.findFirst({ where: { entityType: "MisJob", entityId: jobId, field, fileName: f.name } });
        if (!exists) await db.opsFile.create({ data: { entityType: "MisJob", entityId: jobId, field, fileName: f.name, url: f.url ?? null } });
      }
    }
  }
  console.log(`Domestic MIS: ${parsed.length} rows, ${added} added, ${updated} updated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
