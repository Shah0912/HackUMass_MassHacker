import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { IntakeScreen } from '@/features/intake/IntakeScreen';
import { useProjectStore } from '@/store/projectStore';

export function App() {
  const project = useProjectStore((s) => s.project);
  if (project) return <DashboardScreen project={project} />;
  return <IntakeScreen />;
}
