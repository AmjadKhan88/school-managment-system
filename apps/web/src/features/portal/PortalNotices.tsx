import { PageHeader } from "@/components/common/PageHeader";
import { NoticeInbox } from "@/features/communication/NoticeInbox";

export default function PortalNotices() {
  return (
    <>
      <PageHeader title="Notices" subtitle="From the school office." />
      <NoticeInbox />
    </>
  );
}
