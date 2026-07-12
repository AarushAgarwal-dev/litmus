import Link from "next/link";
import { getReport } from "@/lib/store";
import { ReportView } from "@/components/report/report-view";
import { IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function StoredAuditPage(ctx: PageProps<"/audit/[id]">) {
  const { id } = await ctx.params;
  const report = await getReport(id);

  if (!report) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8">
        <h1 className="serif text-2xl text-ink" style={{ fontWeight: 500 }}>Audit not found</h1>
        <p className="mt-3 text-muted">
          This audit isn&rsquo;t in the store, it may have expired or never existed.
        </p>
        <Link href="/audit" className="btn btn-clay mt-6">
          Run a new audit
          <IconArrowRight width={16} height={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="eyebrow">Robustness report</span>
          <p className="mono mt-1 text-xs text-faint">/{id}</p>
        </div>
        <Link href="/audit" className="btn btn-ghost btn-sm">
          Run another
          <IconArrowRight width={15} height={15} />
        </Link>
      </div>
      <ReportView report={report} />
    </div>
  );
}
