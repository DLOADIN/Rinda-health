import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { ReferralList } from '@/components/referral-list';
import { Card, CardContent } from '@/components/ui/card';
import { CheckupPage } from '@/features/participant/checkup-page';
import { ResultDetailPage, ResultsPage } from '@/features/participant/results-pages';
import { SusPage } from '@/features/feedback/sus-page';
import { HowResultsPage } from '@/features/results/how-results-page';

function HelpPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('help.title')} description={t('help.intro')} />
      <Card>
        <CardContent>
          <ReferralList />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ParticipantRoutes() {
  return (
    <Routes>
      <Route path="checkup" element={<CheckupPage />} />
      <Route path="results" element={<ResultsPage />} />
      <Route path="results/:id" element={<ResultDetailPage />} />
      <Route path="help" element={<HelpPage />} />
      <Route path="feedback" element={<SusPage />} />
      <Route path="how-results-work" element={<HowResultsPage />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
