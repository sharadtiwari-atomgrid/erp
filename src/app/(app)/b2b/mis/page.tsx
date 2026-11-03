import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { parseMisStatus } from "@/lib/ops/lists";
import { blankValues } from "./_lib/fields";
import { loadBatches, loadEditorJob, loadHistory, loadLiveJobs, loadMasters, suggestJobNo, toListRow } from "./_server/data";
import { MisEditor } from "./mis-editor";
import { MisList } from "./mis-list";

export const metadata: Metadata = { title: "Domestic MIS" };

export default async function DomesticMisPage({ searchParams }: PageProps<"/b2b/mis">) {
  const user = await requireUser("b2bOrders");
  const sp = await searchParams;
  const edit = param(sp, "edit").trim();
  const canEdit = can(user, "b2bOrders", "edit");
  const { masters, pocs } = await loadMasters();

  if (edit) {
    const isNew = edit === "new";
    const [job, batches] = await Promise.all([isNew ? null : loadEditorJob(edit), loadBatches()]);
    if (isNew || job) {
      const history = job ? await loadHistory(job.id) : [];
      const initial = job ?? {
        id: null,
        jobNo: "",
        source: "manual",
        requestNo: null,
        values: { ...blankValues(), jobNo: await suggestJobNo() },
        docs: {},
      };
      const to = parseMisStatus(param(sp, "to"));
      return (
        <>
          <PageHeader
            title={job ? `Job ${job.jobNo}` : "New shipment"}
            description={job ? [job.values.customer, job.values.productName].filter(Boolean).join(" · ") || "Domestic MIS entry" : "Domestic MIS entry"}
            back={{ href: "/b2b/mis", label: "Domestic MIS" }}
          />
          <MisEditor
            key={job?.id ?? "new"}
            initial={initial}
            masters={masters}
            pocs={pocs}
            batches={batches}
            history={history}
            canEdit={canEdit}
            openPaste={param(sp, "paste") === "1"}
            toStatus={to === "INTRANSIT" || to === "DELIVERED" ? to : null}
          />
        </>
      );
    }
  }

  const jobs = await loadLiveJobs();
  const rows = jobs.map((j) => toListRow(j, masters));
  return (
    <>
      <PageHeader
        title="Domestic MIS"
        description="The master shipment table: every job from PO to POD and transporter payment."
      />
      <MisList rows={rows} canEdit={canEdit} initialQ={param(sp, "q")} notFound={edit && edit !== "new" ? edit : ""} />
    </>
  );
}
