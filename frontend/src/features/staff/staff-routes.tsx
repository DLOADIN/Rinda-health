import type { Role } from '@rinda/schemas';
import { Navigate, Route, Routes } from 'react-router';
import { useMeQuery } from '@/lib/api';
import { AuditPage, DeletionsPage, FlagsPage } from '@/features/staff/admin-pages';
import { ContentPage } from '@/features/staff/content-page';
import { ParticipantsPage } from '@/features/staff/participants-page';
import { ResearchPage } from '@/features/staff/research-page';
import { SafetyPage } from '@/features/staff/safety-page';
import { SessionDetailPage, SessionsPage } from '@/features/staff/sessions-pages';
import { UsersPage } from '@/features/staff/users-page';

export default function StaffRoutes({ role }: { role: Role }) {
  const { data: me } = useMeQuery();
  return (
    <Routes>
      {role === 'facilitator' || role === 'researcher_admin' ? (
        <>
          <Route path="participants" element={<ParticipantsPage role={role} />} />
          <Route path="safety" element={<SafetyPage role={role} />} />
        </>
      ) : null}
      {role === 'facilitator' ? (
        <>
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
        </>
      ) : null}
      {role === 'researcher_admin' || role === 'reviewer' ? (
        <Route path="content" element={<ContentPage role={role} />} />
      ) : null}
      {role === 'researcher_admin' ? (
        <>
          <Route path="users" element={<UsersPage meId={me?.id ?? ''} />} />
          <Route path="deletions" element={<DeletionsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="flags" element={<FlagsPage />} />
          <Route path="research" element={<ResearchPage />} />
        </>
      ) : null}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
