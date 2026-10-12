// This is where every call to our API is defined, using RTK Query.
import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type {
  CheckupSubmission,
  ConsentChange,
  ConsentSubmission,
  ContentCreateRequest,
  Flags,
  Me,
  ParticipantProfile,
  Role,
  SignupRequest,
  SusSubmission,
  UpdateMeRequest,
} from '@rinda/schemas';
import type { z } from 'zod';
import type { AssessmentResult, Plan, SafetyAssessment } from '@rinda/rules';

export interface Assessment {
  id: string;
  createdAt: string;
  rulesetVersion: string;
  results: AssessmentResult;
  plan: Plan;
  safety: SafetyAssessment;
  values: {
    moderateMinutes: number | null;
    vigorousMinutes: number | null;
    servingsPerDay: number | null;
    heightCm: number | null;
    weightKg: number | null;
    waistCm: number | null;
    systolic: number | null;
    diastolic: number | null;
    auditC: number | null;
  };
  provisional?: boolean;
}
export interface DayCount {
  day: string;
  count: number;
}
export interface GuideResponse {
  requestId?: string;
  source: 'generated' | 'template';
  paragraphs: Array<{ text: string; sourceIds: string[] }>;
  followUpChipIds: string[];
}
export interface AiStatus {
  ai: boolean;
  available: boolean;
}

export interface ConsentStatus {
  decided: boolean;
  core: boolean;
  mental_wellness: boolean;
  audio: boolean;
  follow_up: boolean;
}

export interface WhatsAppStatus {
  whatsapp: boolean;
  available: boolean;
  hasPhone: boolean;
}

