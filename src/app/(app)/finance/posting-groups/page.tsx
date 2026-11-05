import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { POSTING_KEYS, type PostingKey } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { can } from "@/lib/permissions";
import { InlineForm } from "../_gl/inline-form";
import { POSTING_KEY_HELP } from "../_gl/posting-help";
import { setPostingAccount } from "./actions";

export const metadata: Metadata = { title: "General Posting Setup" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePostingGroupsPage() {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const canEdit = can(user, "finance", "edit");
  const [mappings, accounts] = await Promise.all([
    db.postingAccount.findMany({ include: { account: { select: { id: true, code: true, name: true, isActive: true } } } }),
    db.glAccount.findMany({ where: { isGroup: false, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const byKey = new Map(mappings.map((m) => [m.key, m]));

  return (
    <>
      <PageHeader
        title="General Posting Setup"
        description="Which ledger account each kind of automatic posting uses. Changes apply to new postings only; posted entries stay where they are."
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Key</TH>
              <TH>Used for</TH>
              <TH>Account</TH>
            </tr>
          </THead>
          <TBody>
            {(Object.keys(POSTING_KEYS) as PostingKey[]).map((key) => {
              const m = byKey.get(key);
              return (
                <TR key={key}>
                  <TD className="align-top">
                    <span className="block font-medium">{POSTING_KEYS[key].label}</span>
                    <span className="text-xs text-ink-faint">{key}</span>
                  </TD>
                  <TD className="max-w-md align-top text-ink-soft">{POSTING_KEY_HELP[key]}</TD>
                  <TD className="align-top">
                    {canEdit ? (
                      <InlineForm action={setPostingAccount.bind(null, key)} submitLabel="Save">
                        <Select name="accountId" defaultValue={m?.accountId ?? ""} aria-label={`${POSTING_KEYS[key].label} account`} className="h-8 w-72 text-sm">
                          <option value="">— Not mapped —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} {a.name}
                            </option>
                          ))}
                          {m && !m.account.isActive && (
                            <option value={m.account.id}>
                              {m.account.code} {m.account.name} (blocked)
                            </option>
                          )}
                        </Select>
                      </InlineForm>
                    ) : m ? (
                      <Link href={`/finance/accounts/${m.account.id}`} className="text-brand-700 hover:underline">
                        {m.account.code} {m.account.name}
                      </Link>
                    ) : (
                      <Badge tone="red">Not mapped</Badge>
                    )}
                    {m && canEdit && (
                      <Link href={`/finance/accounts/${m.account.id}`} className="mt-1 block text-xs text-ink-soft hover:underline">
                        View ledger
                      </Link>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
