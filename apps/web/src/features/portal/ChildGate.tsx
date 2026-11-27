import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { apiMessage } from "@/lib/api";
import { PortalChild, useChild } from "./shared";

/** Page frame for every portal page: title, who it is for, and the loading and nobody-linked states. */
export function ChildGate({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: (c: PortalChild) => ReactNode;
}) {
  const { child, loading, error } = useChild();
  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          child
            ? `${child.fullName}${child.enrollment ? ` · ${child.enrollment.className} ${child.enrollment.sectionName}` : ""}${subtitle ? ` · ${subtitle}` : ""}`
            : subtitle
        }
        actions={actions}
      />
      {loading && (
        <Loader2 className="mx-auto mt-12 animate-spin text-slate-400" />
      )}
      {!!error && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(error, "Could not load")}
        </div>
      )}
      {!loading && !error && !child && (
        <div className="card p-8 text-center text-sm text-slate-600">
          No student is linked to this login. Please contact the school office.
        </div>
      )}
      {child && children(child)}
    </>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="card p-8 text-center text-sm text-slate-500">{children}</div>
);

export const Spinner = () => (
  <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
);