export interface EmailReportStatus {
  email: boolean;
  available: boolean;
  hasEmail: boolean;
}
export interface MetricCard {
  key: string;
  value: number;
}
export interface Session {
  id: string;
  participantId: string;
  participantLabel: string;
  orderAssignment: 'AB' | 'BA' | null;
  deviceLabel: string | null;
  startedAt: string;
  endedAt: string | null;
  tasks: Array<{ taskCode: string; outcome: string; durationSeconds: number }>;
}
export interface LiveSession {
  ended: boolean;
  online: boolean;
  lastSeenAt: string | null;
  current: { step: string; startedAt: string } | null;
  timeline: Array<{ step: string; startedAt: string; endedAt: string | null; seconds: number }>;
  totals: Record<string, number>;
  alerts: Array<{ tier: number; triggerType: string; occurredAt: string }>;
}
export interface ResearchReport {
  generatedAt: string;
  rulesetVersion: string;
  participants: {
    total: number;
    consented: number;
    wellnessConsent: number;
    withCheckup: number;
    wellnessCompleted: number;
  };
  checkups: number;
  sessions: { total: number; ended: number };
  tasks: Array<{
    task: string;
    recorded: number;
    completed: number;
    withHelp: number;
    notCompleted: number;
    medianSeconds: number | null;
  }>;
  sus: {
    responses: number;
    mean: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    bands: Array<{ band: string; count: number }>;
  };
  bands: Record<string, Record<string, number>>;
  safety: Array<{ tier: number; count: number }>;
  languages: Array<{ language: string; count: number }>;
}
export interface ContentVersion {
  id: string;
  type: string;
  key: string;
  version: string;
  language: string;
  body: Record<string, unknown>;
  status: 'draft' | 'published' | 'retired';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdByMe: boolean;
  approvals: Array<{ approverId: string; approver: string | null; decision: string; notes: string | null }>;
  approvedCount: number;
  myDecision: string | null;
}
export interface Dashboard {
  role: Role;
  cards: MetricCard[];
  latest?: Assessment | null;
  deletionRequested?: boolean;
  recentSessions?: Session[];
  usersByRole?: Array<{ role: Role; count: number }>;
  safetyByTier?: Array<{ tier: number; count: number }>;
  waiting?: ContentVersion[];
  sessionsByDay?: DayCount[];
  checkupsByDay?: DayCount[];
  signupsByDay?: DayCount[];
}
export interface ParticipantSummary {
  id: string;
  label: string;
  displayName: string | null;
  orderAssignment: 'AB' | 'BA' | null;
  createdAt: string;
  assessments: number;
}
export interface SafetyEventRow {
  id: string;
  tier: number;
  triggerType: string;
  actions: string[];
  occurredAt: string;
  recordedByRole: string;
  supervisorInformedAt: string | null;
  participantLabel: string;
}
export type AdminUser = Me & { active: boolean; lastSignInAt: string | null; assessments: number };
export interface DeletionRequestRow {
  id: string;
  status: 'requested' | 'completed';
  requestedAt: string;
  completedAt: string | null;
  dueAt: string;
  participantLabel: string;
}
export interface AuditEntry {
  id: string;
  actor: string | null;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export function errorCode(error: unknown): string {
  const e = error as FetchBaseQueryError | undefined;
  const data = e && 'data' in e ? (e.data as { error?: { code?: string } } | undefined) : undefined;
  if (data?.error?.code) return data.error.code;
  if (e && 'status' in e && e.status === 'FETCH_ERROR') return 'OFFLINE';
  return 'INTERNAL';
}

export function errorDetails(error: unknown): Array<{ path: string; issue: string }> {
  const e = error as FetchBaseQueryError | undefined;
  const data =
    e && 'data' in e
      ? (e.data as { error?: { details?: Array<{ path: string; issue: string }> } })
      : undefined;
  return data?.error?.details ?? [];
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/v1', credentials: 'same-origin' }),
  tagTypes: [
    'Me',
    'Consents',
    'Feedback',
    'Dashboard',
    'Assessments',
    'Profile',
    'Sessions',
    'Safety',
    'Users',
    'Deletions',
    'Audit',
    'Flags',
    'Content',
    'Participants',
    'Messaging',
    'AiOptIn',
  ],
  endpoints: (b) => ({
    providers: b.query<{ password: boolean; google: boolean }, void>({ query: () => '/auth/providers' }),
    me: b.query<Me, void>({ query: () => '/me', providesTags: ['Me'] }),
    signup: b.mutation<Me, SignupRequest>({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
      invalidatesTags: ['Me', 'Dashboard'],
    }),
    login: b.mutation<Me, { identifier: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Me', 'Dashboard'],
    }),
    logout: b.mutation<void, void>({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),
    updateMe: b.mutation<Me, UpdateMeRequest>({
      query: (body) => ({ url: '/me', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
    changePassword: b.mutation<void, { currentPassword?: string; newPassword: string }>({
      query: (body) => ({ url: '/me/password', method: 'POST', body }),
    }),
    dashboard: b.query<Dashboard, void>({ query: () => '/dashboard', providesTags: ['Dashboard'] }),

    participantProfile: b.query<ParticipantProfile, void>({
      query: () => '/participant/profile',
      providesTags: ['Profile'],
    }),
    saveParticipantProfile: b.mutation<ParticipantProfile, ParticipantProfile>({
      query: (body) => ({ url: '/participant/profile', method: 'PUT', body }),
      invalidatesTags: ['Profile'],
    }),
    assessments: b.query<Assessment[], void>({
      query: () => '/participant/assessments',
      providesTags: ['Assessments'],
    }),
    assessment: b.query<Assessment, string>({
      query: (id) => `/participant/assessments/${id}`,
      providesTags: ['Assessments'],
    }),
    submitCheckup: b.mutation<Assessment, { key: string; body: CheckupSubmission }>({
      query: ({ key, body }) => ({
        url: '/participant/assessments',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
      }),
      invalidatesTags: ['Assessments', 'Dashboard'],
    }),
    deleteAssessment: b.mutation<void, string>({
      query: (id) => ({ url: `/participant/assessments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Assessments', 'Dashboard'],
    }),
    deletionStatus: b.query<
      { id: string; status: string; requestedAt: string; dueAt: string; completedAt: string | null } | null,
      void
    >({
      query: () => '/participant/deletion-requests/current',
      providesTags: ['Deletions'],
    }),
    requestDeletion: b.mutation<void, void>({
      query: () => ({ url: '/participant/deletion-requests', method: 'POST' }),
      invalidatesTags: ['Deletions', 'Dashboard'],
    }),

    consents: b.query<ConsentStatus, void>({
      query: () => '/participant/consents',
      providesTags: ['Consents'],
    }),
    submitConsents: b.mutation<unknown, ConsentSubmission>({
      query: (body) => ({ url: '/participant/consents', method: 'POST', body }),
      invalidatesTags: ['Consents'],
    }),
    changeConsent: b.mutation<unknown, ConsentChange>({
      query: (body) => ({ url: '/participant/consents', method: 'PUT', body }),
      invalidatesTags: ['Consents'],
    }),

    feedbackStatus: b.query<{ submitted: boolean }, void>({
      query: () => '/participant/feedback',
      providesTags: ['Feedback'],
    }),
    submitFeedback: b.mutation<{ score: number | null }, SusSubmission>({
      query: (body) => ({ url: '/participant/feedback', method: 'POST', body }),
      invalidatesTags: ['Feedback', 'Dashboard'],
    }),

    explain: b.mutation<GuideResponse, { assessmentId: string; chipId: string; language: 'en' | 'rw' }>({
      query: (body) => ({ url: '/guide/explain', method: 'POST', body }),
    }),
    guideFeedback: b.mutation<void, { requestId: string; helpful: boolean }>({
      query: (body) => ({ url: '/guide/feedback', method: 'POST', body }),
    }),
    whatsapp: b.query<WhatsAppStatus, void>({
      query: () => '/participant/whatsapp',
      providesTags: ['Messaging'],
    }),
    setWhatsApp: b.mutation<{ whatsapp: boolean }, { whatsapp: boolean }>({
      query: (body) => ({ url: '/participant/whatsapp', method: 'PUT', body }),
      invalidatesTags: ['Messaging'],
    }),
    emailReports: b.query<EmailReportStatus, void>({
      query: () => '/participant/email-reports',
      providesTags: ['Messaging'],
    }),
    setEmailReports: b.mutation<{ email: boolean }, { email: boolean }>({
      query: (body) => ({ url: '/participant/email-reports', method: 'PUT', body }),
      invalidatesTags: ['Messaging'],
    }),
    sendEmailReport: b.mutation<{ status: 'sent' | 'failed' }, { assessmentId: string }>({
      query: (body) => ({ url: '/participant/email-reports/send', method: 'POST', body }),
    }),

    aiOptIn: b.query<AiStatus, void>({
      query: () => '/participant/ai-explanations',
      providesTags: ['AiOptIn'],
    }),
    setAiOptIn: b.mutation<{ ai: boolean }, { ai: boolean }>({
      query: (body) => ({ url: '/participant/ai-explanations', method: 'PUT', body }),
      invalidatesTags: ['AiOptIn'],
    }),

    participants: b.query<ParticipantSummary[], void>({
      query: () => '/facilitator/participants',
      providesTags: ['Participants'],
    }),
    sessions: b.query<Session[], void>({ query: () => '/facilitator/sessions', providesTags: ['Sessions'] }),
    liveSession: b.query<LiveSession, string>({ query: (id) => `/facilitator/sessions/${id}/live` }),
    researchReport: b.query<ResearchReport, void>({ query: () => '/admin/research-report' }),
    createSession: b.mutation<Session, { participantId: string; deviceLabel?: string }>({
      query: (body) => ({ url: '/facilitator/sessions', method: 'POST', body }),
      invalidatesTags: ['Sessions', 'Dashboard'],
    }),
    saveTask: b.mutation<Session, { id: string; taskCode: string; outcome: string; durationSeconds: number }>(
      {
        query: ({ id, taskCode, ...body }) => ({
          url: `/facilitator/sessions/${id}/tasks/${taskCode}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: ['Sessions'],
      },
    ),
    endSession: b.mutation<Session, string>({
      query: (id) => ({ url: `/facilitator/sessions/${id}/end`, method: 'POST' }),
      invalidatesTags: ['Sessions', 'Dashboard'],
    }),
    deleteSession: b.mutation<void, string>({
      query: (id) => ({ url: `/facilitator/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Sessions', 'Dashboard'],
    }),
    safetyEvents: b.query<SafetyEventRow[], void>({
      query: () => '/facilitator/safety-events',
      providesTags: ['Safety'],
    }),
    recordSafetyEvent: b.mutation<
      { id: string },
      {
        participantId: string;
        tier: 2 | 3;
        triggerType: 'observed' | 'disclosed';
        actions: string[];
        supervisorInformedAt?: string;
      }
    >({
      query: (body) => ({ url: '/facilitator/safety-events', method: 'POST', body }),
      invalidatesTags: ['Safety', 'Dashboard'],
    }),

    users: b.query<AdminUser[], { role?: Role; search?: string }>({
      query: (params) => ({ url: '/admin/users', params }),
      providesTags: ['Users'],
    }),
    createUser: b.mutation<
      AdminUser,
      { role: Role; identifier: string; password: string; displayName?: string }
    >({
      query: (body) => ({ url: '/admin/users', method: 'POST', body }),
      invalidatesTags: ['Users', 'Dashboard', 'Participants'],
    }),
    updateUser: b.mutation<
      AdminUser,
      { id: string; role?: Role; active?: boolean; displayName?: string | null }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Users', 'Dashboard'],
    }),
    deleteUser: b.mutation<void, string>({
      query: (id) => ({ url: `/admin/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Users', 'Dashboard', 'Participants'],
    }),
    deletionRequests: b.query<DeletionRequestRow[], void>({
      query: () => '/admin/deletion-requests',
      providesTags: ['Deletions'],
    }),
    completeDeletion: b.mutation<void, string>({
      query: (id) => ({ url: `/admin/deletion-requests/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['Deletions', 'Users', 'Dashboard'],
    }),
    auditLog: b.query<AuditEntry[], void>({ query: () => '/admin/audit-log', providesTags: ['Audit'] }),
    flags: b.query<Flags, void>({ query: () => '/admin/flags', providesTags: ['Flags'] }),
    setFlag: b.mutation<Flags, { key: string; enabled: boolean }>({
      query: ({ key, enabled }) => ({ url: `/admin/flags/${key}`, method: 'PATCH', body: { enabled } }),
      invalidatesTags: ['Flags', 'Audit'],
    }),

    content: b.query<ContentVersion[], void>({ query: () => '/content', providesTags: ['Content'] }),
    createContent: b.mutation<ContentVersion, z.infer<typeof ContentCreateRequest>>({
      query: (body) => ({ url: '/content', method: 'POST', body }),
      invalidatesTags: ['Content', 'Dashboard'],
    }),
    updateContent: b.mutation<
      ContentVersion,
      { id: string; version?: string; body?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({ url: `/content/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Content'],
    }),
    deleteContent: b.mutation<void, string>({
      query: (id) => ({ url: `/content/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Content', 'Dashboard'],
    }),
    reviewContent: b.mutation<
      ContentVersion,
      { id: string; decision: 'approved' | 'changes_requested'; notes?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/content/${id}/approvals`, method: 'POST', body }),
      invalidatesTags: ['Content', 'Dashboard'],
    }),
    publishContent: b.mutation<ContentVersion, string>({
      query: (id) => ({ url: `/content/${id}/publish`, method: 'POST' }),
      invalidatesTags: ['Content', 'Dashboard'],
    }),
  }),
});

export const {
  useProvidersQuery,
  useMeQuery,
  useSignupMutation,
  useLoginMutation,
  useLogoutMutation,
  useUpdateMeMutation,
  useChangePasswordMutation,
  useDashboardQuery,
  useParticipantProfileQuery,
  useSaveParticipantProfileMutation,
  useAssessmentsQuery,
  useAssessmentQuery,
  useSubmitCheckupMutation,
  useDeleteAssessmentMutation,
  useDeletionStatusQuery,
  useConsentsQuery,
  useSubmitConsentsMutation,
  useChangeConsentMutation,
  useFeedbackStatusQuery,
  useSubmitFeedbackMutation,
  useRequestDeletionMutation,
  useExplainMutation,
  useGuideFeedbackMutation,
  useEmailReportsQuery,
  useWhatsappQuery,
  useSetWhatsAppMutation,
  useSetEmailReportsMutation,
  useSendEmailReportMutation,
  useAiOptInQuery,
  useSetAiOptInMutation,
  useParticipantsQuery,
  useSessionsQuery,
  useLiveSessionQuery,
  useResearchReportQuery,
  useCreateSessionMutation,
  useSaveTaskMutation,
  useEndSessionMutation,
  useDeleteSessionMutation,
  useSafetyEventsQuery,
  useRecordSafetyEventMutation,
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useDeletionRequestsQuery,
  useCompleteDeletionMutation,
  useAuditLogQuery,
  useFlagsQuery,
  useSetFlagMutation,
  useContentQuery,
  useCreateContentMutation,
  useUpdateContentMutation,
  useDeleteContentMutation,
  useReviewContentMutation,
  usePublishContentMutation,
} = api;
