import { PageHeader } from "@/components/common/PageHeader";
import { NoticeInbox } from "./NoticeInbox";

export default function StaffNoticesPage() {
  return (
    <>
      <PageHeader
        title="Notice Board"
        subtitle="Notices, circulars and announcements meant for you."
      />
      <NoticeInbox />
    </>
  );
}
