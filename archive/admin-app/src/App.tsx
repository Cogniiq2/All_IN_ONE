import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { RechnungenPage } from '@/pages/RechnungenPage'
import { TransaktionenPage } from '@/pages/TransaktionenPage'
import { ImmobilienPage } from '@/pages/ImmobilienPage'
import { RenovierungenPage } from '@/pages/RenovierungenPage'
import { DarlehenPage } from '@/pages/DarlehenPage'
import { NebenkostenPage } from '@/pages/NebenkostenPage'
import { BerichtePage } from '@/pages/BerichtePage'
import { KiAssistentPage } from '@/pages/KiAssistentPage'
import { EinstellungenPage } from '@/pages/EinstellungenPage'
import { EmailsPage } from '@/pages/EmailsPage'
import { ToastContainer } from '@/components/ui/Toast'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rechnungen" element={<RechnungenPage />} />
          <Route path="e-mails" element={<EmailsPage />} />
          <Route path="transaktionen" element={<TransaktionenPage />} />
          <Route path="immobilien" element={<ImmobilienPage />} />
          <Route path="renovierungen" element={<RenovierungenPage />} />
          <Route path="darlehen" element={<DarlehenPage />} />
          <Route path="nebenkosten" element={<NebenkostenPage />} />
          <Route path="berichte" element={<BerichtePage />} />
          <Route path="ki-assistent" element={<KiAssistentPage />} />
          <Route path="einstellungen" element={<EinstellungenPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}
